import pg from 'pg';
import { Hono } from 'hono';

const { Pool } = pg;

interface ConnectionConfig {
  id: string;
  connectionString: string;
  name: string;
}

interface ConnectionPool {
  pool: pg.Pool;
  config: ConnectionConfig;
  status: 'connecting' | 'connected' | 'error' | 'disconnected';
  error?: string;
  serverInfo?: ServerInfo;
  latency?: number;
}

interface ServerInfo {
  version: string;
  user: string;
  database: string;
}

interface TestResult {
  success: boolean;
  host: string;
  port: number;
  database: string;
  latency?: number;
  serverInfo?: ServerInfo;
  error?: string;
}

const connections = new Map<string, ConnectionPool>();

function replaceHost(connectionString: string, newHost: string): string {
  try {
    const parsed = new URL(connectionString);
    parsed.hostname = newHost;
    return parsed.toString();
  } catch {
    return connectionString;
  }
}

async function testConnection(connectionString: string, timeoutMs: number = 3000): Promise<TestResult> {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    return { success: false, host: 'unknown', port: 5432, database: '', error: 'Invalid connection string' };
  }

  const host = parsed.hostname;
  const port = parseInt(parsed.port) || 5432;
  const database = parsed.pathname.slice(1) || parsed.username || 'postgres';

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try { pool.end(); } catch {}
      resolve({ success: false, host, port, database, error: 'Connection timeout' });
    }, timeoutMs);

    const pool = new Pool({
      connectionString,
      max: 1,
      connectionTimeoutMillis: timeoutMs,
    });

    pool.connect()
      .then(async (client) => {
        clearTimeout(timeout);
        const start = Date.now();
        try {
          const result = await client.query('SELECT version(), current_user, current_database()');
          const latency = Date.now() - start;
          const row = result.rows[0];
          client.release();
          await pool.end();
          resolve({
            success: true,
            host,
            port,
            database,
            latency,
            serverInfo: {
              version: row.version,
              user: row.current_user,
              database: row.current_database,
            },
          });
        } catch (err: any) {
          client.release();
          await pool.end();
          resolve({ success: false, host, port, database, error: err.message });
        }
      })
      .catch((err: any) => {
        clearTimeout(timeout);
        try { pool.end(); } catch {}
        resolve({ success: false, host, port, database, error: err.message });
      });
  });
}

async function detectDockerContainers(): Promise<Array<{
  name: string;
  port: string;
  image: string;
}>> {
  try {
    const { execSync } = await import('child_process');
    const output = execSync(
      'docker ps --format "{{.Names}}|{{.Ports}}|{{.Image}}" 2>/dev/null',
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();

    if (!output) return [];

    return output
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [name, ports, image] = line.split('|');
        const portMatch = ports.match(/0\.0\.0\.0:(\d+)->5432/);
        const port = portMatch ? portMatch[1] : null;
        
        if (!port) return null;
        
        const isPostgres = image.toLowerCase().includes('postgres');
        
        return { name, port, image, isPostgres };
      })
      .filter(Boolean)
      .filter(c => c!.isPostgres) as Array<{ name: string; port: string; image: string; isPostgres: boolean }>;
  } catch {
    return [];
  }
}

async function checkHostDockerInternal(): Promise<boolean> {
  try {
    const { execSync } = await import('child_process');
    execSync('docker run --rm --network host alpine ping -c 1 -W 1 host.docker.internal 2>/dev/null', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function detectConnections(connectionString: string): Promise<{
  type: 'local' | 'docker' | 'both' | 'error';
  local: TestResult;
  docker: TestResult;
  dockerContainer?: { name: string; port: string };
}> {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    return {
      type: 'error',
      local: { success: false, host: 'unknown', port: 5432, database: '', error: 'Invalid connection string' },
      docker: { success: false, host: 'host.docker.internal', port: 5432, database: '', error: 'Invalid connection string' },
    };
  }

  const originalHost = parsed.hostname;
  const originalPort = parsed.port || '5432';
  
  if (originalHost !== 'localhost' && originalHost !== '127.0.0.1') {
    const result = await testConnection(connectionString, 3000);
    return {
      type: result.success ? 'local' : 'error',
      local: result,
      docker: { success: false, host: 'host.docker.internal', port: 5432, database: '', error: 'Not tested' },
    };
  }

  const [localResult, dockerResult, containers, hasHostDockerInternal] = await Promise.all([
    testConnection(connectionString, 3000),
    testConnection(replaceHost(connectionString, 'host.docker.internal'), 3000),
    detectDockerContainers(),
    checkHostDockerInternal(),
  ]);

  localResult.host = 'localhost';
  dockerResult.host = 'host.docker.internal';

  const localSuccess = localResult.success;
  const dockerSuccess = dockerResult.success;

  let type: 'local' | 'docker' | 'both' | 'error';
  let dockerContainer: { name: string; port: string } | undefined;

  if (localSuccess && dockerSuccess) {
    type = 'both';
  } else if (localSuccess) {
    if (containers.length > 0) {
      const matching = containers.find(c => c.port === originalPort);
      if (matching) {
        type = 'docker';
        dockerContainer = { name: matching.name, port: matching.port };
      } else {
        type = 'local';
      }
    } else {
      type = 'local';
    }
  } else if (dockerSuccess) {
    type = 'docker';
    const matching = containers.find(c => c.port === originalPort);
    if (matching) {
      dockerContainer = { name: matching.name, port: matching.port };
    }
  } else {
    type = 'error';
  }

  return { type, local: localResult, docker: dockerResult, dockerContainer };
}

function maskPassword(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '****';
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function generateConnectionId(): string {
  return Math.random().toString(36).substring(2, 15);
}

async function connect(config: ConnectionConfig): Promise<ConnectionPool> {
  const existing = connections.get(config.id);
  if (existing?.pool) {
    await existing.pool.end();
  }

  const pool = new Pool({
    connectionString: config.connectionString,
    max: 3,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  const connectionPool: ConnectionPool = {
    pool,
    config,
    status: 'connecting',
  };

  connections.set(config.id, connectionPool);

  try {
    const start = Date.now();
    const client = await pool.connect();
    const latency = Date.now() - start;

    const result = await client.query('SELECT version(), current_user, current_database()');
    const row = result.rows[0];

    connectionPool.serverInfo = {
      version: row.version,
      user: row.current_user,
      database: row.current_database,
    };
    connectionPool.latency = latency;
    connectionPool.status = 'connected';

    client.release();
  } catch (err: any) {
    connectionPool.status = 'error';
    connectionPool.error = err.message;
    let errorMessage = err.message;
    
    if (err.message.includes('ECONNREFUSED')) {
      const parsed = new URL(config.connectionString);
      const host = parsed.hostname;
      if (host === 'localhost') {
        parsed.hostname = '127.0.0.1';
        const retryConfig = { ...config, connectionString: parsed.toString() };
        const retry = await connect(retryConfig);
        connections.set(config.id, retry);
        return retry;
      }
    }
  }

  return connectionPool;
}

async function disconnect(connectionId: string): Promise<void> {
  const conn = connections.get(connectionId);
  if (conn?.pool) {
    await conn.pool.end();
    conn.status = 'disconnected';
  }
}

function getConnection(connectionId: string): ConnectionPool | undefined {
  return connections.get(connectionId);
}

function getAllConnections(): ConnectionPool[] {
  return Array.from(connections.values());
}

function sanitizeIdentifier(identifier: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid identifier: ${identifier}`);
  }
  return identifier;
}

function buildFilterSQL(filters: any[]): { sql: string; params: any[] } {
  if (!filters || filters.length === 0) {
    return { sql: '', params: [] };
  }

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  for (const filter of filters) {
    const { column, operator, value } = filter;
    const safeColumn = sanitizeIdentifier(column);

    switch (operator) {
      case 'equals':
        conditions.push(`${safeColumn} = $${paramIndex}`);
        params.push(value);
        break;
      case 'not_equals':
        conditions.push(`${safeColumn} != $${paramIndex}`);
        params.push(value);
        break;
      case 'contains':
        conditions.push(`${safeColumn} ILIKE $${paramIndex}`);
        params.push(`%${value}%`);
        break;
      case 'starts_with':
        conditions.push(`${safeColumn} ILIKE $${paramIndex}`);
        params.push(`${value}%`);
        break;
      case 'ends_with':
        conditions.push(`${safeColumn} ILIKE $${paramIndex}`);
        params.push(`%${value}`);
        break;
      case 'is_null':
        conditions.push(`${safeColumn} IS NULL`);
        break;
      case 'is_not_null':
        conditions.push(`${safeColumn} IS NOT NULL`);
        break;
      case 'gt':
        conditions.push(`${safeColumn} > $${paramIndex}`);
        params.push(value);
        break;
      case 'lt':
        conditions.push(`${safeColumn} < $${paramIndex}`);
        params.push(value);
        break;
      case 'gte':
        conditions.push(`${safeColumn} >= $${paramIndex}`);
        params.push(value);
        break;
      case 'lte':
        conditions.push(`${safeColumn} <= $${paramIndex}`);
        params.push(value);
        break;
      case 'between':
        conditions.push(`${safeColumn} BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
        params.push(value[0], value[1]);
        paramIndex++;
        break;
      case 'json_contains_key':
        conditions.push(`${safeColumn} ? $${paramIndex}`);
        params.push(value);
        break;
      case 'array_contains':
        conditions.push(`$${paramIndex} = ANY(${safeColumn})`);
        params.push(value);
        break;
      case 'regex':
        conditions.push(`${safeColumn} ~* $${paramIndex}`);
        params.push(value);
        break;
      case 'last_n_days':
        conditions.push(`${safeColumn} >= NOW() - INTERVAL '$${paramIndex} days'`);
        params.push(value);
        break;
      default:
        conditions.push(`${safeColumn} = $${paramIndex}`);
        params.push(value);
    }
    paramIndex++;
  }

  return {
    sql: ' WHERE ' + conditions.join(' AND '),
    params,
  };
}

export {
  connect,
  disconnect,
  getConnection,
  getAllConnections,
  sanitizeIdentifier,
  buildFilterSQL,
  maskPassword,
  generateConnectionId,
  testConnection,
  detectConnections,
  replaceHost,
  ConnectionPool,
  ServerInfo,
  TestResult,
};
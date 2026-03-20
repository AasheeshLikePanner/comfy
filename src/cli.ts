import { serve } from '@hono/node-server';
import { app } from './api/server.js';
import { connect, maskPassword, generateConnectionId } from './db/client.js';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import net from 'net';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      env[key.trim()] = valueParts.join('=').trim();
    }
  }
  return env;
}

function buildFromPgVars(): string | null {
  const host = process.env.PGHOST || 'localhost';
  const port = process.env.PGPORT || '5432';
  const user = process.env.PGUSER || process.env.USER || os.userInfo().username;
  const password = process.env.PGPASSWORD || '';
  const database = process.env.PGDATABASE || user;
  const sslmode = process.env.PGSSLMODE || 'prefer';
  
  if (!host) return null;
  
  let url = `postgres://`;
  if (user) {
    url += encodeURIComponent(user);
    if (password) {
      url += `:${encodeURIComponent(password)}`;
    }
    url += '@';
  }
  url += `${host}:${port}/${database}`;
  
  const params: string[] = [];
  if (process.env.PGSSLMODE) params.push(`sslmode=${sslmode}`);
  if (process.env.PGHOST?.startsWith('/')) {
    url = `postgres://${user}${password ? ':' + password : ''}@/${database}?host=${process.env.PGHOST}`;
  }
  
  return url;
}

function findEnvFile(): string | null {
  const candidates = [
    '.env',
    '.env.local',
    '.env.development',
    '.env.production',
    '../.env',
    '../../.env',
    '../../../.env',
  ];
  
  for (const candidate of candidates) {
    const path = join(process.cwd(), candidate);
    if (existsSync(path)) {
      return path;
    }
  }
  return null;
}

function checkPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
}

async function openBrowser(url: string) {
  const { default: open } = await import('open');
  setTimeout(() => {
    open(url);
  }, 500);
}

function autoDetectConnection(): string | null {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  
  const envFile = findEnvFile();
  if (envFile) {
    const env = parseEnvFile(readFileSync(envFile, 'utf-8'));
    if (env.DATABASE_URL) return env.DATABASE_URL;
    
    if (env.PGHOST || env.PGHOST === '') {
      return buildFromPgVars();
    }
  }
  
  if (process.env.PGHOST || process.env.PGUSER || process.env.PGDATABASE) {
    return buildFromPgVars();
  }
  
  return null;
}

const PORT = parseInt(process.env.PORT || '4242');
const command = process.argv[2];
const argConnectionString = process.argv[3];

const staticApp = new Hono();

const distPath = join(__dirname, '..', 'client', 'dist');
const clientSrcPath = join(__dirname, '..', 'client', 'src');
const clientIndexPath = join(clientSrcPath, '..', 'index.html');

if (existsSync(distPath)) {
  staticApp.use('/*', serveStatic({ root: distPath }));
  staticApp.use('*', async (c, next) => {
    await next();
    if (c.res.status === 404) {
      const indexPath = join(distPath, 'index.html');
      if (existsSync(indexPath)) {
        return c.html(readFileSync(indexPath, 'utf-8'));
      }
    }
  });
} else if (existsSync(clientIndexPath)) {
  staticApp.use('*', async (c, next) => {
    await next();
    if (c.res.status === 404) {
      return c.html(readFileSync(clientIndexPath, 'utf-8'));
    }
  });
}

async function start() {
  const isRunning = await checkPortInUse(PORT);
  
  if (isRunning) {
    console.log(`
  _  _ _____ __  __ _      __  __ _____ 
 | || |_   _|  \\/  | |    |  \\/  | ____|
 | || | | | | |\\/| | |    | |\\/| |  _|
 |____| |_| |_|  | |_|    |_|  | |_|___ 
 |_____|____|_|  |_|      (_)  |____(_) 
                                             v1.0.0

 cleo is already running at http://localhost:${PORT}
 Opening browser...
`);
    await openBrowser(`http://localhost:${PORT}`);
    return;
  }
  
  const detected = autoDetectConnection();
  const connectionString = argConnectionString || detected;
  const source = argConnectionString ? 'CLI argument' : detected ? 'auto-detected' : null;
  
  console.log(`
  _  _ _____ __  __ _      __  __ _____ 
 | || |_   _|  \\/  | |    |  \\/  | ____|
 | || | | | | |\\/| | |    | |\\/| |  _|
 |____| |_| |_|  | |_|    |_|  | |_|___ 
 |_____|____|_|  |_|      (_)  |____(_) 
                                             v1.0.0

 Starting server on http://localhost:${PORT}
`);

  if (connectionString) {
    console.log(`Connecting to: ${maskPassword(connectionString)}`);
    if (source) console.log(`  (${source})`);
    
    const id = generateConnectionId();
    try {
      const conn = await connect({
        id,
        connectionString,
        name: maskPassword(connectionString),
      });

      if (conn.status === 'connected') {
        console.log(`Connected! Server info:`);
        console.log(`  Version: ${conn.serverInfo?.version}`);
        console.log(`  User: ${conn.serverInfo?.user}`);
        console.log(`  Database: ${conn.serverInfo?.database}`);
        console.log(`  Latency: ${conn.latency}ms`);
      } else {
        console.log(`Connection failed: ${conn.error}`);
      }
    } catch (err: any) {
      console.log(`Connection error: ${err.message}`);
    }
  } else {
    console.log('No connection found. I tried:');
    console.log('  • DATABASE_URL environment variable');
    console.log('  • .env file with DATABASE_URL or PG_* vars');
    console.log('  • PGHOME/PGHOST/PGUSER/PGDATABASE env vars');
    console.log('');
    console.log('You can also pass it directly:');
    console.log('  cleo postgres://user:pass@host/dbname');
    console.log('');
    console.log('Or add connections from the UI.');
  }

  const combinedApp = new Hono();

  combinedApp.use('*', cors({
    origin: ['http://localhost:4242', 'http://127.0.0.1:4242'],
    credentials: true,
  }));

  combinedApp.route('/api', app);
  combinedApp.route('/', staticApp);

  serve({
    fetch: combinedApp.fetch,
    port: PORT,
  });

  if (process.platform === 'darwin' || process.platform === 'win32') {
    await openBrowser(`http://localhost:${PORT}`);
  }
  
  console.log('Press Ctrl+C to stop');
}

async function stop() {
  const isRunning = await checkPortInUse(PORT);
  
  if (!isRunning) {
    console.log(`cleo is not running (port ${PORT} is free)`);
    return;
  }
  
  console.log(`Stopping cleo on port ${PORT}...`);
  
  const { execSync } = await import('child_process');
  let killed = false;
  
  try {
    if (process.platform === 'win32') {
      const result = execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8' });
      const lines = result.split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
          killed = true;
        }
      }
    } else {
      const output = execSync(`lsof -ti:${PORT}`, { encoding: 'utf8' });
      const pids = output.trim().split('\n').filter(p => p.trim());
      for (const pid of pids) {
        try {
          execSync(`kill ${pid.trim()}`, { stdio: 'ignore' });
          killed = true;
        } catch {}
      }
    }
  } catch {}
  
  if (killed) {
    console.log('✓ cleo stopped');
  } else {
    console.log('Could not auto-stop. Try: pkill -f cleo');
  }
}

function printHelp() {
  console.log(`
  _  _ _____ __  __ _      __  __ _____ 
 | || |_   _|  \\/  | |    |  \\/  | ____|
 | || | | | | |\\/| | |    | |\\/| |  _|
 |____| |_| |_|  | |_|    |_|  | |_|___ 
 |_____|____|_|  |_|      (_)  |____(_) 
                                             v1.0.0

 Usage:
   cleo                     Start cleo (auto-detect or open browser if running)
   cleo start              Start cleo server
   cleo start <url>         Start cleo with connection string
   cleo stop                Stop running cleo server
   cleo --help              Show this help

 Examples:
   cleo
   cleo start
   cleo start postgres://user:pass@localhost/dbname
   cleo stop
`);
}

async function main() {
  switch (command) {
    case 'stop':
      await stop();
      break;
    case 'start':
      await start();
      break;
    case '--help':
    case '-h':
      printHelp();
      break;
    default:
      if (command && !command.startsWith('-')) {
        console.log(`Unknown command: ${command}`);
        console.log(`Run 'cleo --help' for usage`);
        process.exit(1);
      }
      await start();
  }
}

main();
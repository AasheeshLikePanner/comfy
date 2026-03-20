#!/usr/bin/env bun
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
const argConnectionString = process.argv[2];

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
  const detected = autoDetectConnection();
  const connectionString = argConnectionString || detected;
  const source = argConnectionString ? 'CLI argument' : detected ? 'auto-detected' : null;
  
  console.log(`
   ____  ____  _____ 
  / __ \\/ __ \\/ ___/  v1.0.0
 / / / / / / /\\__ \\   
/ /_/ / /_/ /___/ /   
\\____/\\____//____/    

Local PostgreSQL Visualizer

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
    console.log('  dbviz postgres://user:pass@host/dbname');
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
    import('open').then(({ default: open }) => {
      setTimeout(() => {
        open(`http://localhost:${PORT}`);
      }, 500);
    });
  }
}

start();
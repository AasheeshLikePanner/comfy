import { getConnection } from '../client.js';

export async function getActivity(connectionId: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const query = `
    SELECT 
      pid,
      usename AS user_name,
      application_name,
      client_addr AS client_address,
      backend_start,
      xact_start,
      query_start,
      state,
      wait_event_type,
      wait_event,
      REPLACE(LEFT(query, 500), E'\\n', ' ') AS query,
      REPLACE(LEFT(state_change::text, 50), E'\\n', ' ') AS state_change,
      EXTRACT(EPOCH FROM (now() - query_start))::bigint AS duration_seconds,
      datname AS database
    FROM pg_stat_activity
    WHERE state IS NOT NULL OR state_change > now() - interval '5 minutes'
    ORDER BY query_start NULLS FIRST, duration_seconds DESC
  `;

  const result = await conn.pool.query(query);
  return result.rows.map((row: any) => ({
    ...row,
    is_slow: row.duration_seconds > 30 ? 'red' : row.duration_seconds > 5 ? 'yellow' : 'normal',
  }));
}

export async function terminateBackend(connectionId: string, pid: number) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const query = `SELECT pg_terminate_backend($1) AS terminated`;
  const result = await conn.pool.query(query, [pid]);
  return result.rows[0];
}

export async function getLocks(connectionId: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const query = `
    SELECT 
      l.locktype,
      l.relation::regclass AS relation,
      l.page,
      l.tuple,
      l.virtualxid AS virtual_xid,
      l.transactionid AS transaction_id,
      l.classid,
      l.objid,
      l.objsubid,
      l.pid,
      l.mode,
      l.granted,
      l.fastpath,
      a.usename AS username,
      a.query
    FROM pg_locks l
    JOIN pg_stat_activity a ON l.pid = a.pid
    ORDER BY l.granted, l.pid
  `;

  const result = await conn.pool.query(query);
  return result.rows;
}
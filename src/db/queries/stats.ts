import { getConnection } from '../client.js';

export async function getDatabaseStats(connectionId: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const query = `
    SELECT 
      current_database() AS database_name,
      pg_size_pretty(pg_database_size(current_database())) AS database_size,
      (SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database()) AS active_connections,
      (SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database()) AS total_connections
  `;

  const result = await conn.pool.query(query);
  return result.rows[0];
}

export async function getCacheHitRatio(connectionId: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const query = `
    SELECT 
      blks_hit AS heap_blocks_hit,
      blks_read AS heap_blocks_read,
      CASE 
        WHEN blks_read + blks_hit > 0 
        THEN (blks_hit::numeric / (blks_hit + blks_read)) * 100 
        ELSE 100 
      END AS hit_ratio
    FROM pg_stat_database
    WHERE datname = current_database()
  `;

  const result = await conn.pool.query(query);
  return result.rows[0];
}

export async function getTableSizes(connectionId: string, limit: number = 20) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const query = `
    SELECT 
      schemaname,
      relname AS table_name,
      pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
      pg_size_pretty(pg_relation_size(relid)) AS table_size,
      pg_size_pretty(pg_indexes_size(relid)) AS index_size,
      n_live_tup AS row_count_estimate
    FROM pg_stat_user_tables
    ORDER BY pg_total_relation_size(relid) DESC
    LIMIT $1
  `;

  const result = await conn.pool.query(query, [limit]);
  return result.rows;
}
import { getConnection, sanitizeIdentifier } from '../client.js';

export async function getTableIndexes(connectionId: string, schema: string, table: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const query = `
    SELECT 
      i.relname AS index_name,
      am.amname AS index_type,
      ix.indisunique AS is_unique,
      ix.indisprimary AS is_primary,
      pg_get_indexdef(ix.indexrelid) AS definition,
      pg_size_pretty(pg_relation_size(ix.indexrelid)) AS index_size,
      s.idx_scan AS scan_count,
      s.idx_tup_read AS tuples_read,
      s.idx_tup_fetch AS tuples_fetched,
      array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) AS columns,
      pg_get_expr(ix.indpred, ix.indrelid) AS partial_condition
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace ns ON ns.oid = t.relnamespace
    JOIN pg_am am ON am.oid = i.relam
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
    LEFT JOIN pg_stat_user_indexes s ON s.relid = ix.indexrelid
    WHERE ns.nspname = $1 AND t.relname = $2
    GROUP BY i.relname, am.amname, ix.indisunique, ix.indisprimary, 
             ix.indexrelid, s.idx_scan, s.idx_tup_read, s.idx_tup_fetch, ix.indpred
    ORDER BY i.relname
  `;

  const result = await conn.pool.query(query, [schema, table]);
  return result.rows;
}

export async function getTableConstraints(connectionId: string, schema: string, table: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const query = `
    SELECT 
      con.conname AS constraint_name,
      con.contype AS constraint_type,
      pg_get_constraintdef(con.oid) AS definition,
      array_agg(a.attname ORDER BY array_position(con.conkey, a.attnum)) FILTER (WHERE a.attnum IS NOT NULL) AS columns,
      ref_tb.relname AS referenced_table,
      ref_ns.nspname AS referenced_schema,
      array_agg(ref_a.attname ORDER BY array_position(con.confkey, ref_a.attnum)) FILTER (WHERE ref_a.attnum IS NOT NULL) AS referenced_columns,
      con.confdeltype AS on_delete,
      con.confupdtype AS on_update
    FROM pg_constraint con
    JOIN pg_class t ON t.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = t.relnamespace
    LEFT JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
    LEFT JOIN pg_class ref_tb ON ref_tb.oid = con.confrelid
    LEFT JOIN pg_namespace ref_ns ON ref_ns.oid = ref_tb.relnamespace
    LEFT JOIN pg_attribute ref_a ON ref_a.attrelid = con.confrelid AND ref_a.attnum = ANY(con.confkey)
    WHERE ns.nspname = $1 AND t.relname = $2
    GROUP BY con.conname, con.contype, con.oid, ref_tb.relname, ref_ns.nspname, con.confdeltype, con.confupdtype
    ORDER BY con.conname
  `;

  const result = await conn.pool.query(query, [schema, table]);
  return result.rows;
}

export async function getTableTriggers(connectionId: string, schema: string, table: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const query = `
    SELECT 
      t.tgname AS trigger_name,
      p.proname AS function_name,
      n.nspname AS function_schema,
      t.tgtype AS event_manipulation,
      t.tgenabled AS is_enabled,
      pg_get_triggerdef(t.oid) AS definition,
      pg_get_expr(t.tgqual, t.tgrelid) AS condition
    FROM pg_trigger t
    JOIN pg_proc p ON t.tgfoid = p.oid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = $1 AND c.relname = $2 AND NOT t.tgisinternal
    ORDER BY t.tgname
  `;

  const result = await conn.pool.query(query, [schema, table]);
  return result.rows.map((row: any) => ({
    ...row,
    timing: (row.event_manipulation & 64) ? 'BEFORE' : (row.event_manipulation & 128) ? 'AFTER' : 'INSTEAD OF',
    level: (row.event_manipulation & 1) ? 'ROW' : 'STATEMENT',
    events: [
      (row.event_manipulation & 4) ? 'INSERT' : null,
      (row.event_manipulation & 8) ? 'UPDATE' : null,
      (row.event_manipulation & 16) ? 'DELETE' : null,
      (row.event_manipulation & 32) ? 'TRUNCATE' : null,
    ].filter(Boolean).join(', '),
  }));
}

export async function getTableForeignKeys(connectionId: string, schema: string, table: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const query = `
    SELECT 
      con.conname AS constraint_name,
      array_agg(a.attname ORDER BY array_position(con.conkey, a.attnum)) AS columns,
      ref_tb.relname AS referenced_table,
      ref_ns.nspname AS referenced_schema,
      array_agg(ref_a.attname ORDER BY array_position(con.confkey, ref_a.attnum)) AS referenced_columns,
      CASE con.confdeltype
        WHEN 'a' THEN 'NO ACTION'
        WHEN 'r' THEN 'RESTRICT'
        WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
      END AS on_delete,
      CASE con.confupdtype
        WHEN 'a' THEN 'NO ACTION'
        WHEN 'r' THEN 'RESTRICT'
        WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
      END AS on_update
    FROM pg_constraint con
    JOIN pg_class t ON t.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
    JOIN pg_class ref_tb ON ref_tb.oid = con.confrelid
    JOIN pg_namespace ref_ns ON ref_ns.oid = ref_tb.relnamespace
    JOIN pg_attribute ref_a ON ref_a.attrelid = con.confrelid AND ref_a.attnum = ANY(con.confkey)
    WHERE ns.nspname = $1 AND t.relname = $2 AND con.contype = 'f'
    GROUP BY con.conname, ref_tb.relname, ref_ns.nspname, con.confdeltype, con.confupdtype
  `;

  const result = await conn.pool.query(query, [schema, table]);
  return result.rows;
}

export async function getReferencingForeignKeys(connectionId: string, schema: string, table: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const query = `
    SELECT 
      con.conname AS constraint_name,
      t.relname AS referencing_table,
      ns.nspname AS referencing_schema,
      array_agg(a.attname ORDER BY array_position(con.conkey, a.attnum)) AS columns,
      array_agg(ref_a.attname ORDER BY array_position(con.confkey, ref_a.attnum)) AS referenced_columns
    FROM pg_constraint con
    JOIN pg_class t ON t.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
    JOIN pg_class ref_tb ON ref_tb.oid = con.confrelid
    JOIN pg_attribute ref_a ON ref_a.attrelid = con.confrelid AND ref_a.attnum = ANY(con.confkey)
    WHERE ref_tb.relname = $1 AND ns.nspname = $2 AND con.contype = 'f'
    GROUP BY con.conname, t.relname, ns.nspname
  `;

  const result = await conn.pool.query(query, [table, schema]);
  return result.rows;
}

export async function getTableStats(connectionId: string, schema: string, table: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const query = `
    SELECT 
      s.seq_scan AS sequential_scans,
      s.seq_tup_read AS sequential_tuples_read,
      s.idx_scan AS index_scans,
      s.idx_tup_fetch AS index_tuples_fetched,
      s.n_tup_ins AS rows_inserted,
      s.n_tup_upd AS rows_updated,
      s.n_tup_del AS rows_deleted,
      s.n_hot_upd AS hot_updated,
      s.n_live_tup AS live_row_count,
      s.n_dead_tup AS dead_row_count,
      s.last_vacuum AS last_vacuum,
      s.last_autovacuum AS last_autovacuum,
      s.last_analyze AS last_analyze,
      s.last_autoanalyze AS last_autoanalyze,
      pg_size_pretty(pg_total_relation_size(s.relid)) AS total_size,
      pg_size_pretty(pg_relation_size(s.relid)) AS table_size,
      pg_size_pretty(pg_indexes_size(s.relid)) AS indexes_size
    FROM pg_stat_user_tables s
    JOIN pg_class c ON c.oid = s.relid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = $1 AND c.relname = $2
  `;

  const result = await conn.pool.query(query, [schema, table]);
  return result.rows[0] || null;
}
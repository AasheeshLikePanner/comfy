import { getConnection } from '../client.js';

interface JoinPath {
  tables: string[];
  columns: string[];
  path: string;
  hops: number;
}

export async function getJoinableTables(connectionId: string, schema: string, table: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const outgoingQuery = `
    SELECT DISTINCT
      ref_ns.nspname AS referenced_schema,
      ref_tb.relname AS referenced_table,
      'outgoing' AS direction,
      array_agg(a.attname ORDER BY array_position(con.conkey, a.attnum)) AS local_columns,
      array_agg(ref_a.attname ORDER BY array_position(con.confkey, ref_a.attnum)) AS referenced_columns,
      con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class t ON t.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
    JOIN pg_class ref_tb ON ref_tb.oid = con.confrelid
    JOIN pg_namespace ref_ns ON ref_ns.oid = ref_tb.relnamespace
    JOIN pg_attribute ref_a ON ref_a.attrelid = con.confrelid AND ref_a.attnum = ANY(con.confkey)
    WHERE ns.nspname = $1 AND t.relname = $2 AND con.contype = 'f'
    GROUP BY ref_ns.nspname, ref_tb.relname, con.conname
  `;

  const incomingQuery = `
    SELECT DISTINCT
      ns.nspname AS referenced_schema,
      t.relname AS referenced_table,
      'incoming' AS direction,
      array_agg(ref_a.attname ORDER BY array_position(con.confkey, ref_a.attnum)) AS local_columns,
      array_agg(a.attname ORDER BY array_position(con.conkey, a.attnum)) AS referenced_columns,
      con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class t ON t.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
    JOIN pg_class ref_tb ON ref_tb.oid = con.confrelid
    JOIN pg_attribute ref_a ON ref_a.attrelid = con.confrelid AND ref_a.attnum = ANY(con.confkey)
    WHERE ref_tb.relname = $1 AND ns.nspname = $2 AND con.contype = 'f'
    GROUP BY ns.nspname, t.relname, con.conname
  `;

  const [outgoingResult, incomingResult] = await Promise.all([
    conn.pool.query(outgoingQuery, [schema, table]),
    conn.pool.query(incomingQuery, [table, schema]),
  ]);

  return {
    outgoing: outgoingResult.rows,
    incoming: incomingResult.rows,
  };
}

export async function buildJoinQuery(
  connectionId: string,
  baseSchema: string,
  baseTable: string,
  joins: Array<{
    schema: string;
    table: string;
    columns: string[];
    referencedColumns: string[];
    joinType: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  }>
) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const allColumnsQueryParts: string[] = [
    `SELECT table_schema, table_name, column_name`,
    `FROM information_schema.columns`,
    `WHERE (table_schema = $1 AND table_name = $2)`
  ];
  const params: any[] = [baseSchema, baseTable];
  let paramIndex = 3;

  for (const join of joins) {
    allColumnsQueryParts.push(`OR (table_schema = $${paramIndex++} AND table_name = $${paramIndex++})`);
    params.push(join.schema, join.table);
  }

  const columnsResult = await conn.pool.query(allColumnsQueryParts.join(' '), params);
  
  const allColumns = new Map<string, string[]>();
  for (const row of columnsResult.rows) {
    const key = `${row.table_schema}.${row.table_name}`;
    if (!allColumns.has(key)) {
      allColumns.set(key, []);
    }
    allColumns.get(key)!.push(row.column_name);
  }

  let sql = `SELECT * FROM ${baseSchema}.${baseTable}`;
  const joinParams: any[] = [];

  for (const join of joins) {
    const joinType = join.joinType || 'LEFT';
    const conditions = join.columns.map((col, i) => 
      `${join.schema}.${join.table}.${col} = ${baseSchema}.${baseTable}.${join.referencedColumns[i]}`
    ).join(' AND ');

    sql += ` ${joinType} JOIN ${join.schema}.${join.table} ON ${conditions}`;
  }

  return { sql, columns: allColumns };
}

export async function executeJoinQuery(
  connectionId: string,
  baseSchema: string,
  baseTable: string,
  joins: Array<{
    schema: string;
    table: string;
    columns: string[];
    referencedColumns: string[];
    joinType: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  }>,
  options: {
    limit?: number;
    offset?: number;
  } = {}
) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const { sql: baseQuery, columns } = await buildJoinQuery(connectionId, baseSchema, baseTable, joins);
  
  let sql = `SELECT * FROM (${baseQuery}) AS joined`;
  
  if (options.limit) {
    sql += ` LIMIT ${options.limit}`;
  }
  
  if (options.offset) {
    sql += ` OFFSET ${options.offset}`;
  }

  const result = await conn.pool.query(sql);
  
  return {
    rows: result.rows,
    total: result.rowCount || 0,
    columns: columns,
  };
}
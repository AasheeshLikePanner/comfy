import { getConnection } from '../client.js';

export async function getFunctions(connectionId: string, schema?: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  let query = `
    SELECT 
      n.nspname AS schema,
      p.proname AS function_name,
      pg_get_function_result(p.oid) AS return_type,
      pg_get_function_arguments(p.oid) AS arguments,
      l.lanname AS language,
      p.proisagg AS is_aggregate,
      p.proiswindow AS is_window,
      p.proisstrict AS is_strict,
      p.prosecdef AS is_security_definer,
      p.prorows AS estimated_rows,
      obj_description(p.oid, 'pg_proc') AS description,
      CASE WHEN p.prokind = 'p' THEN true ELSE false END AS is_procedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE p.prokind IN ('f', 'p')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  `;

  const params: any[] = [];
  if (schema) {
    query += ` AND n.nspname = $1`;
    params.push(schema);
  }

  query += ` ORDER BY n.nspname, p.proname`;

  const result = await conn.pool.query(query, params);
  return result.rows;
}

export async function getFunctionDefinition(connectionId: string, schema: string, functionName: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const query = `
    SELECT pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = $1 AND p.proname = $2
  `;

  const result = await conn.pool.query(query, [schema, functionName]);
  return result.rows[0]?.definition || '';
}

export async function executeFunction(
  connectionId: string,
  schema: string,
  functionName: string,
  args: any[]
) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const placeholders = args.map((_, i) => `$${i + 1}`).join(', ');
  const query = `SELECT * FROM ${schema}.${functionName}(${placeholders})`;

  const result = await conn.pool.query(query, args);
  return result.rows;
}
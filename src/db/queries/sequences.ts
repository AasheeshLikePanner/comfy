import { getConnection } from '../client.js';

export async function getSequences(connectionId: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const query = `
    SELECT 
      n.nspname AS schema,
      s.relname AS sequence_name,
      last_value AS current_value,
      start_value,
      minimum_value AS min_value,
      maximum_value AS max_value,
      increment_by,
      cycle AS is_cycled,
      data_type AS sequence_type
    FROM pg_class c
    JOIN pg_sequence s ON s.seqrelid = c.oid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN LATERAL (
      SELECT a.attname AS column_name
      FROM pg_depend d
      JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
      WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass
    ) col ON true
    ORDER BY n.nspname, s.relname
  `;

  const result = await conn.pool.query(query);
  return result.rows;
}

export async function getNextSequenceValue(connectionId: string, schema: string, sequenceName: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const result = await conn.pool.query(`SELECT nextval('${schema}.${sequenceName}')`);
  return result.rows[0].nextval;
}
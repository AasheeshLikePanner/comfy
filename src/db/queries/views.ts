import { getConnection } from '../client.js';

export async function getViews(connectionId: string, schema?: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  let query = `
    SELECT 
      n.nspname AS schema,
      c.relname AS view_name,
      c.relkind AS view_type,
      obj_description(c.oid, 'pg_class') AS description,
      pg_get_userbyid(c.relowner) AS owner
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('v', 'm')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  `;

  const params: any[] = [];
  if (schema) {
    query += ` AND n.nspname = $1`;
    params.push(schema);
  }

  query += ` ORDER BY n.nspname, c.relname`;

  const result = await conn.pool.query(query, params);
  
  const views = result.rows.map((row: any) => ({
    ...row,
    is_materialized: row.view_type === 'm',
  }));

  if (schema) {
    const materializedViews = views.filter((v: any) => v.is_materialized);
    for (const view of materializedViews) {
      const refreshQuery = `
        SELECT last_refreshed 
        FROM pg_matviews 
        WHERE schemaname = $1 AND matviewname = $2
      `;
      const refreshResult = await conn.pool.query(refreshQuery, [schema, view.view_name]);
      if (refreshResult.rows[0]) {
        view.last_refresh = refreshResult.rows[0].last_refreshed;
      }
    }
  }

  return views;
}

export async function getViewDefinition(connectionId: string, schema: string, viewName: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const query = `
    SELECT pg_get_viewdef($1 || '.' || $2, true) AS definition
  `;

  const result = await conn.pool.query(query, [schema, viewName]);
  return result.rows[0]?.definition || '';
}

export async function refreshMaterializedView(connectionId: string, schema: string, viewName: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  await conn.pool.query(`REFRESH MATERIALIZED VIEW ${schema}.${viewName}`);
  return { success: true };
}
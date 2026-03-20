import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { getAllConnections, connect, disconnect, getConnection, maskPassword, generateConnectionId, buildFilterSQL, detectConnections, replaceHost } from '../db/client.js';
import * as tables from '../db/queries/tables.js';
import * as schema from '../db/queries/schema.js';
import * as views from '../db/queries/views.js';
import * as functions from '../db/queries/functions.js';
import * as sequences from '../db/queries/sequences.js';
import * as roles from '../db/queries/roles.js';
import * as activity from '../db/queries/activity.js';
import * as stats from '../db/queries/stats.js';
import * as joins from '../db/queries/joins.js';

const app = new Hono();

app.use('*', cors({
  origin: ['http://localhost:4242', 'http://127.0.0.1:4242', 'http://localhost:5173'],
  credentials: true,
}));

app.get('/', (c) => {
  return c.json({ 
    name: 'dbviz', 
    version: '1.0.0',
    status: 'running' 
  });
});

app.post('/connections/detect', async (c) => {
  const { connectionString } = await c.req.json();
  
  if (!connectionString) {
    return c.json({ error: 'Connection string required' }, 400);
  }

  try {
    const results = await detectConnections(connectionString);
    return c.json(results);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post('/connections/connect', async (c) => {
  const { connectionString, name } = await c.req.json();
  
  if (!connectionString) {
    return c.json({ error: 'Connection string required' }, 400);
  }

  const id = generateConnectionId();
  const config = {
    id,
    connectionString,
    name: name || maskPassword(connectionString),
  };

  try {
    const conn = await connect(config);
    
    if (conn.status === 'error') {
      return c.json({ 
        error: conn.error,
        id,
      }, 400);
    }

    return c.json({
      id,
      name: config.name,
      serverInfo: conn.serverInfo,
      latency: conn.latency,
      status: conn.status,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post('/connections', async (c) => {
  const { connectionString, name } = await c.req.json();
  
  if (!connectionString) {
    return c.json({ error: 'Connection string required' }, 400);
  }

  const id = generateConnectionId();
  const config = {
    id,
    connectionString,
    name: name || maskPassword(connectionString),
  };

  try {
    const conn = await connect(config);
    if (conn.status === 'error') {
      return c.json({ 
        error: conn.error,
        id,
      }, 400);
    }

    return c.json({
      id,
      name: config.name,
      serverInfo: conn.serverInfo,
      latency: conn.latency,
      status: conn.status,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.delete('/connections/:id', async (c) => {
  const id = c.req.param('id');
  await disconnect(id);
  return c.json({ success: true });
});

app.get('/connections', (c) => {
  const connections = getAllConnections().map(conn => ({
    id: conn.config.id,
    name: conn.config.name,
    maskedUrl: maskPassword(conn.config.connectionString),
    status: conn.status,
    error: conn.error,
    serverInfo: conn.serverInfo,
    latency: conn.latency,
  }));
  return c.json(connections);
});

app.get('/info/:connectionId', async (c) => {
  const connectionId = c.req.param('connectionId');
  const conn = getConnection(connectionId);
  
  if (!conn) {
    return c.json({ error: 'Connection not found' }, 404);
  }

  return c.json({
    serverInfo: conn.serverInfo,
    latency: conn.latency,
    permissions: await roles.getCurrentUserPermissions(connectionId),
  });
});

app.get('/objects/:connectionId', async (c) => {
  const connectionId = c.req.param('connectionId');
  const conn = getConnection(connectionId);
  
  if (!conn) {
    return c.json({ error: 'Connection not found' }, 404);
  }

  try {
    const schemasResult = await conn.pool.query(`
      SELECT DISTINCT nspname AS name 
      FROM pg_namespace 
      WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY nspname
    `);

    const objects = [];
    for (const schemaRow of schemasResult.rows) {
      const schemaName = schemaRow.name;
      
      const [tablesResult, viewsResult, functionsResult, sequencesResult] = await Promise.all([
        conn.pool.query(`
          SELECT c.relname AS name, 'table' AS type,
                 COALESCE(s.n_live_tup, 0)::bigint AS row_count
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
          WHERE c.relkind = 'r' AND n.nspname = $1
          ORDER BY c.relname
        `, [schemaName]),
        conn.pool.query(`
          SELECT c.relname AS name, 
                 CASE WHEN c.relkind = 'm' THEN 'materialized_view' ELSE 'view' END AS type,
                 0 AS row_count
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind IN ('v', 'm') AND n.nspname = $1
          ORDER BY c.relname
        `, [schemaName]),
        conn.pool.query(`
          SELECT p.proname AS name, 'function' AS type
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE p.prokind IN ('f', 'p') AND n.nspname = $1
          GROUP BY p.proname
          ORDER BY p.proname
        `, [schemaName]),
        conn.pool.query(`
          SELECT c.relname AS name, 'sequence' AS type
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind = 'S' AND n.nspname = $1
          ORDER BY c.relname
        `, [schemaName]),
      ]);

      objects.push({
        name: schemaName,
        type: 'schema',
        children: [
          {
            name: 'Tables',
            type: 'category',
            count: tablesResult.rows.length,
            children: tablesResult.rows,
          },
          {
            name: 'Views',
            type: 'category',
            count: viewsResult.rows.length,
            children: viewsResult.rows,
          },
          {
            name: 'Functions',
            type: 'category',
            count: functionsResult.rows.length,
            children: functionsResult.rows,
          },
          {
            name: 'Sequences',
            type: 'category',
            count: sequencesResult.rows.length,
            children: sequencesResult.rows,
          },
        ],
      });
    }

    return c.json(objects);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/tables/:connectionId', async (c) => {
  const connectionId = c.req.param('connectionId');
  const schemaName = c.req.query('schema');
  
  try {
    const result = await tables.getTables(connectionId, schemaName);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/tables/:connectionId/:schema/:table/rows', async (c) => {
  const { connectionId, schema, table } = c.req.param();
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const orderBy = c.req.query('orderBy');
  const orderDir = c.req.query('orderDir') as 'ASC' | 'DESC' || 'ASC';
  const search = c.req.query('search');
  const filters = c.req.query('filters') ? JSON.parse(c.req.query('filters')!) : undefined;

  try {
    const result = await tables.getTableRows(connectionId, schema, table, {
      limit,
      offset,
      orderBy,
      orderDir,
      search,
      filters,
    });
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/tables/:connectionId/:schema/:table/schema', async (c) => {
  const { connectionId, schema: schemaName, table } = c.req.param();
  
  try {
    const [columns, indexes, constraints, triggers] = await Promise.all([
      tables.getTableColumns(connectionId, schemaName, table),
      schema.getTableIndexes(connectionId, schemaName, table),
      schema.getTableConstraints(connectionId, schemaName, table),
      schema.getTableTriggers(connectionId, schemaName, table),
    ]);

    return c.json({ columns, indexes, constraints, triggers });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/tables/:connectionId/:schema/:table/stats', async (c) => {
  const { connectionId, schema: schemaName, table } = c.req.param();
  
  try {
    const result = await schema.getTableStats(connectionId, schemaName, table);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/tables/:connectionId/:schema/:table/primary-key', async (c) => {
  const { connectionId, schema: schemaName, table } = c.req.param();
  
  try {
    const result = await tables.getPrimaryKey(connectionId, schemaName, table);
    return c.json({ primaryKey: result });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post('/tables/:connectionId/:schema/:table/rows', async (c) => {
  const { connectionId, schema: schemaName, table } = c.req.param();
  const data = await c.req.json();
  
  if (!data || Object.keys(data).length === 0) {
    return c.json({ error: 'No data provided' }, 400);
  }
  
  try {
    const result = await tables.insertRow(connectionId, schemaName, table, data);
    return c.json(result);
  } catch (err: any) {
    return c.json({ 
      error: err.message,
      detail: err.detail,
      hint: err.hint,
    }, 400);
  }
});

app.put('/tables/:connectionId/:schema/:table/rows', async (c) => {
  const { connectionId, schema: schemaName, table } = c.req.param();
  const { primaryKey, data } = await c.req.json();
  
  if (!primaryKey || !primaryKey.column || primaryKey.value === undefined) {
    return c.json({ error: 'Primary key column and value required' }, 400);
  }
  
  if (!data || Object.keys(data).length === 0) {
    return c.json({ error: 'No data to update' }, 400);
  }
  
  try {
    const result = await tables.updateRow(connectionId, schemaName, table, primaryKey, data);
    return c.json(result);
  } catch (err: any) {
    return c.json({ 
      error: err.message,
      detail: err.detail,
      hint: err.hint,
    }, 400);
  }
});

app.delete('/tables/:connectionId/:schema/:table/rows', async (c) => {
  const { connectionId, schema: schemaName, table } = c.req.param();
  const primaryKeys = await c.req.json();
  
  if (!primaryKeys || primaryKeys.length === 0) {
    return c.json({ error: 'No rows selected for deletion' }, 400);
  }
  
  try {
    const result = await tables.deleteRows(connectionId, schemaName, table, primaryKeys);
    return c.json(result);
  } catch (err: any) {
    return c.json({ 
      error: err.message,
      detail: err.detail,
      hint: err.hint,
    }, 400);
  }
});

app.get('/tables/:connectionId/:schema/:table/foreign-keys', async (c) => {
  const { connectionId, schema: schemaName, table } = c.req.param();
  
  try {
    const [outgoing, incoming] = await Promise.all([
      schema.getTableForeignKeys(connectionId, schemaName, table),
      schema.getReferencingForeignKeys(connectionId, schemaName, table),
    ]);
    return c.json({ outgoing, incoming });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/views/:connectionId', async (c) => {
  const connectionId = c.req.param('connectionId');
  const schemaName = c.req.query('schema');
  
  try {
    const result = await views.getViews(connectionId, schemaName);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/views/:connectionId/:schema/:view/definition', async (c) => {
  const { connectionId, schema: schemaName, view } = c.req.param();
  
  try {
    const definition = await views.getViewDefinition(connectionId, schemaName, view);
    return c.json({ definition });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post('/views/:connectionId/:schema/:view/refresh', async (c) => {
  const { connectionId, schema: schemaName, view } = c.req.param();
  
  try {
    const result = await views.refreshMaterializedView(connectionId, schemaName, view);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/functions/:connectionId', async (c) => {
  const connectionId = c.req.param('connectionId');
  const schemaName = c.req.query('schema');
  
  try {
    const result = await functions.getFunctions(connectionId, schemaName);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/functions/:connectionId/:schema/:func/definition', async (c) => {
  const { connectionId, schema: schemaName, func } = c.req.param();
  
  try {
    const definition = await functions.getFunctionDefinition(connectionId, schemaName, func);
    return c.json({ definition });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post('/functions/:connectionId/:schema/:func/execute', async (c) => {
  const { connectionId, schema: schemaName, func } = c.req.param();
  const args = await c.req.json();
  
  try {
    const result = await functions.executeFunction(connectionId, schemaName, func, args);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/sequences/:connectionId', async (c) => {
  const connectionId = c.req.param('connectionId');
  
  try {
    const result = await sequences.getSequences(connectionId);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/roles/:connectionId', async (c) => {
  const connectionId = c.req.param('connectionId');
  
  try {
    const result = await roles.getRoles(connectionId);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/activity/:connectionId', async (c) => {
  const connectionId = c.req.param('connectionId');
  
  try {
    const result = await activity.getActivity(connectionId);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post('/activity/:connectionId/terminate/:pid', async (c) => {
  const { connectionId, pid } = c.req.param();
  
  try {
    const result = await activity.terminateBackend(connectionId, parseInt(pid));
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/stats/:connectionId', async (c) => {
  const connectionId = c.req.param('connectionId');
  
  try {
    const [database, cacheHitRatio, tableSizes] = await Promise.all([
      stats.getDatabaseStats(connectionId),
      stats.getCacheHitRatio(connectionId),
      stats.getTableSizes(connectionId),
    ]);
    return c.json({ database, cacheHitRatio, tableSizes });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/joins/:connectionId/:schema/:table', async (c) => {
  const { connectionId, schema: schemaName, table } = c.req.param();
  
  try {
    const result = await joins.getJoinableTables(connectionId, schemaName, table);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post('/joins/:connectionId/:schema/:table/execute', async (c) => {
  const { connectionId, schema: schemaName, table } = c.req.param();
  const body = await c.req.json();
  
  try {
    const result = await joins.executeJoinQuery(connectionId, schemaName, table, body.joins, {
      limit: body.limit || 100,
      offset: body.offset || 0,
    });
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post('/query/:connectionId', async (c) => {
  const connectionId = c.req.param('connectionId');
  const conn = getConnection(connectionId);
  
  if (!conn) {
    return c.json({ error: 'Connection not found' }, 404);
  }

  const { sql, params } = await c.req.json();
  
  if (!sql) {
    return c.json({ error: 'SQL query required' }, 400);
  }

  try {
    const start = Date.now();
    const result = await conn.pool.query(sql, params || []);
    const duration = Date.now() - start;

    return c.json({
      rows: result.rows,
      rowCount: result.rowCount,
      fields: result.fields.map(f => ({ name: f.name, dataTypeID: f.dataTypeID })),
      duration,
    });
  } catch (err: any) {
    return c.json({
      error: err.message,
      detail: err.detail,
      hint: err.hint,
      position: err.position,
      line: err.line,
      column: err.column,
    }, 400);
  }
});

app.get('/search/:connectionId', async (c) => {
  const connectionId = c.req.param('connectionId');
  const query = c.req.query('q');
  
  if (!query) {
    return c.json({ results: [] });
  }

  const conn = getConnection(connectionId);
  if (!conn) {
    return c.json({ error: 'Connection not found' }, 404);
  }

  try {
    const searchPattern = `%${query.toLowerCase()}%`;
    
    const [tablesResult, columnsResult, viewsResult, functionsResult] = await Promise.all([
      conn.pool.query(`
        SELECT DISTINCT t.relname AS name, 'table' AS type, n.nspname AS schema
        FROM pg_class t
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE t.relkind = 'r' 
          AND n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND LOWER(t.relname) LIKE $1
        LIMIT 20
      `, [searchPattern]),
      conn.pool.query(`
        SELECT DISTINCT c.column_name AS name, 'column' AS type, 
               t.relname AS parent_table, n.nspname AS schema
        FROM pg_attribute a
        JOIN pg_class t ON t.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN information_schema.columns c ON c.table_name = t.relname AND c.column_name = a.attname
        WHERE a.attnum > 0
          AND n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND LOWER(a.attname) LIKE $1
        LIMIT 20
      `, [searchPattern]),
      conn.pool.query(`
        SELECT DISTINCT v.relname AS name, 'view' AS type, n.nspname AS schema
        FROM pg_class v
        JOIN pg_namespace n ON n.oid = v.relnamespace
        WHERE v.relkind IN ('v', 'm')
          AND n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND LOWER(v.relname) LIKE $1
        LIMIT 10
      `, [searchPattern]),
      conn.pool.query(`
        SELECT DISTINCT p.proname AS name, 'function' AS type, n.nspname AS schema
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.prokind IN ('f', 'p')
          AND n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND LOWER(p.proname) LIKE $1
        LIMIT 10
      `, [searchPattern]),
    ]);

    return c.json({
      results: [
        ...tablesResult.rows,
        ...columnsResult.rows,
        ...viewsResult.rows,
        ...functionsResult.rows,
      ],
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export { app };
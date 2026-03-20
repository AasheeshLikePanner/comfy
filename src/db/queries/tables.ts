import { getConnection, sanitizeIdentifier } from '../client.js';

export async function getTables(connectionId: string, schema?: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  let query = `
    SELECT 
      n.nspname AS schema,
      c.relname AS table_name,
      obj_description(c.oid, 'pg_class') AS description,
      pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
      COALESCE(s.n_live_tup, 0)::bigint AS row_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE c.relkind = 'r' 
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  `;

  const params: any[] = [];
  if (schema) {
    query += ` AND n.nspname = $1`;
    params.push(schema);
  }

  query += ` ORDER BY n.nspname, c.relname`;

  const result = await conn.pool.query(query, params);
  return result.rows;
}

export async function getTableRows(
  connectionId: string,
  schema: string,
  table: string,
  options: {
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDir?: 'ASC' | 'DESC';
    search?: string;
    filters?: any[];
    columns?: string[];
  } = {}
) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const safeSchema = sanitizeIdentifier(schema);
  const safeTable = sanitizeIdentifier(table);

  let columnsSelect = '*';
  if (options.columns && options.columns.length > 0) {
    columnsSelect = options.columns.map(c => sanitizeIdentifier(c)).join(', ');
  }

  const queryParams: any[] = [];
  let paramIndex = 1;
  const whereConditions: string[] = [];

  // Handle Search
  if (options.search) {
    const colsResult = await conn.pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = $1 AND table_name = $2 
       AND data_type IN ('character varying', 'varchar', 'text', 'uuid')`,
      [schema, table]
    );
    
    if (colsResult.rows.length > 0) {
      const searchTerms = colsResult.rows.map((col: any) => {
        return `CAST(${sanitizeIdentifier(col.column_name)} AS TEXT) ILIKE $${paramIndex}`;
      });
      whereConditions.push(`(${searchTerms.join(' OR ')})`);
      queryParams.push(`%${options.search}%`);
      paramIndex++;
    }
  }

  // Handle Filters
  if (options.filters && options.filters.length > 0) {
    for (const filter of options.filters) {
      const safeColumn = sanitizeIdentifier(filter.column);
      switch (filter.operator) {
        case 'equals':
          whereConditions.push(`${safeColumn} = $${paramIndex++}`);
          queryParams.push(filter.value);
          break;
        case 'not_equals':
          whereConditions.push(`${safeColumn} != $${paramIndex++}`);
          queryParams.push(filter.value);
          break;
        case 'contains':
          whereConditions.push(`${safeColumn} ILIKE $${paramIndex++}`);
          queryParams.push(`%${filter.value}%`);
          break;
        case 'starts_with':
          whereConditions.push(`${safeColumn} ILIKE $${paramIndex++}`);
          queryParams.push(`${filter.value}%`);
          break;
        case 'ends_with':
          whereConditions.push(`${safeColumn} ILIKE $${paramIndex++}`);
          queryParams.push(`%${filter.value}`);
          break;
        case 'is_null':
          whereConditions.push(`${safeColumn} IS NULL`);
          break;
        case 'is_not_null':
          whereConditions.push(`${safeColumn} IS NOT NULL`);
          break;
        case 'gt':
          whereConditions.push(`${safeColumn} > $${paramIndex++}`);
          queryParams.push(filter.value);
          break;
        case 'lt':
          whereConditions.push(`${safeColumn} < $${paramIndex++}`);
          queryParams.push(filter.value);
          break;
        case 'gte':
          whereConditions.push(`${safeColumn} >= $${paramIndex++}`);
          queryParams.push(filter.value);
          break;
        case 'lte':
          whereConditions.push(`${safeColumn} <= $${paramIndex++}`);
          queryParams.push(filter.value);
          break;
        case 'between':
          whereConditions.push(`${safeColumn} BETWEEN $${paramIndex++} AND $${paramIndex++}`);
          queryParams.push(filter.value[0], filter.value[1]);
          break;
        case 'regex':
          whereConditions.push(`${safeColumn} ~* $${paramIndex++}`);
          queryParams.push(filter.value);
          break;
        case 'last_n_days':
          whereConditions.push(`${safeColumn} >= NOW() - INTERVAL '${filter.value} days'`);
          break;
        case 'is_true':
          whereConditions.push(`${safeColumn} = true`);
          break;
        case 'is_false':
          whereConditions.push(`${safeColumn} = false`);
          break;
      }
    }
  }

  const whereClause = whereConditions.length > 0 
    ? ` WHERE ${whereConditions.join(' AND ')}` 
    : '';

  // Data Query
  let dataQuery = `SELECT ${columnsSelect} FROM ${safeSchema}.${safeTable}${whereClause}`;

  if (options.orderBy) {
    const safeOrderBy = sanitizeIdentifier(options.orderBy);
    const orderDir = options.orderDir === 'DESC' ? 'DESC' : 'ASC';
    dataQuery += ` ORDER BY ${safeOrderBy} ${orderDir}`;
  }

  if (options.limit) {
    dataQuery += ` LIMIT ${options.limit}`;
  }

  if (options.offset) {
    dataQuery += ` OFFSET ${options.offset}`;
  }

  // Count Query
  const countQuery = `SELECT COUNT(*) as total FROM ${safeSchema}.${safeTable}${whereClause}`;

  const [dataResult, countResult] = await Promise.all([
    conn.pool.query(dataQuery, queryParams),
    conn.pool.query(countQuery, queryParams)
  ]);

  return {
    rows: dataResult.rows,
    total: parseInt(countResult.rows[0].total),
  };
}

export async function getTableColumns(connectionId: string, schema: string, table: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const query = `
    SELECT 
      c.column_name,
      c.data_type,
      c.character_maximum_length,
      c.numeric_precision,
      c.numeric_scale,
      c.is_nullable,
      c.column_default,
      c.is_generated,
      c.generation_expression,
      kcu.column_name AS pk_column
    FROM information_schema.columns c
    LEFT JOIN (
      SELECT ku.table_schema, ku.table_name, ku.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage ku 
        ON tc.constraint_name = ku.constraint_name
      WHERE tc.constraint_type = 'PRIMARY KEY'
    ) kcu ON c.table_schema = kcu.table_schema 
      AND c.table_name = kcu.table_name 
      AND c.column_name = kcu.column_name
    WHERE c.table_schema = $1 AND c.table_name = $2
    ORDER BY c.ordinal_position
  `;

  const result = await conn.pool.query(query, [schema, table]);
  return result.rows;
}

export async function insertRow(
  connectionId: string,
  schema: string,
  table: string,
  data: Record<string, any>
) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const safeSchema = sanitizeIdentifier(schema);
  const safeTable = sanitizeIdentifier(table);
  
  const columns = Object.keys(data);
  const values = Object.values(data);
  
  if (columns.length === 0) {
    throw new Error('No data provided');
  }
  
  const safeColumns = columns.map(c => sanitizeIdentifier(c));
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  
  const query = `
    INSERT INTO ${safeSchema}.${safeTable} (${safeColumns.join(', ')})
    VALUES (${placeholders.join(', ')})
    RETURNING *
  `;
  
  const result = await conn.pool.query(query, values);
  return { rows: result.rows, rowCount: result.rowCount };
}

export async function updateRow(
  connectionId: string,
  schema: string,
  table: string,
  primaryKey: { column: string; value: any },
  data: Record<string, any>
) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const safeSchema = sanitizeIdentifier(schema);
  const safeTable = sanitizeIdentifier(table);
  const safePk = sanitizeIdentifier(primaryKey.column);
  
  const updates = Object.entries(data)
    .filter(([key]) => key !== primaryKey.column)
    .map(([key, value], i) => {
      const safeColumn = sanitizeIdentifier(key);
      return `${safeColumn} = $${i + 1}`;
    });
  
  if (updates.length === 0) {
    throw new Error('No data to update');
  }
  
  const updateValues = Object.entries(data)
    .filter(([key]) => key !== primaryKey.column)
    .map(([, value]) => value);
  
  const query = `
    UPDATE ${safeSchema}.${safeTable}
    SET ${updates.join(', ')}
    WHERE ${safePk} = $${updateValues.length + 1}
    RETURNING *
  `;
  
  const result = await conn.pool.query(query, [...updateValues, primaryKey.value]);
  return { rows: result.rows, rowCount: result.rowCount };
}

export async function deleteRows(
  connectionId: string,
  schema: string,
  table: string,
  primaryKeys: { column: string; value: any }[]
) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const safeSchema = sanitizeIdentifier(schema);
  const safeTable = sanitizeIdentifier(table);
  
  if (primaryKeys.length === 0) {
    throw new Error('No rows selected for deletion');
  }
  
  const safeColumn = sanitizeIdentifier(primaryKeys[0].column);
  const placeholders = primaryKeys.map((_, i) => `$${i + 1}`);
  const values = primaryKeys.map(pk => pk.value);
  
  const query = `
    DELETE FROM ${safeSchema}.${safeTable}
    WHERE ${safeColumn} IN (${placeholders.join(', ')})
    RETURNING *
  `;
  
  const result = await conn.pool.query(query, values);
  return { rows: result.rows, rowCount: result.rowCount };
}

export async function getPrimaryKey(connectionId: string, schema: string, table: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const query = `
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema = $1
      AND tc.table_name = $2
  `;
  
  const result = await conn.pool.query(query, [schema, table]);
  return result.rows.length > 0 ? result.rows[0].column_name : null;
}
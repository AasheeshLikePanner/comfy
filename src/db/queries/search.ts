import { getConnection } from '../client.js';

interface SchemaCache {
  tables: Array<{ schema: string; name: string; type: string }>;
  columns: Array<{ schema: string; table: string; name: string; type: string; is_fk: boolean; fk_ref_table?: string; fk_ref_schema?: string }>;
  fks: Array<{ schema: string; table: string; column: string; ref_table: string; ref_schema: string; ref_column: string }>;
  cachedAt: number;
}

const cache = new Map<string, SchemaCache>();

export function clearSearchCache(connectionId: string) {
  cache.delete(connectionId);
}

async function ensureCache(connectionId: string, pool: any): Promise<SchemaCache> {
  const existing = cache.get(connectionId);
  if (existing && Date.now() - existing.cachedAt < 5 * 60 * 1000) {
    return existing;
  }

  const [tables, columns, fks] = await Promise.all([
    pool.query(`
      SELECT n.nspname AS schema, c.relname AS name, 
        CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized_view' ELSE c.relkind::text END AS type
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r','v','m') AND n.nspname NOT IN ('pg_catalog','information_schema')
      ORDER BY c.relname
    `),
    pool.query(`
      SELECT n.nspname AS schema, c.relname AS table_name, a.attname AS column_name, pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE a.attnum > 0 AND NOT a.attisdropped
        AND c.relkind IN ('r','v','m') AND n.nspname NOT IN ('pg_catalog','information_schema')
      ORDER BY c.relname, a.attnum
    `),
    pool.query(`
      SELECT 
        ns.nspname AS schema, t.relname AS table_name,
        a.attname AS column_name,
        ref_ns.nspname AS ref_schema, ref_t.relname AS ref_table, ref_a.attname AS ref_column
      FROM pg_constraint con
      JOIN pg_class t ON t.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
      JOIN pg_class ref_t ON ref_t.oid = con.confrelid
      JOIN pg_namespace ref_ns ON ref_ns.oid = ref_t.relnamespace
      JOIN pg_attribute ref_a ON ref_a.attrelid = con.confrelid AND ref_a.attnum = ANY(con.confkey)
      WHERE con.contype = 'f' AND ns.nspname NOT IN ('pg_catalog','information_schema')
    `),
  ]);

  const fkMap = new Map<string, string>();
  for (const fk of fks.rows) {
    fkMap.set(`${fk.schema}.${fk.table_name}.${fk.column_name}`, `${fk.ref_schema}.${fk.ref_table}`);
  }

  const schemaCache: SchemaCache = {
    tables: tables.rows.map((r: any) => ({ schema: r.schema, name: r.name, type: r.type })),
    columns: columns.rows.map((r: any) => {
      const key = `${r.schema}.${r.table_name}.${r.column_name}`;
      const fkRef = fkMap.get(key);
      return {
        schema: r.schema, table: r.table_name, name: r.column_name, type: r.data_type,
        is_fk: !!fkRef, fk_ref_table: fkRef?.split('.')[1], fk_ref_schema: fkRef?.split('.')[0],
      };
    }),
    fks: fks.rows.map((r: any) => ({
      schema: r.schema, table: r.table_name, column: r.column_name,
      ref_table: r.ref_table, ref_schema: r.ref_schema, ref_column: r.ref_column,
    })),
    cachedAt: Date.now(),
  };

  cache.set(connectionId, schemaCache);
  return schemaCache;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]) + 1;
    }
  }
  return dp[m][n];
}

function fuzzyMatch(term: string, target: string, threshold: number = 3): boolean {
  if (target.includes(term)) return true;
  if (levenshteinDistance(term, target) <= threshold) return true;
  if (target.replace(/[_\-]/g, '').includes(term.replace(/[_\-]/g, ''))) return true;
  return false;
}

function searchSchemaLayer(cache: SchemaCache, term: string) {
  const lowerTerm = term.toLowerCase();

  const tables: any[] = [];
  const columns: any[] = [];
  const relationships: any[] = [];

  // Search tables with fuzzy
  for (const t of cache.tables) {
    const score = t.name.toLowerCase().includes(lowerTerm) ? 100
      : fuzzyMatch(lowerTerm, t.name.toLowerCase()) ? 70
      : 0;
    if (score > 0) {
      tables.push({ schema: t.schema, name: t.name, type: t.type, score });
    }
  }

  // Search columns with fuzzy
  for (const col of cache.columns) {
    const nameMatch = col.name.toLowerCase().includes(lowerTerm);
    const fuzzy = fuzzyMatch(lowerTerm, col.name.toLowerCase());
    const score = nameMatch ? 100 : fuzzy ? 60 : 0;
    if (score > 0) {
      columns.push({ schema: col.schema, table: col.table, column: col.name, type: col.type, is_fk: col.is_fk, fk_ref: col.is_fk ? `${col.fk_ref_schema}.${col.fk_ref_table}` : undefined, score });
    }
  }

  // Search FK relationships
  for (const fk of cache.fks) {
    const colMatch = fk.column.toLowerCase().includes(lowerTerm);
    const tableMatch = fk.ref_table.toLowerCase().includes(lowerTerm);
    const score = colMatch && tableMatch ? 100 : colMatch ? 80 : tableMatch ? 70 : 0;
    if (score > 0) {
      relationships.push({
        from: { schema: fk.schema, table: fk.table, column: fk.column },
        to: { schema: fk.ref_schema, table: fk.ref_table, column: fk.ref_column },
        score,
      });
    }
  }

  return { tables, columns, relationships };
}

const TEXT_TYPES = ['text', 'character varying', 'varchar', 'char', 'character', 'name', 'json', 'jsonb', 'xml', 'uuid'];

function isTextType(dataType: string): boolean {
  const lower = dataType.toLowerCase();
  return TEXT_TYPES.some(t => lower.startsWith(t));
}

async function searchValueInTable(pool: any, schema: string, table: string, columns: Array<{ name: string; type: string }>, term: string): Promise<any[]> {
  const results: any[] = [];
  const searchColumns = columns.filter(c => isTextType(c.type)).slice(0, 5);
  if (searchColumns.length === 0) return [];

  try {
    const whereClauses = searchColumns.map((c, i) => `"${c.name}"::text ILIKE $${i + 1}`);
    const params = searchColumns.map(() => `%${term}%`);
    const selectCols = searchColumns.map(c => `"${c.name}"`).join(', ');

    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 200));
    const queryPromise = pool.query(
      `SELECT ${selectCols} FROM "${schema}"."${table}" WHERE ${whereClauses.join(' OR ')} LIMIT 5`,
      params
    );

    const result = await Promise.race([queryPromise, timeoutPromise]);
    if (!result) return [];

    for (const row of result.rows) {
      for (const col of searchColumns) {
        const value = row[col.name];
        if (value && String(value).toLowerCase().includes(term.toLowerCase())) {
          results.push({
            schema,
            table,
            column: col.name,
            value: String(value).length > 100 ? String(value).slice(0, 100) + '...' : String(value),
            row,
          });
        }
      }
    }
  } catch (err: any) {
    console.error(`[search] Error searching ${schema}.${table}:`, err.message);
  }

  return results;
}

async function countValuesInTable(pool: any, schema: string, table: string, columns: Array<{ name: string; type: string }>, term: string): Promise<{ schema: string; table: string; column: string; count: number }[]> {
  const searchColumns = columns.filter(c => isTextType(c.type)).slice(0, 5);
  if (searchColumns.length === 0) return [];

  const counts: { schema: string; table: string; column: string; count: number }[] = [];
  try {
    const timeoutPromise = new Promise<null>(resolve => setTimeout(() => resolve(null), 200));
    const countQueries = searchColumns.map(col =>
      pool.query(`SELECT COUNT(*) as cnt FROM "${schema}"."${table}" WHERE "${col.name}"::text ILIKE $1`, [`%${term}%`]).then((r: any) => ({
        schema, table, column: col.name, count: parseInt(r.rows[0]?.cnt || '0'),
      }))
    );
    const batchPromise = Promise.race([Promise.all(countQueries), timeoutPromise]);
    const result = await batchPromise;
    if (result) {
      for (const r of result) {
        if (r.count > 0) counts.push(r);
      }
    }
  } catch (err: any) {
    // timeout or error, skip
  }
  return counts;
}

async function searchValuesParallel(pool: any, cache: SchemaCache, term: string): Promise<{ values: any[]; counts: any[] }> {
  const tablesToSearch: Map<string, Array<{ name: string; type: string }>> = new Map();

  for (const col of cache.columns) {
    if (isTextType(col.type)) {
      const key = `${col.schema}.${col.table}`;
      if (!tablesToSearch.has(key)) tablesToSearch.set(key, []);
      if (tablesToSearch.get(key)!.length < 5) {
        tablesToSearch.get(key)!.push({ name: col.name, type: col.type });
      }
    }
  }

  const allResults: any[] = [];
  const allCounts: any[] = [];
  const entries = Array.from(tablesToSearch.entries());
  const CONCURRENCY = 5;

  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const batch = entries.slice(i, i + CONCURRENCY);
    const promises = batch.map(([key, columns]) => {
      const [schema, table] = key.split('.');
      return searchValueInTable(pool, schema, table, columns, term);
    });
    const results = await Promise.all(promises);
    for (const r of results) allResults.push(...r);
  }

  // Get counts for top tables that have results
  const tablesWithResults = new Map<string, { schema: string; table: string; columns: any[] }>();
  for (const r of allResults) {
    const key = `${r.schema}.${r.table}`;
    if (!tablesWithResults.has(key)) {
      tablesWithResults.set(key, { schema: r.schema, table: r.table, columns: tablesToSearch.get(key) || [] });
    }
  }
  for (const [, tableInfo] of tablesWithResults) {
    const counts = await countValuesInTable(pool, tableInfo.schema, tableInfo.table, tableInfo.columns, term);
    allCounts.push(...counts);
  }

  return { values: allResults.slice(0, 30), counts: allCounts };
}

export async function searchDatabase(connectionId: string, term: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  let schemaCache: SchemaCache;
  try {
    schemaCache = await ensureCache(connectionId, conn.pool);
  } catch (err: any) {
    console.error('[search] Cache error:', err.message);
    return { tables: [], columns: [], relationships: [], values: [], valueCounts: [], cachedAt: Date.now() };
  }

  const schemaResults = searchSchemaLayer(schemaCache, term);

  let valueResults = { values: [] as any[], counts: [] as any[] };
  try {
    valueResults = await searchValuesParallel(conn.pool, schemaCache, term);
  } catch (err: any) {
    console.error('[search] Value search error:', err.message);
  }

  return {
    tables: schemaResults.tables.sort((a, b) => b.score - a.score).slice(0, 10),
    columns: schemaResults.columns.sort((a, b) => b.score - a.score).slice(0, 15),
    relationships: schemaResults.relationships.sort((a, b) => b.score - a.score).slice(0, 10),
    values: valueResults.values,
    valueCounts: valueResults.counts.sort((a, b) => b.count - a.count),
    cachedAt: schemaCache.cachedAt,
  };
}

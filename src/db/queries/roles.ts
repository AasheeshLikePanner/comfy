import { getConnection } from '../client.js';

export async function getRoles(connectionId: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const query = `
    SELECT 
      r.rolname AS role_name,
      r.rolsuper AS is_superuser,
      r.rolinherit AS inherits,
      r.rolcreaterole AS can_create_role,
      r.rolcreatedb AS can_create_db,
      r.rolcanlogin AS can_login,
      r.rolreplication AS is_replication,
      r.rolconnlimit AS connection_limit,
      r.rolvaliduntil AS valid_until,
      ARRAY(
        SELECT b.rolname 
        FROM pg_auth_members m 
        JOIN pg_authid b ON b.oid = m.roleid 
        WHERE m.member = r.oid
      ) AS member_of,
      pg_size_pretty(
        COALESCE(
          (SELECT SUM(pg_database_size(d.oid)) 
           FROM pg_database d 
           WHERE d.datdba = r.oid), 0
        )
      ) AS database_size
    FROM pg_authid r
    ORDER BY r.rolname
  `;

  const result = await conn.pool.query(query);
  return result.rows;
}

export async function getTablePermissions(connectionId: string, schema: string, table: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const query = `
    SELECT 
      grantee,
      table_schema,
      table_name,
      privilege_type,
      is_grantable
    FROM information_schema.table_privileges
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY grantee, privilege_type
  `;

  const result = await conn.pool.query(query, [schema, table]);
  return result.rows;
}

export async function getCurrentUserPermissions(connectionId: string) {
  const conn = getConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const query = `SELECT current_user AS user_name, session_user AS session_user`;
  const result = await conn.pool.query(query);
  return result.rows[0];
}
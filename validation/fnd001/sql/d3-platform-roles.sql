-- FND-001 / D3 — read-only catalog inspection of platform roles (sandbox_exec*) and their
-- relationship with the PostgREST roles. Only SELECTs on system catalogs and built-in
-- privilege functions; no application, user or financial rows are read.
-- Run with the session forced to read-only (see validation/fnd001/run-d3-catalog.sh).
\pset footer off
\pset format unaligned
\pset fieldsep '|'

\echo '== 1. roles of interest (pg_roles)'
SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication,
       rolbypassrls, rolconnlimit
FROM pg_roles
WHERE rolname LIKE 'sandbox\_exec%' OR rolname IN
  ('authenticator','anon','authenticated','service_role','postgres','supabase_admin',
   'supabase_read_only_user','dashboard_user','pgbouncer','supabase_auth_admin')
ORDER BY rolname;

\echo '== 2. memberships touching sandbox_exec* or PostgREST roles (pg_auth_members)'
SELECT r.rolname AS role, m.rolname AS member, g.rolname AS grantor,
       am.admin_option, am.inherit_option, am.set_option
FROM pg_auth_members am
JOIN pg_roles r ON r.oid = am.roleid
JOIN pg_roles m ON m.oid = am.member
LEFT JOIN pg_roles g ON g.oid = am.grantor
WHERE r.rolname LIKE 'sandbox\_exec%' OR m.rolname LIKE 'sandbox\_exec%'
   OR r.rolname IN ('authenticator','anon','authenticated','service_role')
   OR m.rolname IN ('authenticator','anon','authenticated','service_role')
ORDER BY role, member;

\echo '== 3. transitive role graph from sandbox_exec* (which roles they can act as)'
WITH RECURSIVE g(start_role, via_role, depth) AS (
  SELECT r.rolname, r.rolname, 0 FROM pg_roles r WHERE r.rolname LIKE 'sandbox\_exec%'
  UNION
  SELECT g.start_role, p.rolname, g.depth + 1
  FROM g JOIN pg_roles c ON c.rolname = g.via_role
  JOIN pg_auth_members am ON am.member = c.oid
  JOIN pg_roles p ON p.oid = am.roleid
  WHERE g.depth < 10)
SELECT start_role, via_role, depth FROM g ORDER BY start_role, depth, via_role;

\echo '== 4. reverse: can a PostgREST role reach sandbox_exec*? (pg_has_role MEMBER/USAGE)'
SELECT a.rolname AS api_role, s.rolname AS platform_role,
       pg_has_role(a.oid, s.oid, 'MEMBER') AS member, pg_has_role(a.oid, s.oid, 'USAGE') AS usage
FROM pg_roles a CROSS JOIN pg_roles s
WHERE a.rolname IN ('authenticator','anon','authenticated','service_role')
  AND s.rolname LIKE 'sandbox\_exec%'
ORDER BY api_role, platform_role;

\echo '== 5. default ACLs (pg_default_acl), all grantees'
SELECT d.defaclrole::regrole AS owner_role, COALESCE(n.nspname, '<all schemas>') AS schema,
       d.defaclobjtype AS objtype,
       CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE x.grantee::regrole::text END AS grantee,
       x.privilege_type, x.is_grantable
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace,
     aclexplode(d.defaclacl) x
WHERE n.nspname IS NULL OR n.nspname = 'public'
ORDER BY 1, schema, objtype, grantee, privilege_type;

\echo '== 6. explicit ACL entries for sandbox_exec* on public relations (filtered out of the fingerprint)'
SELECT c.relname, x.grantee::regrole AS grantee, string_agg(x.privilege_type, ',' ORDER BY x.privilege_type) AS privs,
       x.grantor::regrole AS grantor
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, aclexplode(c.relacl) x
WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S') AND x.grantee <> 0
  AND x.grantee::regrole::text LIKE 'sandbox\_exec%'
GROUP BY c.relname, x.grantee, x.grantor
ORDER BY c.relname, 2;

\echo '== 7. explicit EXECUTE for sandbox_exec* on public functions'
SELECT p.oid::regprocedure AS fn, x.grantee::regrole AS grantee, x.privilege_type, x.grantor::regrole AS grantor
FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) x
WHERE p.pronamespace = 'public'::regnamespace AND x.grantee <> 0
  AND x.grantee::regrole::text LIKE 'sandbox\_exec%'
ORDER BY 1, 2;

\echo '== 8. effective privileges of every sandbox_exec* role on sec_* tables'
SELECT r.rolname AS role, c.relname,
       has_table_privilege(r.oid, c.oid, 'SELECT') AS sel, has_table_privilege(r.oid, c.oid, 'INSERT') AS ins,
       has_table_privilege(r.oid, c.oid, 'UPDATE') AS upd, has_table_privilege(r.oid, c.oid, 'DELETE') AS del,
       has_table_privilege(r.oid, c.oid, 'TRUNCATE') AS trunc, has_table_privilege(r.oid, c.oid, 'TRIGGER') AS trig,
       has_table_privilege(r.oid, c.oid, 'REFERENCES') AS refs
FROM pg_roles r CROSS JOIN pg_class c
WHERE r.rolname LIKE 'sandbox\_exec%' AND c.relnamespace = 'public'::regnamespace
  AND c.relname LIKE 'sec\_%' AND c.relkind IN ('r','p','v')
ORDER BY role, c.relname;

\echo '== 9. effective EXECUTE of sandbox_exec* and PostgREST roles on sec_* functions and has_role'
SELECT r.rolname AS role, p.oid::regprocedure AS fn, has_function_privilege(r.oid, p.oid, 'EXECUTE') AS exec
FROM pg_roles r CROSS JOIN pg_proc p
WHERE (r.rolname LIKE 'sandbox\_exec%' OR r.rolname IN ('authenticator','anon','authenticated','service_role'))
  AND p.pronamespace = 'public'::regnamespace AND (p.proname LIKE 'sec\_%' OR p.proname = 'has_role')
ORDER BY 1, 2;

\echo '== 10. schema privileges (public, auth) for sandbox_exec* and PostgREST roles'
SELECT r.rolname AS role, s.nspname AS schema,
       has_schema_privilege(r.oid, s.oid, 'USAGE') AS usage, has_schema_privilege(r.oid, s.oid, 'CREATE') AS create
FROM pg_roles r CROSS JOIN pg_namespace s
WHERE (r.rolname LIKE 'sandbox\_exec%' OR r.rolname IN ('authenticator','anon','authenticated','service_role'))
  AND s.nspname IN ('public','auth')
ORDER BY role, schema;

\echo '== 11. role-level settings (pg_db_role_setting) for these roles'
SELECT COALESCE(r.rolname, '<all>') AS role, COALESCE(d.datname, '<all>') AS db, s.setconfig
FROM pg_db_role_setting s LEFT JOIN pg_roles r ON r.oid = s.setrole LEFT JOIN pg_database d ON d.oid = s.setdatabase
WHERE r.rolname LIKE 'sandbox\_exec%' OR r.rolname IN ('authenticator','anon','authenticated','service_role')
ORDER BY role;

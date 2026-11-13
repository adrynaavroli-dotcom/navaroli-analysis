-- Admin-only model / D5 design — read-only probe of the identities that act on the live
-- database and of the platform grants on storage, net and cron. Answers the design
-- questions "which identity runs migrations / DDL", "who granted sandbox_exec* its
-- storage privileges and can the migrator revoke them", "which net/cron routes exist".
-- Only SELECTs over pg_catalog and built-in privilege functions; no business rows
-- (only aggregate COUNTs of migration-journal rows). Run ONLY through
-- validation/fnd001/run-d3-catalog.sh (session forced read-only).
-- Every project-specific role name is printed as sandbox_exec_<ref>.
\pset footer off
\pset format unaligned
\pset fieldsep '|'

\echo '== P1. identity of the ambient sandbox session (agent shell / read tools)'
SELECT regexp_replace(current_user,  'sandbox_exec_[a-z0-9]+', 'sandbox_exec_<ref>') AS current_user,
       regexp_replace(session_user,  'sandbox_exec_[a-z0-9]+', 'sandbox_exec_<ref>') AS session_user,
       r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb
FROM pg_roles r WHERE r.rolname = current_user;

\echo '== P2. owners of the objects created by migrations (who executes DDL)'
SELECT 'schema:' || nspname, pg_get_userbyid(nspowner)
FROM pg_namespace WHERE nspname IN ('public','drizzle','supabase_migrations','storage','net','cron','extensions','auth')
UNION ALL
SELECT 'owner_of_public_relations', string_agg(DISTINCT pg_get_userbyid(relowner), ',')
FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','v','S','m','p')
UNION ALL
SELECT 'owner_of_public_functions', string_agg(DISTINCT pg_get_userbyid(proowner), ',')
FROM pg_proc WHERE pronamespace = 'public'::regnamespace
UNION ALL
SELECT 'table:' || c.oid::regclass::text, pg_get_userbyid(c.relowner)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE (n.nspname, c.relname) IN (('drizzle','__drizzle_migrations'),('supabase_migrations','schema_migrations'))
ORDER BY 1;

\echo '== P3. migration journals: existence and whether this session may read them (no row access)'
SELECT n.nspname || '.' || c.relname, pg_get_userbyid(c.relowner),
       has_schema_privilege(n.oid, 'USAGE') AS session_schema_usage,
       has_table_privilege(c.oid, 'SELECT') AS session_select
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE (n.nspname, c.relname) IN (('drizzle','__drizzle_migrations'),('supabase_migrations','schema_migrations'))
ORDER BY 1;

\echo '== P4. role attributes and memberships of the privileged roles'
SELECT rolname, rolsuper, rolcreaterole, rolbypassrls, rolcanlogin,
       (SELECT string_agg(pg_get_userbyid(roleid), ',' ORDER BY pg_get_userbyid(roleid)) FROM pg_auth_members WHERE member = r.oid) AS member_of
FROM pg_roles r
WHERE rolname IN ('postgres','supabase_admin','supabase_storage_admin','supabase_auth_admin','supabase_read_only_user','service_role','authenticator')
ORDER BY 1;

\echo '== P5. storage.buckets / storage.objects: owner, RLS, explicit ACL entries (grantor>grantee:privilege*grant_option)'
SELECT c.oid::regclass, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
       (SELECT string_agg(regexp_replace(pg_get_userbyid(a.grantor) || '>' ||
                 CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END || ':' || a.privilege_type ||
                 CASE WHEN a.is_grantable THEN '*' ELSE '' END, 'sandbox_exec_[a-z0-9]+', 'sandbox_exec_<ref>', 'g'), ' ' ORDER BY 1)
        FROM aclexplode(c.relacl) a
        WHERE pg_get_userbyid(a.grantee) LIKE 'sandbox\_exec%' OR pg_get_userbyid(a.grantee) IN ('anon','authenticated','service_role','postgres')
           OR a.grantee = 0) AS acl
FROM pg_class c WHERE c.oid IN (to_regclass('storage.buckets'), to_regclass('storage.objects'))
ORDER BY 1;

\echo '== P6. can the migrator (postgres) revoke the sandbox grants? (member of grantor or owner)'
SELECT c.oid::regclass,
       regexp_replace(pg_get_userbyid(a.grantee), 'sandbox_exec_[a-z0-9]+', 'sandbox_exec_<ref>') AS grantee,
       pg_get_userbyid(a.grantor) AS grantor,
       pg_has_role('postgres', a.grantor, 'USAGE') AS postgres_acts_as_grantor,
       pg_has_role('postgres', c.relowner, 'USAGE') AS postgres_acts_as_owner
FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
WHERE c.oid IN (to_regclass('storage.buckets'), to_regclass('storage.objects'))
  AND pg_get_userbyid(a.grantee) LIKE 'sandbox\_exec%'
GROUP BY 1, 2, 3, 4, 5 ORDER BY 1, 2;

\echo '== P7. RLS policies on storage.objects / storage.buckets (count)'
SELECT tablename, count(*) FROM pg_policies WHERE schemaname = 'storage' GROUP BY 1 ORDER BY 1;

\echo '== P8. net: extension, schema ACL, routines and queue tables (owner, grantor>grantee:priv)'
SELECT 'extension:' || extname || ' ' || extversion, pg_get_userbyid(extowner), n.nspname
FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE extname IN ('pg_net','pg_cron');
SELECT 'schema:' || nspname, pg_get_userbyid(nspowner),
       regexp_replace(COALESCE(nspacl::text, '-'), 'sandbox_exec_[a-z0-9]+', 'sandbox_exec_<ref>', 'g')
FROM pg_namespace WHERE nspname IN ('net','cron');
SELECT 'routine:' || p.oid::regprocedure::text, pg_get_userbyid(p.proowner), p.prosecdef,
       (SELECT string_agg(DISTINCT pg_get_userbyid(a.grantor), ',') FROM aclexplode(p.proacl) a) AS grantors,
       pg_has_role('postgres', p.proowner, 'USAGE') AS postgres_acts_as_owner
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'net' OR (n.nspname = 'cron' AND p.proname IN ('schedule','unschedule','alter_job','schedule_in_database'))
ORDER BY 1;
SELECT 'table:' || c.oid::regclass::text, pg_get_userbyid(c.relowner),
       (SELECT string_agg(r, '') FROM (VALUES ('S','SELECT'),('I','INSERT'),('U','UPDATE'),('D','DELETE')) v(r, p)
         WHERE has_table_privilege(x.rolname, c.oid, p)) AS effective,
       regexp_replace(x.rolname, 'sandbox_exec_[a-z0-9]+', 'sandbox_exec_<ref>') AS who,
       has_schema_privilege(x.rolname, c.relnamespace, 'USAGE') AS schema_usage
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN (SELECT rolname FROM pg_roles WHERE rolname LIKE 'sandbox\_exec%' OR rolname IN ('anon','authenticated','service_role')) x
WHERE n.nspname IN ('net','cron') AND c.relkind IN ('r','p','v')
ORDER BY 1, 4;

\echo '== P9. default privileges (pg_default_acl), all owners and schemas'
SELECT pg_get_userbyid(d.defaclrole) AS for_role, COALESCE(n.nspname, '<all schemas>') AS schema, d.defaclobjtype,
       regexp_replace(d.defaclacl::text, 'sandbox_exec_[a-z0-9]+', 'sandbox_exec_<ref>', 'g') AS acl
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
ORDER BY 1, 2, 3;

\echo '== P10. event triggers (DDL hooks that could re-grant privileges)'
SELECT evtname, evtevent, pg_get_userbyid(evtowner), evtfoid::regproc, evtenabled, COALESCE(array_to_string(evttags, ','), '-')
FROM pg_event_trigger ORDER BY 1;

\echo '== P11. public grants issued by a grantor other than postgres (migrator could not revoke them)'
SELECT c.relname, pg_get_userbyid(a.grantor), regexp_replace(pg_get_userbyid(a.grantee), 'sandbox_exec_[a-z0-9]+', 'sandbox_exec_<ref>'), a.privilege_type
FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
WHERE c.relnamespace = 'public'::regnamespace AND a.grantor <> 'postgres'::regrole
UNION ALL
SELECT p.proname, pg_get_userbyid(a.grantor), regexp_replace(pg_get_userbyid(a.grantee), 'sandbox_exec_[a-z0-9]+', 'sandbox_exec_<ref>'), a.privilege_type
FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
WHERE p.pronamespace = 'public'::regnamespace AND a.grantor <> 'postgres'::regrole
ORDER BY 1, 3, 4;
\echo '== P11 end'

\echo '== P12. public sequences'
SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'S';
\echo '== P12 end'

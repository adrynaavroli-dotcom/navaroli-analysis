-- Transversal security audit (admin-only requirement) — read-only catalog inspection.
-- Answers: what can each identity (anon, authenticated, service_role, sandbox_exec*) do on
-- every public relation/function, which RLS policies decide row access, and which paths
-- could grant admin or modify site content. Only catalog SELECTs and built-in privilege
-- functions; the only non-catalog read is an aggregate COUNT of user_roles by role
-- — no ids, emails or business rows. Run only through
-- validation/fnd001/run-d3-catalog.sh (session forced read-only).
-- The project-specific platform role is printed as sandbox_exec_<ref>.
\pset footer off
\pset format unaligned
\pset fieldsep '|'

\echo '== A1. identities: role attributes'
SELECT CASE WHEN rolname LIKE 'sandbox\_exec\_%' THEN 'sandbox_exec_<ref>' ELSE rolname END AS who,
       rolsuper, rolcreaterole, rolcreatedb, rolcanlogin, rolbypassrls, rolreplication
FROM pg_roles
WHERE rolname LIKE 'sandbox\_exec%' OR rolname IN ('anon','authenticated','service_role','authenticator','postgres')
ORDER BY 1;

\echo '== A2. roles each identity can act as (transitive membership, excluding itself)'
WITH RECURSIVE ids AS (
  SELECT oid, CASE WHEN rolname LIKE 'sandbox\_exec\_%' THEN 'sandbox_exec_<ref>' ELSE rolname END AS who
  FROM pg_roles WHERE rolname LIKE 'sandbox\_exec%' OR rolname IN ('anon','authenticated','service_role','authenticator')),
g(who, via, depth) AS (
  SELECT who, oid, 0 FROM ids
  UNION
  SELECT g.who, am.roleid, g.depth + 1 FROM g JOIN pg_auth_members am ON am.member = g.via WHERE g.depth < 10)
SELECT who, string_agg(DISTINCT CASE WHEN r.rolname LIKE 'sandbox\_exec\_%' THEN 'sandbox_exec_<ref>' ELSE r.rolname END, ',') AS can_act_as
FROM g JOIN pg_roles r ON r.oid = g.via WHERE g.depth > 0 GROUP BY who ORDER BY who;

\echo '== B1. public relations: kind, owner, RLS enabled/forced, view security_invoker'
SELECT c.relname, c.relkind, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
       COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions) WHERE option_name = 'security_invoker'), '-') AS sec_invoker
FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v','m')
ORDER BY c.relname;

\echo '== B2. effective privileges per identity on public relations (S I U D T; lowercase s i u = column-level only)'
WITH ids AS (
  SELECT oid, CASE WHEN rolname LIKE 'sandbox\_exec\_%' THEN 'sandbox_exec_<ref>' ELSE rolname END AS who
  FROM pg_roles WHERE rolname LIKE 'sandbox\_exec%' OR rolname IN ('anon','authenticated','service_role'))
SELECT c.relname, i.who,
  concat(CASE WHEN has_table_privilege(i.oid,c.oid,'SELECT') THEN 'S' WHEN has_any_column_privilege(i.oid,c.oid,'SELECT') THEN 's' END,
         CASE WHEN has_table_privilege(i.oid,c.oid,'INSERT') THEN 'I' WHEN has_any_column_privilege(i.oid,c.oid,'INSERT') THEN 'i' END,
         CASE WHEN has_table_privilege(i.oid,c.oid,'UPDATE') THEN 'U' WHEN has_any_column_privilege(i.oid,c.oid,'UPDATE') THEN 'u' END,
         CASE WHEN has_table_privilege(i.oid,c.oid,'DELETE') THEN 'D' END,
         CASE WHEN has_table_privilege(i.oid,c.oid,'TRUNCATE') THEN 'T' END) AS privs
FROM pg_class c CROSS JOIN ids i
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v','m')
ORDER BY c.relname, i.who;

\echo '== B3. RLS policies on public tables (cmd, roles, permissive, USING, WITH CHECK)'
SELECT tablename, policyname, cmd, array_to_string(roles, ',') AS roles, permissive,
       COALESCE(qual, '-') AS using_expr, COALESCE(with_check, '-') AS check_expr
FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, cmd, policyname;

\echo '== C1. public functions: security definer, owner, search_path, EXECUTE per identity (a=anon u=authenticated s=service_role p=PUBLIC x=sandbox_exec X=sandbox_exec_<ref>)'
SELECT p.oid::regprocedure AS fn, p.prosecdef AS secdef, pg_get_userbyid(p.proowner) AS owner,
       COALESCE(array_to_string(p.proconfig, ';'), '-') AS config,
       concat(CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'a' END,
              CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'u' END,
              CASE WHEN has_function_privilege('service_role', p.oid, 'EXECUTE') THEN 's' END,
              CASE WHEN EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) x
                                WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE') THEN 'p' END,
              CASE WHEN EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = 'sandbox_exec' AND has_function_privilege(r.oid, p.oid, 'EXECUTE')) THEN 'x' END,
              CASE WHEN EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname LIKE 'sandbox\_exec\_%' AND has_function_privilege(r.oid, p.oid, 'EXECUTE')) THEN 'X' END) AS exec_by
FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace ORDER BY 1;

\echo '== D1. schema privileges per identity (USAGE, CREATE)'
WITH ids AS (
  SELECT oid, CASE WHEN rolname LIKE 'sandbox\_exec\_%' THEN 'sandbox_exec_<ref>' ELSE rolname END AS who
  FROM pg_roles WHERE rolname LIKE 'sandbox\_exec%' OR rolname IN ('anon','authenticated','service_role'))
SELECT i.who, n.nspname, has_schema_privilege(i.oid, n.oid, 'USAGE') AS usage, has_schema_privilege(i.oid, n.oid, 'CREATE') AS "create"
FROM ids i CROSS JOIN pg_namespace n
WHERE n.nspname IN ('public','auth','storage','vault','cron','net','supabase_functions','graphql','graphql_public','extensions','realtime')
ORDER BY 1, 2;

\echo '== D2. auth / storage / vault / cron tables: effective write or read per identity (only non-empty)'
WITH ids AS (
  SELECT oid, CASE WHEN rolname LIKE 'sandbox\_exec\_%' THEN 'sandbox_exec_<ref>' ELSE rolname END AS who
  FROM pg_roles WHERE rolname LIKE 'sandbox\_exec%' OR rolname IN ('anon','authenticated','service_role'))
SELECT n.nspname || '.' || c.relname AS rel, i.who,
  concat(CASE WHEN has_table_privilege(i.oid,c.oid,'SELECT') THEN 'S' END,
         CASE WHEN has_table_privilege(i.oid,c.oid,'INSERT') THEN 'I' END,
         CASE WHEN has_table_privilege(i.oid,c.oid,'UPDATE') THEN 'U' END,
         CASE WHEN has_table_privilege(i.oid,c.oid,'DELETE') THEN 'D' END) AS privs
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace CROSS JOIN ids i
WHERE n.nspname IN ('auth','storage','vault','cron') AND c.relkind IN ('r','p','v')
  AND (has_table_privilege(i.oid,c.oid,'SELECT') OR has_table_privilege(i.oid,c.oid,'INSERT')
       OR has_table_privilege(i.oid,c.oid,'UPDATE') OR has_table_privilege(i.oid,c.oid,'DELETE'))
ORDER BY 1, 2;

\echo '== D3. EXECUTE on cron.schedule / net.http_post / vault functions per identity'
WITH ids AS (
  SELECT oid, CASE WHEN rolname LIKE 'sandbox\_exec\_%' THEN 'sandbox_exec_<ref>' ELSE rolname END AS who
  FROM pg_roles WHERE rolname LIKE 'sandbox\_exec%' OR rolname IN ('anon','authenticated','service_role'))
SELECT p.oid::regprocedure AS fn, string_agg(i.who, ',' ORDER BY i.who) AS exec_by
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace CROSS JOIN ids i
WHERE ((n.nspname = 'cron' AND p.proname IN ('schedule','schedule_in_database','alter_job','unschedule'))
    OR (n.nspname = 'net' AND p.proname IN ('http_post','http_get'))
    OR (n.nspname = 'vault' AND p.proname IN ('create_secret','update_secret')))
  AND has_function_privilege(i.oid, p.oid, 'EXECUTE')
GROUP BY 1 ORDER BY 1;

\echo '== E1. storage buckets (configuration only) and storage.objects policies'
SELECT 'buckets' AS item, count(*)::text AS value FROM storage.buckets
UNION ALL SELECT 'public_buckets', count(*)::text FROM storage.buckets WHERE public
UNION ALL SELECT 'objects_policies', count(*)::text FROM pg_policies WHERE schemaname = 'storage';

\echo '== E2. triggers on auth.users (signup lifecycle) and their functions'
SELECT t.tgname, p.oid::regprocedure AS fn, p.prosecdef AS secdef
FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'auth' AND c.relname = 'users' AND NOT t.tgisinternal ORDER BY 1;

-- E3 (cron.job listing) omitted: the audit session has no USAGE on schema cron (see D1).

\echo '== E4. user_roles constraints'
SELECT conname, contype, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.user_roles'::regclass ORDER BY conname;

\echo '== E5. aggregate count (no identities): user_roles rows by role'
SELECT 'user_roles:' || role::text AS item, count(*)::text AS value FROM public.user_roles GROUP BY role ORDER BY 1;

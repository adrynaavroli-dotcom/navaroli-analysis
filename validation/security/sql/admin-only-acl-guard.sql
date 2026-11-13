-- Admin-only model — regression guard (read-only: SELECTs over pg_catalog and built-in
-- privilege functions). Generalises the D4 sec_* guard to every object in public.
-- Runs on the disposable CI stack after the D5 proposal is applied, and as the production
-- postflight through validation/fnd001/run-d3-catalog.sh's read-only session.
--
-- It judges SQL PRIVILEGES and RLS POLICIES separately:
--   G1  inventory: every relation/routine in public is a reviewed object (new tables or
--       functions fail until they are reviewed and added here); every table has RLS on.
--   G2  PUBLIC holds nothing on any public relation, sequence or routine.
--   G3  effective write privileges (table- and column-level, explicit, PUBLIC or inherited)
--       of anon, authenticated, service_role and sandbox_exec* are a subset of the
--       reviewed allowlist below. anon and sandbox_exec*: none at all.
--   G4  effective EXECUTE of the same roles on public routines is a subset of the allowlist.
--   G5  SECURITY DEFINER routines: reviewed, owned by postgres, search_path pinned.
--   G6  RLS: every INSERT/UPDATE/DELETE/ALL policy on a non-sec_* table is exactly
--       is_admin() in USING and WITH CHECK; admin-only tables have only is_admin() reads.
--   G7  inherited privileges: API and platform roles are members of no other role.
--   G8  platform schemas: sandbox_exec* writes nothing on storage.buckets/objects; no API or
--       platform role has USAGE on schema cron.
-- pg_net is reported as INFO (owned by supabase_admin; not revocable by the migrator).
-- Output: "violation|rule|object|role|privilege" lines, "info|..." lines, then
-- "summary|violations=<n>". Zero violations = pass.
\pset tuples_only on
\pset format unaligned
WITH
roles AS (
  SELECT oid, rolname::text AS rolname,
         CASE WHEN rolname ~ '^sandbox_exec(_[a-z0-9]+)?$' THEN 'sandbox' ELSE rolname::text END AS who
  FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') OR rolname ~ '^sandbox_exec(_[a-z0-9]+)?$'),
label AS (SELECT oid, CASE WHEN who = 'sandbox' AND rolname <> 'sandbox_exec' THEN 'sandbox_exec_<ref>' ELSE rolname END AS name FROM roles),
inv_rel(name) AS (VALUES
  ('analysis_workspaces'), ('page_content'), ('profiles'), ('public_thesis_data'), ('public_thesis_data_view'),
  ('theses'), ('thesis_alerts'), ('thesis_purchases'), ('user_roles'),
  ('sec_companies'), ('sec_ticker_mappings'), ('sec_ingestion_runs'), ('sec_filings'), ('sec_raw_facts'),
  ('sec_raw_fact_observations'), ('sec_normalized_facts'), ('sec_normalized_fact_sources')),
inv_fn(name, secdef) AS (VALUES
  ('is_admin', true), ('has_role', true), ('handle_new_user', true), ('update_updated_at_column', false),
  ('enforce_privilege_baseline', false), ('sec_is_admin', true),
  ('sec_record_download', true), ('sec_fail_run', true), ('sec_fail_stale_runs', true), ('sec_finalize_run', true),
  ('sec_guard', false), ('sec_insert_guard', false), ('sec_norm_lineage_check', false), ('sec_supersession_check', false)),
-- Allowed write privileges: (role, table, privilege, column or '*' for every column).
allow_w(who, tbl, priv, col) AS (VALUES
  ('authenticated', 'theses', 'INSERT', '*'), ('authenticated', 'theses', 'UPDATE', '*'), ('authenticated', 'theses', 'DELETE', '*'),
  ('authenticated', 'public_thesis_data', 'INSERT', '*'), ('authenticated', 'public_thesis_data', 'UPDATE', '*'), ('authenticated', 'public_thesis_data', 'DELETE', '*'),
  ('authenticated', 'analysis_workspaces', 'INSERT', '*'), ('authenticated', 'analysis_workspaces', 'UPDATE', '*'), ('authenticated', 'analysis_workspaces', 'DELETE', '*'),
  ('authenticated', 'thesis_purchases', 'INSERT', '*'), ('authenticated', 'thesis_purchases', 'UPDATE', '*'), ('authenticated', 'thesis_purchases', 'DELETE', '*'),
  ('authenticated', 'profiles', 'INSERT', '*'), ('authenticated', 'profiles', 'UPDATE', '*'), ('authenticated', 'profiles', 'DELETE', '*'),
  ('authenticated', 'thesis_alerts', 'UPDATE', '*'), ('authenticated', 'thesis_alerts', 'DELETE', '*'),
  ('authenticated', 'page_content', 'INSERT', '*'), ('authenticated', 'page_content', 'UPDATE', '*'),
  ('service_role', 'theses', 'UPDATE', 'current_price'), ('service_role', 'theses', 'UPDATE', 'sparkline_data'),
  ('service_role', 'public_thesis_data', 'UPDATE', 'last_alert_sent_at'), ('service_role', 'public_thesis_data', 'UPDATE', 'alert_type'),
  ('service_role', 'public_thesis_data', 'UPDATE', 'needs_review'), ('service_role', 'public_thesis_data', 'UPDATE', 'price_at_last_check'),
  ('service_role', 'thesis_alerts', 'INSERT', '*'), ('service_role', 'thesis_alerts', 'UPDATE', 'email_sent'),
  -- M1.1 canonical spec (unchanged): ingestion writes through service_role.
  ('service_role', 'sec_companies', 'INSERT', '*'), ('service_role', 'sec_companies', 'UPDATE', '*'),
  ('service_role', 'sec_ticker_mappings', 'INSERT', '*'), ('service_role', 'sec_ticker_mappings', 'UPDATE', '*'),
  ('service_role', 'sec_ingestion_runs', 'INSERT', '*'), ('service_role', 'sec_filings', 'INSERT', '*'),
  ('service_role', 'sec_raw_facts', 'INSERT', '*'), ('service_role', 'sec_raw_fact_observations', 'INSERT', '*'),
  ('service_role', 'sec_normalized_facts', 'INSERT', '*'), ('service_role', 'sec_normalized_facts', 'UPDATE', '*'),
  ('service_role', 'sec_normalized_fact_sources', 'INSERT', '*')),
allow_x(who, fn) AS (VALUES
  ('anon', 'is_admin'), ('anon', 'sec_is_admin'),
  ('authenticated', 'is_admin'), ('authenticated', 'sec_is_admin'),
  ('sandbox', 'is_admin'), ('sandbox', 'sec_is_admin'),
  ('service_role', 'has_role'), ('service_role', 'sec_record_download'), ('service_role', 'sec_fail_run'),
  ('service_role', 'sec_fail_stale_runs'), ('service_role', 'sec_finalize_run')),
admin_only_read(tbl) AS (VALUES ('analysis_workspaces'), ('thesis_purchases'), ('thesis_alerts'), ('profiles')),
rels AS (SELECT c.oid, c.relname::text AS name, c.relkind, c.relrowsecurity, c.relacl, c.relowner
         FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v','m','f','S')),
fns AS (SELECT p.oid, p.proname::text AS name, p.prosecdef, p.proowner, p.proconfig, p.proacl, p.oid::regprocedure::text AS sig
        FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f','p')),
v AS (
  -- G1 inventory and RLS
  SELECT 'G1' AS rule, 'relation ' || r.name AS obj, '-' AS role, 'not in reviewed inventory' AS priv
  FROM rels r WHERE r.name NOT IN (SELECT name FROM inv_rel)
  UNION ALL SELECT 'G1', 'routine ' || f.sig, '-', 'not in reviewed inventory' FROM fns f WHERE f.name NOT IN (SELECT name FROM inv_fn)
  UNION ALL SELECT 'G1', 'table ' || r.name, '-', 'RLS disabled' FROM rels r WHERE r.relkind IN ('r','p') AND NOT r.relrowsecurity
  -- G2 PUBLIC
  UNION ALL SELECT 'G2', 'relation ' || r.name, 'PUBLIC', a.privilege_type
  FROM rels r CROSS JOIN LATERAL aclexplode(COALESCE(r.relacl, acldefault(CASE WHEN r.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, r.relowner))) a
  WHERE a.grantee = 0
  UNION ALL SELECT 'G2', 'routine ' || f.sig, 'PUBLIC', a.privilege_type
  FROM fns f CROSS JOIN LATERAL aclexplode(COALESCE(f.proacl, acldefault('f'::"char", f.proowner))) a WHERE a.grantee = 0
  -- G3a table-level and column-level writes on relations
  UNION ALL
  SELECT 'G3', 'relation ' || r.name || CASE WHEN x.col = '*' THEN '' ELSE '.' || x.col END, l.name, x.priv
  FROM rels r CROSS JOIN roles ro JOIN label l ON l.oid = ro.oid
  CROSS JOIN LATERAL (
    SELECT p.priv, '*'::text AS col FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p(priv)
    WHERE r.relkind <> 'S' AND has_table_privilege(ro.oid, r.oid, p.priv)
    UNION ALL
    SELECT p.priv, a.attname::text FROM unnest(ARRAY['INSERT','UPDATE','REFERENCES']) p(priv)
    JOIN pg_attribute a ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE r.relkind <> 'S' AND NOT has_table_privilege(ro.oid, r.oid, p.priv) AND has_column_privilege(ro.oid, r.oid, a.attnum, p.priv)
    UNION ALL
    SELECT p.priv, '*' FROM unnest(ARRAY['USAGE','UPDATE']) p(priv) WHERE r.relkind = 'S' AND has_sequence_privilege(ro.oid, r.oid, p.priv)
  ) x
  WHERE NOT EXISTS (SELECT 1 FROM allow_w w WHERE w.who = ro.who AND w.tbl = r.name AND w.priv = x.priv AND (w.col = '*' OR w.col = x.col))
  -- G4 EXECUTE
  UNION ALL
  SELECT 'G4', 'routine ' || f.sig, l.name, 'EXECUTE'
  FROM fns f CROSS JOIN roles ro JOIN label l ON l.oid = ro.oid
  WHERE has_function_privilege(ro.oid, f.oid, 'EXECUTE')
    AND NOT EXISTS (SELECT 1 FROM allow_x x WHERE x.who = ro.who AND x.fn = f.name)
  -- G5 SECURITY DEFINER
  UNION ALL
  SELECT 'G5', 'routine ' || f.sig, pg_get_userbyid(f.proowner), 'SECURITY DEFINER not reviewed / owner / search_path'
  FROM fns f WHERE f.prosecdef AND (
    NOT EXISTS (SELECT 1 FROM inv_fn i WHERE i.name = f.name AND i.secdef)
    OR f.proowner <> 'postgres'::regrole
    OR NOT EXISTS (SELECT 1 FROM unnest(f.proconfig) c WHERE c LIKE 'search\_path=%'))
  UNION ALL
  SELECT 'G5', 'routine ' || f.sig, '-', 'reviewed as SECURITY DEFINER but is INVOKER'
  FROM fns f JOIN inv_fn i ON i.name = f.name WHERE i.secdef AND NOT f.prosecdef
  -- G6 RLS policies
  UNION ALL
  SELECT 'G6', 'policy ' || p.tablename || '.' || p.policyname, array_to_string(p.roles, ','), p.cmd || ' not exactly is_admin()'
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename NOT LIKE 'sec\_%' AND p.cmd IN ('INSERT','UPDATE','DELETE','ALL')
    AND NOT ((p.cmd = 'INSERT' AND p.qual IS NULL AND p.with_check = 'is_admin()')
          OR (p.cmd = 'DELETE' AND p.qual = 'is_admin()' AND p.with_check IS NULL)
          OR (p.cmd IN ('UPDATE','ALL') AND p.qual = 'is_admin()' AND p.with_check = 'is_admin()'))
  UNION ALL
  SELECT 'G6', 'policy ' || p.tablename || '.' || p.policyname, array_to_string(p.roles, ','), 'admin-only table readable without is_admin()'
  FROM pg_policies p JOIN admin_only_read a ON a.tbl = p.tablename
  WHERE p.schemaname = 'public' AND p.cmd = 'SELECT' AND p.qual IS DISTINCT FROM 'is_admin()'
  UNION ALL
  SELECT 'G6', 'policy ' || p.tablename || '.' || p.policyname, array_to_string(p.roles, ','), 'user_roles read must be own rows only'
  FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'user_roles' AND p.cmd = 'SELECT'
    AND p.qual IS DISTINCT FROM '(auth.uid() = user_id)'
  UNION ALL
  SELECT 'G6', 'policy ' || p.tablename || '.' || p.policyname, array_to_string(p.roles, ','), 'uses has_role() instead of is_admin()'
  FROM pg_policies p WHERE p.schemaname = 'public' AND (p.qual LIKE '%has_role(%' OR p.with_check LIKE '%has_role(%')
  -- G7 memberships (inherited privileges)
  UNION ALL
  SELECT 'G7', 'member of ' || pg_get_userbyid(m.roleid), l.name, 'role membership'
  FROM pg_auth_members m JOIN label l ON l.oid = m.member
  -- G8 platform schemas
  UNION ALL
  SELECT 'G8', 'relation ' || t.t, l.name, p.priv
  FROM unnest(ARRAY['storage.buckets','storage.objects']) t(t)
  CROSS JOIN roles ro JOIN label l ON l.oid = ro.oid
  CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE']) p(priv)
  WHERE ro.who = 'sandbox' AND to_regclass(t.t) IS NOT NULL AND has_table_privilege(ro.oid, to_regclass(t.t), p.priv)
  UNION ALL
  SELECT 'G8', 'schema cron', l.name, 'USAGE'
  FROM roles ro JOIN label l ON l.oid = ro.oid
  WHERE EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') AND has_schema_privilege(ro.oid, 'cron', 'USAGE')
),
info AS (
  SELECT 'info|pg_net|' || l.name || '|USAGE on schema net + EXECUTE net.http_post (owned by supabase_admin, not revocable by the migrator)' AS line
  FROM roles ro JOIN label l ON l.oid = ro.oid
  WHERE ro.who = 'sandbox' AND to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NOT NULL
    AND has_schema_privilege(ro.oid, 'net', 'USAGE')
    AND has_function_privilege(ro.oid, to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)'), 'EXECUTE')
)
SELECT line FROM (
  SELECT 0 AS ord, 'violation|' || rule || '|' || obj || '|' || role || '|' || priv AS line FROM v
  UNION ALL SELECT 1, line FROM info
  UNION ALL SELECT 2, 'summary|violations=' || (SELECT count(*) FROM v)
) s ORDER BY ord, line;

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
--   G5  SECURITY DEFINER routines: reviewed, owned by postgres, search_path pinned AND
--       safe. Safe = empty (''), or every entry is pg_catalog or an existing schema that no
--       API/platform role nor PUBLIC can CREATE in and that none of them owns, with no
--       "$user", and pg_temp listed explicitly as the LAST entry (otherwise PostgreSQL
--       searches the caller-writable temporary schema first for relations and types).
--   G6  RLS: every INSERT/UPDATE/DELETE/ALL policy on a non-sec_* table is exactly
--       is_admin() in USING and WITH CHECK; every PERMISSIVE SELECT policy on any public
--       table (sec_* included) has a reviewed USING expression (allow_read): published
--       rows only, own user_roles rows, or the admin helper. Permissive policies are OR-ed,
--       so one extra policy such as USING (true) on theses would expose drafts.
--   G7  inherited privileges: API and platform roles are members of no other role.
--   G8  platform schemas: sandbox_exec* writes nothing (table- or column-level) on
--       storage.buckets/objects; no API or platform role has USAGE on schema cron.
--   G9  pg_net (decision D-e, docs/security/d-e-pg-net-analysis.md): the platform grants
--       on schema net (PUBLIC holds ALL on the two queue tables and the id sequence; USAGE
--       on the schema for API and platform roles; EXECUTE on http_get/post/delete) are owned
--       by supabase_admin and cannot be revoked by the migrator, so they are reported as
--       "risk|D-e|..." lines — an OPEN residual risk, never a pass condition. What the
--       project controls is judged here: no public routine or view reaches schema net (it
--       would put pg_net behind the REST API), no API/platform role may CREATE in net, and no
--       user trigger may exist on a net table (it would run inside the pg_net worker).
--       CREATE TRIGGER needs only the TRIGGER privilege on the table plus EXECUTE on an
--       EXISTING trigger function (PostgreSQL docs, CREATE TRIGGER) — no CREATE on any
--       schema — so "risk|D-e|trigger-attach ..." reports, per role and net table, how many
--       existing trigger functions (any schema) that role could attach there.
-- Routines are identified by their FULL signature (regprocedure), never by name, so an
-- overload such as is_admin(uuid) is an unreviewed routine with no inherited allowance.
-- Output: "violation|rule|object|role|privilege" lines, "risk|..." lines, then
-- "summary|violations=<n>|risks=<m>". Zero violations = pass.
--
-- search_path: pg_catalog first, so a public object can never shadow a catalog function
-- used here; public second, so signatures render unqualified (e.g. has_role(uuid,app_role))
-- and policy expressions render as is_admin(), independently of the caller's settings.
SET search_path = pg_catalog, public;
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
inv_fn(sig, secdef) AS (VALUES
  ('is_admin()', true), ('has_role(uuid,app_role)', true), ('handle_new_user()', true),
  ('update_updated_at_column()', false), ('enforce_privilege_baseline()', false), ('sec_is_admin()', true),
  ('sec_record_download(uuid,integer,text,bigint,bytea)', true), ('sec_fail_run(uuid,text,jsonb)', true),
  ('sec_fail_stale_runs(interval)', true), ('sec_finalize_run(uuid,jsonb,jsonb)', true),
  ('sec_guard()', false), ('sec_insert_guard()', false), ('sec_norm_lineage_check()', false),
  ('sec_supersession_check()', false)),
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
allow_x(who, sig) AS (VALUES
  ('anon', 'is_admin()'), ('anon', 'sec_is_admin()'),
  ('authenticated', 'is_admin()'), ('authenticated', 'sec_is_admin()'),
  ('sandbox', 'is_admin()'), ('sandbox', 'sec_is_admin()'),
  ('service_role', 'has_role(uuid,app_role)'), ('service_role', 'sec_record_download(uuid,integer,text,bigint,bytea)'),
  ('service_role', 'sec_fail_run(uuid,text,jsonb)'), ('service_role', 'sec_fail_stale_runs(interval)'),
  ('service_role', 'sec_finalize_run(uuid,jsonb,jsonb)')),
-- Reviewed USING expressions of PERMISSIVE SELECT policies (whitespace-normalised, rendered
-- with search_path pg_catalog, public). Any table may additionally have the admin read
-- is_admin() (sec_* tables: sec_is_admin()); admin-only tables have nothing else.
allow_read(tbl, qual) AS (VALUES
  ('theses', '((is_published = true) OR is_admin())'),
  ('public_thesis_data', '((published_at IS NOT NULL) OR is_admin())'),
  ('page_content', 'true'),
  ('user_roles', '(auth.uid() = user_id)'),
  ('sec_companies', '(is_published OR sec_is_admin())'),
  ('sec_filings', '((EXISTS ( SELECT 1 FROM sec_companies c WHERE ((c.cik = sec_filings.cik) AND c.is_published))) OR sec_is_admin())'),
  ('sec_ticker_mappings', '((EXISTS ( SELECT 1 FROM sec_companies c WHERE ((c.cik = sec_ticker_mappings.cik) AND c.is_published))) OR sec_is_admin())'),
  ('sec_normalized_facts', '((is_current AND (EXISTS ( SELECT 1 FROM sec_companies c WHERE ((c.cik = sec_normalized_facts.cik) AND c.is_published)))) OR sec_is_admin())')),
untrusted AS (SELECT oid FROM roles),
rels AS (SELECT c.oid, c.relname::text AS name, c.relkind, c.relrowsecurity, c.relacl, c.relowner
         FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v','m','f','S')),
fns AS (SELECT p.oid, p.prosecdef, p.proowner, p.proconfig, p.proacl, p.prosrc, p.oid::regprocedure::text AS sig
        FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f','p')),
-- pinned search_path of every SECURITY DEFINER routine, one row per entry (n = count)
sp AS (SELECT f.oid, f.sig, c.c AS setting, e.ord, btrim(e.e, ' "') AS e, count(*) OVER (PARTITION BY f.oid) AS n
       FROM fns f CROSS JOIN LATERAL unnest(f.proconfig) c(c)
       CROSS JOIN LATERAL regexp_split_to_table(substr(c.c, 13), ',') WITH ORDINALITY e(e, ord)
       WHERE f.prosecdef AND c.c LIKE 'search\_path=%'),
sp_bad AS (
  SELECT sp.oid, sp.sig, sp.setting FROM sp
  WHERE sp.e = '$user'
     OR (sp.e LIKE 'pg\_temp%' AND sp.ord <> sp.n)
     OR (sp.e <> '' AND sp.e <> 'pg_catalog' AND sp.e NOT LIKE 'pg\_temp%' AND NOT EXISTS (
           SELECT 1 FROM pg_namespace n WHERE n.nspname = sp.e
             AND NOT EXISTS (SELECT 1 FROM untrusted u WHERE has_schema_privilege(u.oid, n.oid, 'CREATE') OR n.nspowner = u.oid)
             AND NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(n.nspacl, acldefault('n'::"char", n.nspowner))) a
                             WHERE a.grantee = 0 AND a.privilege_type = 'CREATE')))
  UNION
  -- a non-empty list must end with an explicit pg_temp
  SELECT sp.oid, sp.sig, sp.setting FROM sp
  WHERE sp.ord = sp.n AND NOT (sp.n = 1 AND sp.e = '') AND sp.e NOT LIKE 'pg\_temp%'),
v AS (
  -- G1 inventory and RLS
  SELECT 'G1' AS rule, 'relation ' || r.name AS obj, '-' AS role, 'not in reviewed inventory' AS priv
  FROM rels r WHERE r.name NOT IN (SELECT name FROM inv_rel)
  UNION ALL SELECT 'G1', 'routine ' || f.sig, '-', 'not in reviewed inventory' FROM fns f WHERE f.sig NOT IN (SELECT sig FROM inv_fn)
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
    AND NOT EXISTS (SELECT 1 FROM allow_x x WHERE x.who = ro.who AND x.sig = f.sig)
  -- G5 SECURITY DEFINER
  UNION ALL
  SELECT 'G5', 'routine ' || f.sig, pg_get_userbyid(f.proowner), 'SECURITY DEFINER not reviewed'
  FROM fns f WHERE f.prosecdef AND NOT EXISTS (SELECT 1 FROM inv_fn i WHERE i.sig = f.sig AND i.secdef)
  UNION ALL
  SELECT 'G5', 'routine ' || f.sig, pg_get_userbyid(f.proowner), 'SECURITY DEFINER owner is not postgres'
  FROM fns f WHERE f.prosecdef AND f.proowner <> 'postgres'::regrole
  UNION ALL
  SELECT 'G5', 'routine ' || f.sig, pg_get_userbyid(f.proowner), 'SECURITY DEFINER search_path not pinned'
  FROM fns f WHERE f.prosecdef AND NOT EXISTS (SELECT 1 FROM unnest(f.proconfig) c WHERE c LIKE 'search\_path=%')
  UNION ALL
  SELECT DISTINCT 'G5', 'routine ' || b.sig, '-', 'SECURITY DEFINER search_path unsafe: ' || b.setting FROM sp_bad b
  UNION ALL
  SELECT 'G5', 'routine ' || f.sig, '-', 'reviewed as SECURITY DEFINER but is INVOKER'
  FROM fns f JOIN inv_fn i ON i.sig = f.sig WHERE i.secdef AND NOT f.prosecdef
  -- G6 RLS policies
  UNION ALL
  SELECT 'G6', 'policy ' || p.tablename || '.' || p.policyname, array_to_string(p.roles, ','), p.cmd || ' not exactly is_admin()'
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename NOT LIKE 'sec\_%' AND p.cmd IN ('INSERT','UPDATE','DELETE','ALL')
    AND NOT ((p.cmd = 'INSERT' AND p.qual IS NULL AND p.with_check = 'is_admin()')
          OR (p.cmd = 'DELETE' AND p.qual = 'is_admin()' AND p.with_check IS NULL)
          OR (p.cmd IN ('UPDATE','ALL') AND p.qual = 'is_admin()' AND p.with_check = 'is_admin()'))
  UNION ALL
  -- reads: a PERMISSIVE SELECT policy must have a reviewed USING expression
  SELECT 'G6', 'policy ' || p.tablename || '.' || p.policyname, array_to_string(p.roles, ','), 'SELECT USING not reviewed: ' || COALESCE(regexp_replace(p.qual, '\s+', ' ', 'g'), '<none>')
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.cmd = 'SELECT' AND p.permissive = 'PERMISSIVE'
    AND COALESCE(regexp_replace(p.qual, '\s+', ' ', 'g'), '') <> CASE WHEN p.tablename LIKE 'sec\_%' THEN 'sec_is_admin()' ELSE 'is_admin()' END
    AND NOT EXISTS (SELECT 1 FROM allow_read a WHERE a.tbl = p.tablename AND a.qual = regexp_replace(p.qual, '\s+', ' ', 'g'))
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
  CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p(priv)
  WHERE ro.who = 'sandbox' AND to_regclass(t.t) IS NOT NULL AND has_table_privilege(ro.oid, to_regclass(t.t), p.priv)
  UNION ALL
  -- column-level writes on Storage metadata (a grant on one column, not on the table)
  SELECT 'G8', 'relation ' || t.t || '.' || a.attname, l.name, p.priv
  FROM unnest(ARRAY['storage.buckets','storage.objects']) t(t)
  JOIN pg_attribute a ON a.attrelid = to_regclass(t.t) AND a.attnum > 0 AND NOT a.attisdropped
  CROSS JOIN roles ro JOIN label l ON l.oid = ro.oid
  CROSS JOIN unnest(ARRAY['INSERT','UPDATE','REFERENCES']) p(priv)
  WHERE ro.who = 'sandbox' AND NOT has_table_privilege(ro.oid, to_regclass(t.t), p.priv)
    AND has_column_privilege(ro.oid, to_regclass(t.t), a.attnum, p.priv)
  UNION ALL
  SELECT 'G8', 'schema cron', l.name, 'USAGE'
  FROM roles ro JOIN label l ON l.oid = ro.oid
  WHERE EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') AND has_schema_privilege(ro.oid, 'cron', 'USAGE')
  -- G9 pg_net: never reachable from public (REST exposes public; net is not exposed)
  UNION ALL
  SELECT 'G9', 'routine ' || f.sig, '-', 'references schema net (would expose pg_net through the API)'
  FROM fns f WHERE f.prosrc ~* '(^|[^a-z0-9_])"?net"?[[:space:]]*\.'
  UNION ALL
  SELECT DISTINCT 'G9', 'relation ' || v.relname, '-', 'view depends on schema net'
  FROM pg_class v JOIN pg_rewrite rw ON rw.ev_class = v.oid
  JOIN pg_depend d ON d.classid = 'pg_rewrite'::regclass AND d.objid = rw.oid AND d.refclassid = 'pg_class'::regclass
  JOIN pg_class t ON t.oid = d.refobjid
  WHERE v.relnamespace = 'public'::regnamespace AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'net')
  -- G9 nobody may create objects in net, and no user trigger may hang on a net table
  UNION ALL
  SELECT 'G9', 'schema net', l.name, 'CREATE'
  FROM roles ro JOIN label l ON l.oid = ro.oid
  WHERE EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'net') AND has_schema_privilege(ro.oid, 'net', 'CREATE')
  UNION ALL
  SELECT 'G9', 'trigger ' || t.tgname || ' on ' || c.oid::regclass::text, pg_get_userbyid(c.relowner), 'user trigger on a pg_net table'
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'net') AND NOT t.tgisinternal
),
risk AS (
  -- D-e residual (OPEN, not accepted): demonstrated privilege paths on pg_net. Owner
  -- supabase_admin; the migrator cannot revoke them; D5 does not change them.
  SELECT 'risk|D-e|schema net|' || l.name || '|USAGE' AS line
  FROM roles ro JOIN label l ON l.oid = ro.oid
  WHERE EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'net') AND has_schema_privilege(ro.oid, 'net', 'USAGE')
  UNION ALL
  SELECT 'risk|D-e|relation ' || c.oid::regclass::text || '|' || l.name || '|' ||
         (SELECT string_agg(p, ',' ORDER BY o) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER']) WITH ORDINALITY q(p, o)
          WHERE has_table_privilege(ro.oid, c.oid, p))
  FROM pg_class c CROSS JOIN roles ro JOIN label l ON l.oid = ro.oid
  WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'net') AND c.relkind IN ('r','p','v')
    AND has_table_privilege(ro.oid, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER')
  UNION ALL
  -- attachable code: TRIGGER on a net table + EXECUTE on existing trigger functions
  SELECT 'risk|D-e|trigger-attach ' || c.oid::regclass::text || '|' || l.name || '|TRIGGER + EXECUTE on ' ||
         (SELECT count(*) FROM pg_proc p WHERE p.prorettype = 'trigger'::regtype AND p.pronargs = 0 AND has_function_privilege(ro.oid, p.oid, 'EXECUTE')) ||
         ' existing trigger function(s)'
  FROM pg_class c CROSS JOIN roles ro JOIN label l ON l.oid = ro.oid
  WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'net') AND c.relkind IN ('r','p')
    AND has_table_privilege(ro.oid, c.oid, 'TRIGGER')
    AND EXISTS (SELECT 1 FROM pg_proc p WHERE p.prorettype = 'trigger'::regtype AND p.pronargs = 0 AND has_function_privilege(ro.oid, p.oid, 'EXECUTE'))
  UNION ALL
  SELECT 'risk|D-e|relation ' || c.oid::regclass::text || '|PUBLIC|' || string_agg(a.privilege_type, ',' ORDER BY a.privilege_type)
  FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner))) a
  WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'net') AND c.relkind IN ('r','S') AND a.grantee = 0
  GROUP BY c.oid
  UNION ALL
  SELECT 'risk|D-e|routine ' || p.oid::regprocedure::text || '|' || l.name || '|EXECUTE'
  FROM pg_proc p CROSS JOIN roles ro JOIN label l ON l.oid = ro.oid
  WHERE p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'net') AND p.proname IN ('http_get','http_post','http_delete')
    AND has_function_privilege(ro.oid, p.oid, 'EXECUTE')
)
SELECT line FROM (
  SELECT 0 AS ord, 'violation|' || rule || '|' || obj || '|' || role || '|' || priv AS line FROM v
  UNION ALL SELECT 1, line FROM risk
  UNION ALL SELECT 2, 'summary|violations=' || (SELECT count(*) FROM v) || '|risks=' || (SELECT count(*) FROM risk)
) s ORDER BY ord, line;

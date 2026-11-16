-- D5 — ADMIN-ONLY PERMISSION MODEL. PROPOSAL, NOT APPLIED. Not part of the migration chain.
-- Supersedes the D4 proposal (validation/fnd001/d4/d4-migration.sql), whose scope (sec_*)
-- is included here: one permission strategy, one helper, one guard.
-- When production is authorised, this exact text becomes one Drizzle custom migration
-- (lov_database--migration) and the file is removed from here. Design and decisions:
-- docs/security/d5-design.md. Requirement: mem constraint "admin-only" / AGENTS.md.
--
-- Executed by the migrator identity: objects in public are owned by postgres, and every
-- grant this file revokes was issued by postgres (evidence:
-- docs/security/evidence/prod-platform-identity.txt §P2, §P6, §P11). The helper's
-- postcondition aborts the whole transaction if any REVOKE silently had no effect.
--
-- Not touched on purpose: the M1.1 canonical ACLs of anon/authenticated/service_role on
-- sec_* (only sandbox_exec* and hygiene privileges change there), sec_is_admin(),
-- global default privileges (pg_default_acl), schemas owned by supabase_* roles (auth,
-- net, cron, realtime) and every grant issued by supabase_storage_admin.

-- ============================================================ 0. executing identity
-- The design relies on the migrator being postgres (owner of public, issuer of every grant
-- revoked below). Ownership evidence shows current_user = postgres for past migrations but
-- not the session_user of the Lovable migration process (docs/security/d5-design.md §2).
-- Assert it here, so the migration aborts under any other identity, and record both
-- values in the migration output.
DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'D5 must run as the migrator postgres (current_user=%, session_user=%)', current_user, session_user;
  END IF;
  RAISE NOTICE 'D5 executing identity: current_user=%, session_user=%', current_user, session_user;
END $$;

-- ============================================================ 1. admin helper
-- Same pattern as sec_is_admin(): no arguments (cannot probe arbitrary UUIDs), STABLE,
-- SECURITY DEFINER owned by postgres, empty search_path, false without a JWT subject.
-- Reads user_roles directly so that has_role() can be withdrawn from authenticated.
CREATE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false
              ELSE EXISTS (SELECT 1 FROM public.user_roles ur
                           WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role) END
$$;
ALTER FUNCTION public.is_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated, service_role;
-- anon/authenticated evaluate it inside RLS policies (e.g. "published OR is_admin()").
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
COMMENT ON FUNCTION public.is_admin() IS
  'Admin-only model: true only for the JWT subject holding the admin role. Use in every write policy.';

-- ============================================================ 2. single administrator
-- At most one admin row, whatever path writes it (including privileged ones).
CREATE UNIQUE INDEX user_roles_single_admin ON public.user_roles (role) WHERE role = 'admin';

-- ============================================================ 3. policies: writes only via is_admin()
-- theses — public reads published; admin reads all and is the only writer.
DROP POLICY "Anyone can view published theses" ON public.theses;
DROP POLICY "Users can view their own theses" ON public.theses;
DROP POLICY "Users can create their own theses" ON public.theses;
DROP POLICY "Users can update their own theses" ON public.theses;
DROP POLICY "Users can delete their own theses" ON public.theses;
CREATE POLICY theses_read ON public.theses FOR SELECT TO anon, authenticated
  USING (is_published = true OR public.is_admin());
CREATE POLICY theses_admin_insert ON public.theses FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY theses_admin_update ON public.theses FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY theses_admin_delete ON public.theses FOR DELETE TO authenticated USING (public.is_admin());

-- public_thesis_data — same model (anon keeps its curated column-level SELECT).
DROP POLICY "Anyone can view published thesis data" ON public.public_thesis_data;
DROP POLICY "Only owners can view their thesis data directly" ON public.public_thesis_data;
DROP POLICY "Users can view their own thesis data" ON public.public_thesis_data;
DROP POLICY "Users can create their own thesis data" ON public.public_thesis_data;
DROP POLICY "Users can update their own thesis data" ON public.public_thesis_data;
DROP POLICY "Users can delete their own thesis data" ON public.public_thesis_data;
CREATE POLICY ptd_read ON public.public_thesis_data FOR SELECT TO anon, authenticated
  USING (published_at IS NOT NULL OR public.is_admin());
CREATE POLICY ptd_admin_insert ON public.public_thesis_data FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY ptd_admin_update ON public.public_thesis_data FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY ptd_admin_delete ON public.public_thesis_data FOR DELETE TO authenticated USING (public.is_admin());

-- analysis_workspaces, thesis_purchases — admin only, reads included.
DROP POLICY "Users can view their own workspaces" ON public.analysis_workspaces;
DROP POLICY "Users can create their own workspaces" ON public.analysis_workspaces;
DROP POLICY "Users can update their own workspaces" ON public.analysis_workspaces;
DROP POLICY "Users can delete their own workspaces" ON public.analysis_workspaces;
CREATE POLICY aw_admin_read ON public.analysis_workspaces FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY aw_admin_insert ON public.analysis_workspaces FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY aw_admin_update ON public.analysis_workspaces FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY aw_admin_delete ON public.analysis_workspaces FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY "Users can view their own purchases" ON public.thesis_purchases;
DROP POLICY "Users can create their own purchases" ON public.thesis_purchases;
DROP POLICY "Users can update their own purchases" ON public.thesis_purchases;
DROP POLICY "Users can delete their own purchases" ON public.thesis_purchases;
CREATE POLICY tp_admin_read ON public.thesis_purchases FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY tp_admin_insert ON public.thesis_purchases FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY tp_admin_update ON public.thesis_purchases FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY tp_admin_delete ON public.thesis_purchases FOR DELETE TO authenticated USING (public.is_admin());

-- thesis_alerts — created only by the alerts server function (service_role); admin reads,
-- acknowledges and deletes.
DROP POLICY "Users can view their own alerts" ON public.thesis_alerts;
DROP POLICY "Users can update their own alerts" ON public.thesis_alerts;
DROP POLICY "Users can delete their own alerts" ON public.thesis_alerts;
CREATE POLICY ta_admin_read ON public.thesis_alerts FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY ta_admin_update ON public.thesis_alerts FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY ta_admin_delete ON public.thesis_alerts FOR DELETE TO authenticated USING (public.is_admin());

-- profiles — D-c: admin only (the signup trigger handle_new_user keeps working: it runs
-- as its owner postgres, and server-side sign-up stays disabled).
DROP POLICY "Users can view their own profile" ON public.profiles;
DROP POLICY "Users can insert their own profile" ON public.profiles;
DROP POLICY "Users can update their own profile" ON public.profiles;
CREATE POLICY profiles_admin_read ON public.profiles FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY profiles_admin_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY profiles_admin_update ON public.profiles FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY profiles_admin_delete ON public.profiles FOR DELETE TO authenticated USING (public.is_admin());

-- page_content — public read; admin inserts/updates (adds the missing WITH CHECK).
DROP POLICY "Admins can insert page content" ON public.page_content;
DROP POLICY "Admins can update page content" ON public.page_content;
CREATE POLICY pc_admin_insert ON public.page_content FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY pc_admin_update ON public.page_content FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- user_roles — D-b: no write through the API for anyone, admin included. Each account may
-- read only its own rows; admin status for the UI comes from rpc('is_admin').
DROP POLICY "Admins can view all roles" ON public.user_roles;
DROP POLICY "Admins can insert roles" ON public.user_roles;
DROP POLICY "Admins can delete roles" ON public.user_roles;

-- ============================================================ 4. explicit table privileges
-- Only write privileges are revoked (table-level REVOKE ALL would also drop anon's curated
-- column-level SELECT on public_thesis_data). Defense in depth on top of RLS.
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon, authenticated, service_role;
REVOKE SELECT ON public.analysis_workspaces, public.thesis_purchases, public.thesis_alerts,
                 public.profiles, public.user_roles FROM anon;
REVOKE INSERT ON public.thesis_alerts FROM authenticated;
REVOKE DELETE ON public.page_content FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.public_thesis_data_view FROM authenticated, service_role;

-- service_role: only what the two authorised server functions need (inventory in
-- docs/security/d5-design.md §4). update-prices: theses(current_price, sparkline_data).
-- check-thesis-alerts: public_thesis_data(4 review columns), thesis_alerts INSERT + email_sent.
REVOKE INSERT, UPDATE, DELETE ON public.analysis_workspaces, public.page_content, public.profiles,
                                 public.thesis_purchases FROM service_role;
REVOKE INSERT, UPDATE, DELETE ON public.theses, public.public_thesis_data FROM service_role;
REVOKE UPDATE, DELETE ON public.thesis_alerts FROM service_role;
GRANT UPDATE (current_price, sparkline_data) ON public.theses TO service_role;
GRANT UPDATE (last_alert_sent_at, alert_type, needs_review, price_at_last_check) ON public.public_thesis_data TO service_role;
GRANT UPDATE (email_sent) ON public.thesis_alerts TO service_role;

-- has_role(uuid, app_role): kept only for its internal use by the server functions
-- (service_role) and sec_is_admin() (runs as postgres). No policy calls it any more.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
-- Trigger functions are never called directly; firing a trigger does not check EXECUTE.
REVOKE EXECUTE ON FUNCTION public.handle_new_user(), public.update_updated_at_column() FROM service_role;

-- Safe search_path for every reviewed SECURITY DEFINER routine (guard G5): empty, like
-- is_admin()/sec_is_admin(). Both bodies already use schema-qualified names
-- (public.user_roles, public.profiles), so behaviour is unchanged; search_path = public
-- left the implicit pg_temp first for relation and type names (PostgreSQL docs,
-- "Writing SECURITY DEFINER Functions Safely").
ALTER FUNCTION public.has_role(uuid, public.app_role) SET search_path = '';
ALTER FUNCTION public.handle_new_user() SET search_path = '';

-- ============================================================ 5. storage metadata tables
-- sandbox_exec* received SELECT, INSERT on storage.buckets/objects from postgres through
-- postgres's default privileges in schema storage (§P5/§P6). The baseline helper (6)
-- withdraws those postgres-issued grants, table- and column-level, and verifies the
-- effective result; grants issued by supabase_storage_admin to anon/authenticated are left
-- to the platform (RLS is on with zero policies, so they cannot be used).

-- ============================================================ 6. baseline helper (replaces D4)
-- Default-deny enforcement over EVERY object in schema public (and the two Storage
-- metadata tables) of the reviewed privilege inventory, so that the default privileges of
-- postgres (ALL to anon/authenticated/service_role on new tables, sequences and routines;
-- SELECT/INSERT and EXECUTE to sandbox_exec*) never survive a migration (d5-design.md §11,
-- D-f). Reviewed inventory (who = anon | authenticated | service_role | sandbox, the last
-- standing for every sandbox_exec* role):
--   _allow_w : write privileges ('who|relation|privilege|column', '*' = table level).
--              Everything else — INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER,
--              MAINTAIN, table or column level; sequence USAGE/UPDATE — is revoked.
--   _allow_x : EXECUTE ('who|routine', full signature). Everything else is revoked, so a
--              new routine (overloads included) is executable by nobody but its owner.
--   PUBLIC   : nothing on relations, columns, sequences or routines.
--   Storage  : sandbox_exec* write nothing on storage.buckets / storage.objects.
-- Both lists MUST equal allow_w / allow_x of validation/security/sql/admin-only-acl-guard.sql
-- (compared by validation/security/d5/run-d5-simulation.sh step 6). A migration that needs
-- a new grant therefore changes the reviewed inventory in BOTH places (CREATE OR REPLACE of
-- this function in the same migration); the guard judges the result in CI.
-- SELECT is never touched: reads are judged by RLS, and every table in public must have
-- RLS enabled — otherwise the helper aborts (it never enables RLS silently).
-- A table-level grant outside the inventory on a relation whose inventory lists columns
-- for the same privilege is narrowed: REVOKE at table level (PostgreSQL also clears the
-- column grants of that privilege), then GRANT of exactly the reviewed columns. This is
-- the only GRANT the helper issues, and it can only reduce the effective privilege.
-- Postcondition on EFFECTIVE privileges (explicit, PUBLIC or inherited; table and column):
-- if any path outside the inventory remains — typically a grant issued by a role other
-- than the caller, which a REVOKE silently ignores — or a table has RLS off, the whole
-- transaction aborts and every offending path is named.
-- Every future migration that creates objects in public (M1.2 included) ends with
--   SELECT public.enforce_privilege_baseline();
-- in the same transaction, so no other session ever sees the default grants
-- (checked statically by validation/security/check-baseline-call.sh).
CREATE FUNCTION public.enforce_privilege_baseline() RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  _o record; _r record; _p text; _c text; _t text; _n integer := 0; _left text;
  _platform constant text := '^sandbox_exec(_[a-z0-9]+)?$';
  _wprivs constant text[] := ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];
  -- Reviewed write inventory: must equal allow_w of admin-only-acl-guard.sql.
  _allow_w constant text[] := ARRAY[
    'authenticated|theses|INSERT|*', 'authenticated|theses|UPDATE|*', 'authenticated|theses|DELETE|*',
    'authenticated|public_thesis_data|INSERT|*', 'authenticated|public_thesis_data|UPDATE|*', 'authenticated|public_thesis_data|DELETE|*',
    'authenticated|analysis_workspaces|INSERT|*', 'authenticated|analysis_workspaces|UPDATE|*', 'authenticated|analysis_workspaces|DELETE|*',
    'authenticated|thesis_purchases|INSERT|*', 'authenticated|thesis_purchases|UPDATE|*', 'authenticated|thesis_purchases|DELETE|*',
    'authenticated|profiles|INSERT|*', 'authenticated|profiles|UPDATE|*', 'authenticated|profiles|DELETE|*',
    'authenticated|thesis_alerts|UPDATE|*', 'authenticated|thesis_alerts|DELETE|*',
    'authenticated|page_content|INSERT|*', 'authenticated|page_content|UPDATE|*',
    'service_role|theses|UPDATE|current_price', 'service_role|theses|UPDATE|sparkline_data',
    'service_role|public_thesis_data|UPDATE|last_alert_sent_at', 'service_role|public_thesis_data|UPDATE|alert_type',
    'service_role|public_thesis_data|UPDATE|needs_review', 'service_role|public_thesis_data|UPDATE|price_at_last_check',
    'service_role|thesis_alerts|INSERT|*', 'service_role|thesis_alerts|UPDATE|email_sent',
    'service_role|sec_companies|INSERT|*', 'service_role|sec_companies|UPDATE|*',
    'service_role|sec_ticker_mappings|INSERT|*', 'service_role|sec_ticker_mappings|UPDATE|*',
    'service_role|sec_ingestion_runs|INSERT|*', 'service_role|sec_filings|INSERT|*',
    'service_role|sec_raw_facts|INSERT|*', 'service_role|sec_raw_fact_observations|INSERT|*',
    'service_role|sec_normalized_facts|INSERT|*', 'service_role|sec_normalized_facts|UPDATE|*',
    'service_role|sec_normalized_fact_sources|INSERT|*'];
  -- Reviewed EXECUTE inventory: must equal allow_x of admin-only-acl-guard.sql. The trigger
  -- functions (handle_new_user, update_updated_at_column, sec_*guard/check) and this helper
  -- are in the inventory of the guard but executable by nobody: firing a trigger does not
  -- check EXECUTE, and attaching one (CREATE TRIGGER) must stay impossible for API and
  -- platform roles.
  _allow_x constant text[] := ARRAY[
    'anon|public.is_admin()', 'anon|public.sec_is_admin()',
    'authenticated|public.is_admin()', 'authenticated|public.sec_is_admin()',
    'sandbox|public.is_admin()', 'sandbox|public.sec_is_admin()',
    'service_role|public.has_role(uuid,public.app_role)',
    'service_role|public.sec_record_download(uuid,integer,text,bigint,bytea)',
    'service_role|public.sec_fail_run(uuid,text,jsonb)', 'service_role|public.sec_fail_stale_runs(interval)',
    'service_role|public.sec_finalize_run(uuid,jsonb,jsonb)'];
  _storage constant text[] := ARRAY['storage.buckets', 'storage.objects'];
BEGIN
  -- 1. relations of public: table-level write privileges outside the inventory
  FOR _o IN SELECT c.oid, c.relname::text AS relname FROM pg_catalog.pg_class c
            WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v','m','f') ORDER BY c.oid LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON TABLE %s FROM PUBLIC', _o.oid::regclass);
    FOR _r IN SELECT ro.oid, ro.rolname::text AS rolname,
                     CASE WHEN ro.rolname ~ _platform THEN 'sandbox' ELSE ro.rolname::text END AS who
              FROM pg_catalog.pg_roles ro
              WHERE ro.rolname IN ('anon', 'authenticated', 'service_role') OR ro.rolname ~ _platform ORDER BY 2 LOOP
      FOREACH _p IN ARRAY _wprivs LOOP
        CONTINUE WHEN (_r.who || '|' || _o.relname || '|' || _p || '|*') = ANY (_allow_w);
        CONTINUE WHEN NOT pg_catalog.has_table_privilege(_r.oid, _o.oid, _p);
        EXECUTE pg_catalog.format('REVOKE %s ON TABLE %s FROM %I', _p, _o.oid::regclass, _r.rolname);
        -- narrowing to the reviewed columns (the table-level grant covered them all)
        FOR _c IN SELECT pg_catalog.split_part(a, '|', 4) FROM pg_catalog.unnest(_allow_w) a
                  WHERE a LIKE (_r.who || '|' || _o.relname || '|' || _p || '|%') AND a NOT LIKE '%|*' ORDER BY 1 LOOP
          EXECUTE pg_catalog.format('GRANT %s (%I) ON TABLE %s TO %I', _p, _c, _o.oid::regclass, _r.rolname);
        END LOOP;
      END LOOP;
    END LOOP;
    _n := _n + 1;
  END LOOP;

  -- 2. explicit column-level write grants in public outside the inventory (column SELECT
  --    grants such as anon's curated public_thesis_data columns are untouched)
  FOR _o IN
    SELECT c.oid AS rel, c.relname::text AS relname, a.attname::text AS attname, x.privilege_type AS priv,
           CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee)::text END AS grantee
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
    CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) x
    WHERE c.relnamespace = 'public'::regnamespace AND x.privilege_type IN ('INSERT', 'UPDATE', 'REFERENCES')
    ORDER BY c.oid, a.attnum, x.privilege_type
  LOOP
    CONTINUE WHEN _o.grantee NOT IN ('PUBLIC', 'anon', 'authenticated', 'service_role') AND _o.grantee !~ _platform;
    _t := CASE WHEN _o.grantee ~ _platform THEN 'sandbox' ELSE _o.grantee END;
    CONTINUE WHEN _t <> 'PUBLIC'
              AND ((_t || '|' || _o.relname || '|' || _o.priv || '|*') = ANY (_allow_w)
                   OR (_t || '|' || _o.relname || '|' || _o.priv || '|' || _o.attname) = ANY (_allow_w));
    EXECUTE pg_catalog.format('REVOKE %s (%I) ON TABLE %s FROM %s', _o.priv, _o.attname, _o.rel::regclass,
                              CASE WHEN _o.grantee = 'PUBLIC' THEN 'PUBLIC' ELSE pg_catalog.quote_ident(_o.grantee) END);
  END LOOP;

  -- 3. sequences of public: USAGE/UPDATE only if reviewed (none today)
  FOR _o IN SELECT c.oid, c.relname::text AS relname FROM pg_catalog.pg_class c
            WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'S' ORDER BY c.oid LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC', _o.oid::regclass);
    FOR _r IN SELECT ro.oid, ro.rolname::text AS rolname,
                     CASE WHEN ro.rolname ~ _platform THEN 'sandbox' ELSE ro.rolname::text END AS who
              FROM pg_catalog.pg_roles ro
              WHERE ro.rolname IN ('anon', 'authenticated', 'service_role') OR ro.rolname ~ _platform ORDER BY 2 LOOP
      FOREACH _p IN ARRAY ARRAY['USAGE', 'UPDATE'] LOOP
        CONTINUE WHEN (_r.who || '|' || _o.relname || '|' || _p || '|*') = ANY (_allow_w);
        CONTINUE WHEN NOT pg_catalog.has_sequence_privilege(_r.oid, _o.oid, _p);
        EXECUTE pg_catalog.format('REVOKE %s ON SEQUENCE %s FROM %I', _p, _o.oid::regclass, _r.rolname);
      END LOOP;
    END LOOP;
    _n := _n + 1;
  END LOOP;

  -- 4. Storage metadata tables: platform roles write nothing (table level clears columns)
  FOREACH _t IN ARRAY _storage LOOP
    CONTINUE WHEN pg_catalog.to_regclass(_t) IS NULL;
    FOR _r IN SELECT rolname::text AS rolname FROM pg_catalog.pg_roles WHERE rolname ~ _platform ORDER BY 1 LOOP
      EXECUTE pg_catalog.format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE %s FROM %I', _t, _r.rolname);
    END LOOP;
  END LOOP;

  -- 5. routines of public, by full signature: EXECUTE only if reviewed
  FOR _o IN SELECT p.oid FROM pg_catalog.pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f','p') ORDER BY p.oid LOOP
    EXECUTE pg_catalog.format('REVOKE EXECUTE ON ROUTINE %s FROM PUBLIC', _o.oid::regprocedure);
    FOR _r IN SELECT ro.oid, ro.rolname::text AS rolname,
                     CASE WHEN ro.rolname ~ _platform THEN 'sandbox' ELSE ro.rolname::text END AS who
              FROM pg_catalog.pg_roles ro
              WHERE ro.rolname IN ('anon', 'authenticated', 'service_role') OR ro.rolname ~ _platform ORDER BY 2 LOOP
      CONTINUE WHEN EXISTS (SELECT 1 FROM pg_catalog.unnest(_allow_x) a
                            WHERE pg_catalog.split_part(a, '|', 1) = _r.who
                              AND pg_catalog.to_regprocedure(pg_catalog.split_part(a, '|', 2))::oid = _o.oid);
      CONTINUE WHEN NOT pg_catalog.has_function_privilege(_r.oid, _o.oid, 'EXECUTE');
      EXECUTE pg_catalog.format('REVOKE EXECUTE ON ROUTINE %s FROM %I', _o.oid::regprocedure, _r.rolname);
    END LOOP;
    _n := _n + 1;
  END LOOP;

  -- 6. postcondition on effective privileges and RLS
  WITH ro AS (
    SELECT r.oid, r.rolname::text AS rolname, CASE WHEN r.rolname ~ _platform THEN 'sandbox' ELSE r.rolname::text END AS who
    FROM pg_catalog.pg_roles r WHERE r.rolname IN ('anon', 'authenticated', 'service_role') OR r.rolname ~ _platform),
  rel AS (
    SELECT c.oid, c.relname::text AS relname, c.relkind, c.relrowsecurity, c.relacl, c.relowner
    FROM pg_catalog.pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v','m','f','S'))
  SELECT pg_catalog.string_agg(v.path, ', ' ORDER BY v.path) INTO _left FROM (
    SELECT 'RLS disabled on ' || rel.oid::regclass::text AS path FROM rel WHERE rel.relkind IN ('r','p') AND NOT rel.relrowsecurity
    UNION ALL
    SELECT 'PUBLIC holds ' || a.privilege_type || ' on ' || rel.oid::regclass::text
    FROM rel CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(rel.relacl,
           pg_catalog.acldefault(CASE WHEN rel.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, rel.relowner))) a
    WHERE a.grantee = 0
    UNION ALL
    -- column ACLs granted directly to PUBLIC (any privilege, SELECT included). Step 1's
    -- REVOKE ALL ON TABLE ... FROM PUBLIC also clears the column grants it issued; a column
    -- grant to PUBLIC made by another grantor (WITH GRANT OPTION chain) survives it and
    -- must abort here instead of passing silently.
    SELECT 'PUBLIC holds column ' || x.privilege_type || ' (' || a.attname::text || ') on ' || rel.oid::regclass::text
    FROM rel JOIN pg_catalog.pg_attribute a ON a.attrelid = rel.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
    CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) x
    WHERE x.grantee = 0
    UNION ALL
    -- table level
    SELECT ro.rolname || ' ' || p.p || ' on ' || rel.oid::regclass::text
    FROM rel CROSS JOIN ro CROSS JOIN pg_catalog.unnest(_wprivs) p(p)
    WHERE rel.relkind <> 'S' AND pg_catalog.has_table_privilege(ro.oid, rel.oid, p.p)
      AND NOT (ro.who || '|' || rel.relname || '|' || p.p || '|*') = ANY (_allow_w)
    UNION ALL
    -- column level (without the table-level privilege)
    SELECT ro.rolname || ' ' || p.p || ' (' || a.attname || ') on ' || rel.oid::regclass::text
    FROM rel JOIN pg_catalog.pg_attribute a ON a.attrelid = rel.oid AND a.attnum > 0 AND NOT a.attisdropped
    CROSS JOIN ro CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('REFERENCES')) p(p)
    WHERE rel.relkind <> 'S' AND NOT pg_catalog.has_table_privilege(ro.oid, rel.oid, p.p)
      AND pg_catalog.has_column_privilege(ro.oid, rel.oid, a.attnum, p.p)
      AND NOT (ro.who || '|' || rel.relname || '|' || p.p || '|' || a.attname) = ANY (_allow_w)
    UNION ALL
    SELECT ro.rolname || ' ' || p.p || ' on sequence ' || rel.oid::regclass::text
    FROM rel CROSS JOIN ro CROSS JOIN (VALUES ('USAGE'), ('UPDATE')) p(p)
    WHERE rel.relkind = 'S' AND pg_catalog.has_sequence_privilege(ro.oid, rel.oid, p.p)
      AND NOT (ro.who || '|' || rel.relname || '|' || p.p || '|*') = ANY (_allow_w)
    UNION ALL
    SELECT 'PUBLIC executes ' || f.oid::regprocedure::text
    FROM pg_catalog.pg_proc f CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(f.proacl, pg_catalog.acldefault('f'::"char", f.proowner))) a
    WHERE f.pronamespace = 'public'::regnamespace AND f.prokind IN ('f','p') AND a.grantee = 0
    UNION ALL
    SELECT ro.rolname || ' executes ' || f.oid::regprocedure::text
    FROM pg_catalog.pg_proc f CROSS JOIN ro
    WHERE f.pronamespace = 'public'::regnamespace AND f.prokind IN ('f','p')
      AND pg_catalog.has_function_privilege(ro.oid, f.oid, 'EXECUTE')
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.unnest(_allow_x) x
                      WHERE pg_catalog.split_part(x, '|', 1) = ro.who
                        AND pg_catalog.to_regprocedure(pg_catalog.split_part(x, '|', 2))::oid = f.oid)
    UNION ALL
    SELECT ro.rolname || ' writes ' || t.t
    FROM pg_catalog.unnest(_storage) t(t) CROSS JOIN ro
    WHERE ro.who = 'sandbox' AND pg_catalog.to_regclass(t.t) IS NOT NULL
      AND (pg_catalog.has_table_privilege(ro.oid, pg_catalog.to_regclass(t.t), 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
           OR pg_catalog.has_any_column_privilege(ro.oid, pg_catalog.to_regclass(t.t), 'INSERT, UPDATE, REFERENCES'))
  ) v;
  IF _left IS NOT NULL THEN
    RAISE EXCEPTION 'enforce_privilege_baseline: privilege path(s) remain or RLS is off (caller must be the issuer of the grants): %', _left;
  END IF;
  RETURN _n;
END $$;
ALTER FUNCTION public.enforce_privilege_baseline() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_privilege_baseline() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.enforce_privilege_baseline() IS
  'Admin-only model: call as the last statement of every migration that creates objects in public.';

SELECT public.enforce_privilege_baseline();

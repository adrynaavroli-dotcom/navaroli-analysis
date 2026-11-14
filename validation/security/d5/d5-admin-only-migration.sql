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

-- ============================================================ 5. storage metadata tables
-- sandbox_exec* received SELECT, INSERT on storage.buckets/objects from postgres through
-- postgres's default privileges in schema storage (§P5/§P6). The baseline helper (6)
-- withdraws those postgres-issued grants, table- and column-level, and verifies the
-- effective result; grants issued by supabase_storage_admin to anon/authenticated are left
-- to the platform (RLS is on with zero policies, so they cannot be used).

-- ============================================================ 6. baseline helper (replaces D4)
-- Enforces, over EVERY object in schema public (and the two Storage metadata tables), the
-- invariants that the default privileges of postgres would otherwise break on each new
-- object (d5-design.md §11, D-f):
--   sandbox_exec*  : relations SELECT only (table AND column level); no sequence
--                    USAGE/UPDATE; EXECUTE only on is_admin() and sec_is_admin(), matched by
--                    full signature (an overload such as is_admin(uuid) gets nothing);
--                    no write of any kind on storage.buckets / storage.objects;
--   anon           : no write privilege on any relation, table or column level; no
--                    sequence USAGE/UPDATE;
--   authenticated  : no column-level INSERT/UPDATE (its writes are table-level and judged
--                    by RLS is_admin());
--   service_role   : column-level INSERT/UPDATE only on the server-function inventory
--                    (_svc_columns, d5-design.md §4);
--   all API roles  : no TRUNCATE, REFERENCES (table or column), TRIGGER, MAINTAIN;
--   PUBLIC         : nothing on relations, columns, sequences or routines.
-- Table-level decisions for authenticated/service_role stay explicit in each migration and
-- are judged by the CI guard (validation/security/sql/admin-only-acl-guard.sql).
-- A table-level REVOKE also clears the caller's column grants of the same type (PostgreSQL
-- REVOKE semantics); explicit column ACL entries are still walked so that column grants to
-- authenticated/service_role (which keep table-level privileges) are handled too.
-- Postcondition on EFFECTIVE privileges (explicit, PUBLIC or inherited; table and column):
-- if any path remains — typically a grant issued by a role other than the caller, which a
-- REVOKE silently ignores — the whole transaction aborts and the offending paths are named.
-- Every future migration that creates objects in public (M1.2 included) ends with
--   SELECT public.enforce_privilege_baseline();
-- in the same transaction, so no other session ever sees the default grants
-- (checked statically by validation/security/check-baseline-call.sh).
CREATE FUNCTION public.enforce_privilege_baseline() RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  _o record; _r text; _t text; _n integer := 0; _left text;
  _platform constant text := '^sandbox_exec(_[a-z0-9]+)?$';
  _read_helpers constant regprocedure[] := ARRAY[pg_catalog.to_regprocedure('public.is_admin()'),
                                                 pg_catalog.to_regprocedure('public.sec_is_admin()')];
  -- Must equal the service_role column rows of allow_w in admin-only-acl-guard.sql
  -- (compared by validation/security/d5/run-d5-simulation.sh).
  _svc_columns constant text[] := ARRAY[
    'theses.current_price:UPDATE', 'theses.sparkline_data:UPDATE',
    'public_thesis_data.last_alert_sent_at:UPDATE', 'public_thesis_data.alert_type:UPDATE',
    'public_thesis_data.needs_review:UPDATE', 'public_thesis_data.price_at_last_check:UPDATE',
    'thesis_alerts.email_sent:UPDATE'];
  _storage constant text[] := ARRAY['storage.buckets', 'storage.objects'];
BEGIN
  -- 1. relations and sequences of public: table level
  FOR _o IN SELECT c.oid, c.relkind FROM pg_catalog.pg_class c
            WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v','m','f','S') ORDER BY c.oid LOOP
    IF _o.relkind = 'S' THEN
      EXECUTE pg_catalog.format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC', _o.oid::regclass);
      EXECUTE pg_catalog.format('REVOKE USAGE, UPDATE ON SEQUENCE %s FROM anon', _o.oid::regclass);
    ELSE
      EXECUTE pg_catalog.format('REVOKE ALL ON TABLE %s FROM PUBLIC', _o.oid::regclass);
      EXECUTE pg_catalog.format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE %s FROM anon', _o.oid::regclass);
      EXECUTE pg_catalog.format('REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE %s FROM authenticated, service_role', _o.oid::regclass);
    END IF;
    FOR _r IN SELECT rolname FROM pg_catalog.pg_roles WHERE rolname ~ _platform ORDER BY 1 LOOP
      IF _o.relkind = 'S' THEN
        EXECUTE pg_catalog.format('REVOKE USAGE, UPDATE ON SEQUENCE %s FROM %I', _o.oid::regclass, _r);
      ELSE
        EXECUTE pg_catalog.format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE %s FROM %I', _o.oid::regclass, _r);
      END IF;
    END LOOP;
    _n := _n + 1;
  END LOOP;

  -- 2. explicit column-level write grants in public (INSERT, UPDATE, REFERENCES; column
  --    SELECT grants such as anon's curated public_thesis_data columns are untouched)
  FOR _o IN
    SELECT c.oid AS rel, c.relname::text AS relname, a.attname::text AS attname, x.privilege_type AS priv,
           CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee)::text END AS grantee
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
    CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) x
    WHERE c.relnamespace = 'public'::regnamespace AND x.privilege_type IN ('INSERT', 'UPDATE', 'REFERENCES')
    ORDER BY c.oid, a.attnum, x.privilege_type
  LOOP
    CONTINUE WHEN _o.grantee = 'service_role' AND _o.priv <> 'REFERENCES'
                  AND (_o.relname || '.' || _o.attname || ':' || _o.priv) = ANY (_svc_columns);
    CONTINUE WHEN _o.grantee NOT IN ('PUBLIC', 'anon', 'authenticated', 'service_role') AND _o.grantee !~ _platform;
    EXECUTE pg_catalog.format('REVOKE %s (%I) ON TABLE %s FROM %s', _o.priv, _o.attname, _o.rel::regclass,
                              CASE WHEN _o.grantee = 'PUBLIC' THEN 'PUBLIC' ELSE pg_catalog.quote_ident(_o.grantee) END);
  END LOOP;

  -- 3. Storage metadata tables: platform roles write nothing (table level clears columns)
  FOREACH _t IN ARRAY _storage LOOP
    CONTINUE WHEN pg_catalog.to_regclass(_t) IS NULL;
    FOR _r IN SELECT rolname FROM pg_catalog.pg_roles WHERE rolname ~ _platform ORDER BY 1 LOOP
      EXECUTE pg_catalog.format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE %s FROM %I', _t, _r);
    END LOOP;
  END LOOP;

  -- 4. routines of public, by full signature
  FOR _o IN SELECT p.oid FROM pg_catalog.pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f','p') ORDER BY p.oid LOOP
    EXECUTE pg_catalog.format('REVOKE EXECUTE ON ROUTINE %s FROM PUBLIC', _o.oid::regprocedure);
    IF NOT _o.oid::regprocedure = ANY (_read_helpers) THEN
      FOR _r IN SELECT rolname FROM pg_catalog.pg_roles WHERE rolname ~ _platform ORDER BY 1 LOOP
        EXECUTE pg_catalog.format('REVOKE EXECUTE ON ROUTINE %s FROM %I', _o.oid::regprocedure, _r);
      END LOOP;
    END IF;
    _n := _n + 1;
  END LOOP;

  -- 5. postcondition on effective privileges
  SELECT pg_catalog.string_agg(v.path, ', ' ORDER BY v.path) INTO _left FROM (
    -- anon and platform roles: no write of any kind, table or column level
    SELECT r.rolname || ' writes ' || c.oid::regclass::text AS path
    FROM pg_catalog.pg_class c CROSS JOIN pg_catalog.pg_roles r
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v','m','f')
      AND (r.rolname ~ _platform OR r.rolname = 'anon')
      AND (pg_catalog.has_table_privilege(r.oid, c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
           OR pg_catalog.has_any_column_privilege(r.oid, c.oid, 'INSERT, UPDATE, REFERENCES'))
    UNION ALL
    -- authenticated/service_role: no TRUNCATE/TRIGGER/MAINTAIN, no REFERENCES at any level
    SELECT r.rolname || ' TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on ' || c.oid::regclass::text
    FROM pg_catalog.pg_class c CROSS JOIN pg_catalog.pg_roles r
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v','m','f')
      AND r.rolname IN ('authenticated', 'service_role')
      AND (pg_catalog.has_table_privilege(r.oid, c.oid, 'TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
           OR pg_catalog.has_any_column_privilege(r.oid, c.oid, 'REFERENCES'))
    UNION ALL
    -- authenticated/service_role: column-level INSERT/UPDATE outside the inventory
    SELECT r.rolname || ' ' || p.priv || ' (' || a.attname || ') on ' || c.oid::regclass::text
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    CROSS JOIN pg_catalog.pg_roles r CROSS JOIN (VALUES ('INSERT'), ('UPDATE')) p(priv)
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v','m','f')
      AND r.rolname IN ('authenticated', 'service_role')
      AND NOT pg_catalog.has_table_privilege(r.oid, c.oid, p.priv)
      AND pg_catalog.has_column_privilege(r.oid, c.oid, a.attnum, p.priv)
      AND NOT (r.rolname = 'service_role' AND (c.relname || '.' || a.attname || ':' || p.priv) = ANY (_svc_columns))
    UNION ALL
    SELECT r.rolname || ' uses sequence ' || c.oid::regclass::text
    FROM pg_catalog.pg_class c CROSS JOIN pg_catalog.pg_roles r
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'S'
      AND (r.rolname ~ _platform OR r.rolname = 'anon') AND pg_catalog.has_sequence_privilege(r.oid, c.oid, 'USAGE, UPDATE')
    UNION ALL
    SELECT r.rolname || ' executes ' || p.oid::regprocedure::text
    FROM pg_catalog.pg_proc p CROSS JOIN pg_catalog.pg_roles r
    WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f','p') AND r.rolname ~ _platform
      AND NOT p.oid::regprocedure = ANY (_read_helpers) AND pg_catalog.has_function_privilege(r.oid, p.oid, 'EXECUTE')
    UNION ALL
    SELECT r.rolname || ' writes ' || t.t
    FROM pg_catalog.unnest(_storage) t(t) CROSS JOIN pg_catalog.pg_roles r
    WHERE r.rolname ~ _platform AND pg_catalog.to_regclass(t.t) IS NOT NULL
      AND (pg_catalog.has_table_privilege(r.oid, pg_catalog.to_regclass(t.t), 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
           OR pg_catalog.has_any_column_privilege(r.oid, pg_catalog.to_regclass(t.t), 'INSERT, UPDATE, REFERENCES'))
  ) v;
  IF _left IS NOT NULL THEN
    RAISE EXCEPTION 'enforce_privilege_baseline: privilege path(s) remain (caller must be the issuer of the grants): %', _left;
  END IF;
  RETURN _n;
END $$;
ALTER FUNCTION public.enforce_privilege_baseline() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_privilege_baseline() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.enforce_privilege_baseline() IS
  'Admin-only model: call as the last statement of every migration that creates objects in public.';

SELECT public.enforce_privilege_baseline();

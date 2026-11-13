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
-- postgres's default privileges in schema storage (§P5/§P6). Only those postgres-issued
-- grants are withdrawn; grants issued by supabase_storage_admin are left to the platform
-- (RLS is on with zero policies, so anon/authenticated cannot use them).
DO $$
DECLARE _t text; _r text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['storage.buckets', 'storage.objects'] LOOP
    CONTINUE WHEN pg_catalog.to_regclass(_t) IS NULL;
    FOR _r IN SELECT rolname FROM pg_catalog.pg_roles WHERE rolname ~ '^sandbox_exec(_[a-z0-9]+)?$' LOOP
      EXECUTE pg_catalog.format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON %s FROM %I', _t, _r);
      IF pg_catalog.has_table_privilege(_r, _t, 'INSERT, UPDATE, DELETE, TRUNCATE') THEN
        RAISE EXCEPTION 'D5: % still writes %', _r, _t; END IF;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================ 6. baseline helper (replaces D4)
-- Enforces, over EVERY object in schema public, the invariants that the default
-- privileges of postgres would otherwise break on each new object:
--   sandbox_exec*  : relations SELECT only; no sequence USAGE/UPDATE; EXECUTE only on the
--                    read helpers is_admin() and sec_is_admin();
--   anon           : no write privilege on any relation, no sequence USAGE/UPDATE;
--   all API roles  : no TRUNCATE, REFERENCES, TRIGGER, MAINTAIN;
--   PUBLIC         : nothing on relations, sequences or routines.
-- Per-table decisions for authenticated/service_role stay explicit in each migration and
-- are judged by the CI guard (validation/security/sql/admin-only-acl-guard.sql).
-- Every future migration that creates objects in public (M1.2 included) ends with
--   SELECT public.enforce_privilege_baseline();
-- in the same transaction, so no other session ever sees the default grants.
CREATE FUNCTION public.enforce_privilege_baseline() RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  _o record; _r text; _n integer := 0; _left integer;
  _read_helpers constant text[] := ARRAY['is_admin', 'sec_is_admin'];
  _platform constant text := '^sandbox_exec(_[a-z0-9]+)?$';
BEGIN
  FOR _o IN SELECT c.oid, c.relkind FROM pg_catalog.pg_class c
            WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v','m','f','S') ORDER BY c.oid LOOP
    IF _o.relkind = 'S' THEN
      EXECUTE pg_catalog.format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC', _o.oid::regclass);
      EXECUTE pg_catalog.format('REVOKE USAGE, UPDATE ON SEQUENCE %s FROM anon', _o.oid::regclass);
    ELSE
      EXECUTE pg_catalog.format('REVOKE ALL ON TABLE %s FROM PUBLIC', _o.oid::regclass);
      EXECUTE pg_catalog.format('REVOKE INSERT, UPDATE, DELETE ON TABLE %s FROM anon', _o.oid::regclass);
      EXECUTE pg_catalog.format('REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE %s FROM anon, authenticated, service_role', _o.oid::regclass);
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
  FOR _o IN SELECT p.oid, p.proname FROM pg_catalog.pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f','p') ORDER BY p.oid LOOP
    EXECUTE pg_catalog.format('REVOKE EXECUTE ON ROUTINE %s FROM PUBLIC', _o.oid::regprocedure);
    IF NOT _o.proname = ANY (_read_helpers) THEN
      FOR _r IN SELECT rolname FROM pg_catalog.pg_roles WHERE rolname ~ _platform ORDER BY 1 LOOP
        EXECUTE pg_catalog.format('REVOKE EXECUTE ON ROUTINE %s FROM %I', _o.oid::regprocedure, _r);
      END LOOP;
    END IF;
    _n := _n + 1;
  END LOOP;

  -- Postcondition on EFFECTIVE privileges (explicit, PUBLIC or inherited). A REVOKE by a
  -- role that did not issue the grant only warns; this turns it into a rollback.
  SELECT count(*) INTO _left FROM (
    SELECT 1 FROM pg_catalog.pg_class c CROSS JOIN pg_catalog.pg_roles r
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v','m','f')
      AND ((r.rolname ~ _platform AND pg_catalog.has_table_privilege(r.oid, c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'))
        OR (r.rolname = 'anon' AND pg_catalog.has_table_privilege(r.oid, c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'))
        OR (r.rolname IN ('authenticated','service_role') AND pg_catalog.has_table_privilege(r.oid, c.oid, 'TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')))
    UNION ALL
    SELECT 1 FROM pg_catalog.pg_class c CROSS JOIN pg_catalog.pg_roles r
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'S'
      AND (r.rolname ~ _platform OR r.rolname = 'anon') AND pg_catalog.has_sequence_privilege(r.oid, c.oid, 'USAGE, UPDATE')
    UNION ALL
    SELECT 1 FROM pg_catalog.pg_proc p CROSS JOIN pg_catalog.pg_roles r
    WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f','p') AND r.rolname ~ _platform
      AND NOT p.proname = ANY (_read_helpers) AND pg_catalog.has_function_privilege(r.oid, p.oid, 'EXECUTE')
  ) v;
  IF _left > 0 THEN
    RAISE EXCEPTION 'enforce_privilege_baseline: % privilege path(s) remain (caller must be the issuer of the grants)', _left;
  END IF;
  RETURN _n;
END $$;
ALTER FUNCTION public.enforce_privilege_baseline() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_privilege_baseline() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.enforce_privilege_baseline() IS
  'Admin-only model: call as the last statement of every migration that creates objects in public.';

SELECT public.enforce_privilege_baseline();

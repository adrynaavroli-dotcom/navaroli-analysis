-- FND-001 / D4 — PROPOSAL, NOT APPLIED. Not part of the migration chain.
-- When D4 is authorised this exact text becomes a Drizzle custom migration
-- (lov_database--migration) and the file is removed from here.
--
-- Goal: the platform connection roles sandbox_exec and sandbox_exec_<project-ref>
-- (LOGIN, BYPASSRLS; see docs/fnd001/d3-catalog-report.md §3.2) keep read access to
-- sec_* objects but lose every direct write path: INSERT/UPDATE/DELETE/TRUNCATE/
-- REFERENCES/TRIGGER/MAINTAIN on sec_* relations, USAGE/UPDATE on sec_* sequences and
-- EXECUTE on every sec_* routine except sec_is_admin().
--
-- Scope limits (decided by the user):
--   * global default privileges (pg_default_acl) are NOT modified;
--   * only objects named public.sec_* are touched; has_role(), user_roles and every
--     other public object keep their current ACLs;
--   * ACLs of anon / authenticated / service_role / authenticator are not touched.
--
-- Why a helper instead of a one-off REVOKE: the default privileges of postgres in
-- public re-grant SELECT, INSERT (tables) and EXECUTE (functions) to these roles on
-- every new object. Each future SEC migration (M1.2+) ends with
--   SELECT public.sec_lockdown_platform_privileges();
-- inside its own transaction, so the grants never become visible to another session.
-- Roles are discovered by name pattern, so the project ref is never written in the repo.

CREATE FUNCTION public.sec_lockdown_platform_privileges() RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  _role    text;
  _obj     record;
  _revoked integer := 0;
  _left    integer;
BEGIN
  FOR _role IN
    SELECT r.rolname FROM pg_catalog.pg_roles r
    WHERE r.rolname ~ '^sandbox_exec(_[a-z0-9]+)?$' ORDER BY r.rolname
  LOOP
    FOR _obj IN
      SELECT c.oid, c.relkind FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname LIKE 'sec\_%' AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
      ORDER BY c.oid
    LOOP
      IF _obj.relkind = 'S' THEN
        EXECUTE pg_catalog.format('REVOKE USAGE, UPDATE ON SEQUENCE %s FROM %I',
                                  _obj.oid::pg_catalog.regclass, _role);
      ELSE
        EXECUTE pg_catalog.format(
          'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE %s FROM %I',
          _obj.oid::pg_catalog.regclass, _role);
      END IF;
      _revoked := _revoked + 1;
    END LOOP;
    FOR _obj IN
      SELECT p.oid FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'sec\_%' AND p.proname <> 'sec_is_admin'
        AND p.prokind IN ('f', 'p')
      ORDER BY p.oid
    LOOP
      EXECUTE pg_catalog.format('REVOKE EXECUTE ON ROUTINE %s FROM %I',
                                _obj.oid::pg_catalog.regprocedure, _role);
      _revoked := _revoked + 1;
    END LOOP;
  END LOOP;

  -- Postcondition on EFFECTIVE privileges (explicit grant, PUBLIC or membership).
  -- A REVOKE issued by a non-owner only raises a WARNING; this check turns that case
  -- into an error so the whole migration rolls back instead of passing silently.
  SELECT count(*) INTO _left
  FROM pg_catalog.pg_roles r
  CROSS JOIN LATERAL (
    SELECT c.oid, c.relkind, NULL::text AS proname, 'rel'::text AS k FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname LIKE 'sec\_%' AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
    UNION ALL
    SELECT p.oid, NULL, p.proname, 'fn' FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'sec\_%' AND p.prokind IN ('f', 'p')
  ) o
  WHERE r.rolname ~ '^sandbox_exec(_[a-z0-9]+)?$'
    AND CASE
      WHEN o.k = 'rel' AND o.relkind = 'S' THEN
        pg_catalog.has_sequence_privilege(r.rolname, o.oid, 'USAGE, UPDATE')
      WHEN o.k = 'rel' THEN
        pg_catalog.has_table_privilege(r.rolname, o.oid,
          'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
      ELSE o.proname <> 'sec_is_admin'
        AND pg_catalog.has_function_privilege(r.rolname, o.oid, 'EXECUTE')
    END;
  IF _left > 0 THEN
    RAISE EXCEPTION 'sec_lockdown_platform_privileges: % write path(s) remain for sandbox_exec* on sec_* objects (caller must own them)', _left;
  END IF;
  RETURN _revoked;
END $$;
ALTER FUNCTION public.sec_lockdown_platform_privileges() OWNER TO postgres;
-- Default privileges grant EXECUTE on new functions to the API roles: remove them, the
-- helper is for the migrator only (it would otherwise be callable as a REST RPC).
REVOKE ALL ON FUNCTION public.sec_lockdown_platform_privileges() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.sec_lockdown_platform_privileges() IS
  'FND-001 D4: revokes direct write paths of sandbox_exec* on public.sec_* objects. Call as the last statement of every SEC migration.';

SELECT public.sec_lockdown_platform_privileges();

-- FND-001 / D4 — DISPOSABLE DATABASES ONLY (CI stack or local rebuild), never production.
-- Reproduces the production platform roles observed read-only in D3
-- (docs/fnd001/evidence/d3/prod-platform-roles.txt, sections 1 and 5) so that the D4
-- lockdown and its guard are exercised against the same starting point:
--   * sandbox_exec and sandbox_exec_<ref>: BYPASSRLS, no memberships (here NOLOGIN, so
--     the simulation can never be used to connect);
--   * default privileges of postgres in public: tables SELECT, INSERT and sequences
--     SELECT, USAGE for both roles; functions EXECUTE for the suffixed role only.
-- Must run BEFORE the migration chain, like the platform does. Roles are cluster-wide.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    CREATE ROLE sandbox_exec NOLOGIN NOINHERIT BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec_ci0mockref') THEN
    CREATE ROLE sandbox_exec_ci0mockref NOLOGIN NOINHERIT BYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO sandbox_exec, sandbox_exec_ci0mockref;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT ON TABLES    TO sandbox_exec, sandbox_exec_ci0mockref;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE  ON SEQUENCES TO sandbox_exec, sandbox_exec_ci0mockref;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE        ON FUNCTIONS TO sandbox_exec_ci0mockref;

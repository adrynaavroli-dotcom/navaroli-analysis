-- FND-001 local shim: ONLY for running db_tests.sql on a bare PostgreSQL 17 when no
-- Supabase stack (Docker) is available. It is NOT equivalent to Supabase and its
-- results are never the official evidence; the official run is the CI job
-- `fnd001-db`, which uses the real Supabase local stack.
--
-- Reproduces the minimum the migrations depend on:
--   * roles anon / authenticated / service_role (service_role BYPASSRLS, as in Supabase);
--   * schema auth with auth.users and auth.uid() reading request.jwt.claims the same way
--     Supabase does;
--   * Supabase's broad default privileges on schema public, so the REVOKEs in the SEC
--     migration are exercised against the same starting point as production.
-- Known differences: the session user here is a superuser, there is no PostgREST/GoTrue
-- (real-JWT checks live in access-check.ts) and auth.users has only a few columns.
-- Roles are cluster-wide: create them only once per cluster.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')          THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')  THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  raw_user_meta_data jsonb,
  raw_app_meta_data jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))
$$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

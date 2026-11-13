-- D5 simulation — DISPOSABLE DATABASES ONLY. Runs after
-- validation/fnd001/sql/ci-platform-roles-mock.sql and BEFORE the migration chain.
-- Reproduces the production facts the D5 proposal depends on
-- (docs/security/evidence/prod-platform-identity.txt):
--   * postgres is a member of both sandbox_exec roles (§P4) — also lets the tests SET ROLE;
--   * postgres issued SELECT, INSERT on storage.buckets/objects to both roles (§P5/§P6).
-- A bare PostgreSQL has no storage schema: a two-table stand-in with RLS on and no
-- policies is created (only ACL behaviour is exercised, never Storage itself).
GRANT sandbox_exec, sandbox_exec_ci0mockref TO postgres;
DO $$ BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE TABLE storage.buckets (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, name text);
    CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets (id));
    ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;
GRANT USAGE ON SCHEMA storage TO sandbox_exec, sandbox_exec_ci0mockref;
GRANT SELECT, INSERT ON storage.buckets, storage.objects TO sandbox_exec, sandbox_exec_ci0mockref;

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

-- pg_net as observed in production (evidence §P8, §P13/§P14): schema net owned by the
-- platform, USAGE for API and platform roles, ALL on the two queue tables and the sequence
-- granted to PUBLIC, EXECUTE on http_get/http_post/http_delete. A real Supabase stack
-- already has it (skipped there). Here the owner is the migrator, a mock-only difference.
DO $$ BEGIN
  IF to_regnamespace('net') IS NULL THEN
    CREATE SCHEMA net;
    CREATE TABLE net.http_request_queue (id bigserial PRIMARY KEY, method text, url text, headers jsonb, body bytea, timeout_milliseconds integer);
    CREATE TABLE net._http_response (id bigint, status_code integer, content_type text, headers jsonb, content text, timed_out boolean, error_msg text, created timestamptz);
    GRANT ALL ON net.http_request_queue, net._http_response TO PUBLIC;
    GRANT ALL ON SEQUENCE net.http_request_queue_id_seq TO PUBLIC;
    GRANT USAGE ON SCHEMA net TO anon, authenticated, service_role, sandbox_exec, sandbox_exec_ci0mockref;
    CREATE FUNCTION net.http_get(url text, params jsonb DEFAULT '{}', headers jsonb DEFAULT '{}', timeout_milliseconds integer DEFAULT 5000)
      RETURNS bigint LANGUAGE sql AS $f$ INSERT INTO net.http_request_queue (method, url, headers) VALUES ('GET', url, headers) RETURNING id $f$;
    CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}', params jsonb DEFAULT '{}', headers jsonb DEFAULT '{}', timeout_milliseconds integer DEFAULT 5000)
      RETURNS bigint LANGUAGE sql AS $f$ INSERT INTO net.http_request_queue (method, url, headers) VALUES ('POST', url, headers) RETURNING id $f$;
    CREATE FUNCTION net.http_delete(url text, params jsonb DEFAULT '{}', headers jsonb DEFAULT '{}', timeout_milliseconds integer DEFAULT 5000, body jsonb DEFAULT NULL)
      RETURNS bigint LANGUAGE sql AS $f$ INSERT INTO net.http_request_queue (method, url, headers) VALUES ('DELETE', url, headers) RETURNING id $f$;
  END IF;
END $$;


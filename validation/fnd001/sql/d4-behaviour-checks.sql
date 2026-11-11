-- FND-001 / D4 — behaviour checks after the lockdown. DISPOSABLE DATABASES ONLY.
-- Needs ci-platform-roles-mock.sql applied before the chain. One transaction, rolled
-- back: nothing is left behind. Privilege checks run at executor start, so
-- `INSERT … SELECT … WHERE false` and RPC calls with NULL arguments test the privilege
-- itself without creating rows or depending on fixtures.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
SET client_min_messages = warning;
BEGIN;
CREATE TEMP TABLE d4_results (seq serial, label text, ok boolean, detail text);
CREATE FUNCTION pg_temp.expect(_label text, _role text, _sql text, _state text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE got text := '00000'; msg text;
BEGIN
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', _role);
    EXECUTE _sql;
    RESET ROLE;
    IF _state <> '00000' THEN RAISE EXCEPTION 'unexpected success' USING ERRCODE = 'FT001'; END IF;
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; msg := SQLERRM;
  END;
  RESET ROLE;
  INSERT INTO d4_results(label, ok, detail) VALUES (_label, got = _state,
    CASE WHEN got = _state THEN NULL ELSE format('expected %s got %s: %s', _state, got, msg) END);
END $$;

DO $$
DECLARE r text; t text; f text;
BEGIN
  FOREACH r IN ARRAY ARRAY['sandbox_exec', 'sandbox_exec_ci0mockref'] LOOP
    FOREACH t IN ARRAY ARRAY['sec_companies', 'sec_ticker_mappings', 'sec_ingestion_runs', 'sec_filings',
        'sec_raw_facts', 'sec_raw_fact_observations', 'sec_normalized_facts', 'sec_normalized_fact_sources'] LOOP
      PERFORM pg_temp.expect(format('D4.ins %s %s denied', r, t), r,
        format('INSERT INTO public.%I SELECT * FROM public.%I WHERE false', t, t), '42501');
    END LOOP;
    FOREACH f IN ARRAY ARRAY['public.sec_record_download(NULL::uuid,NULL::integer,NULL::text,NULL::bigint,NULL::bytea)',
        'public.sec_fail_run(NULL::uuid,NULL::text,NULL::jsonb)', 'public.sec_fail_stale_runs(NULL::interval)',
        'public.sec_finalize_run(NULL::uuid,NULL::jsonb,NULL::jsonb)', 'public.sec_lockdown_platform_privileges()'] LOOP
      PERFORM pg_temp.expect(format('D4.exec %s %s denied', r, split_part(f, '(', 1)), r, 'SELECT ' || f, '42501');
    END LOOP;
  END LOOP;
END $$;
DO $$
DECLARE r text; t text;
BEGIN
  FOREACH r IN ARRAY ARRAY['sandbox_exec', 'sandbox_exec_ci0mockref'] LOOP
    FOREACH t IN ARRAY ARRAY['sec_companies', 'sec_ticker_mappings', 'sec_ingestion_runs', 'sec_filings',
        'sec_raw_facts', 'sec_raw_fact_observations', 'sec_normalized_facts', 'sec_normalized_fact_sources'] LOOP
      PERFORM pg_temp.expect(format('D4.sel %s %s kept', r, t), r, format('SELECT count(*) FROM public.%I', t), '00000');
    END LOOP;
  END LOOP;
END $$;

-- Privilege-function view of what must be unchanged or revoked.
INSERT INTO d4_results(label, ok, detail)
SELECT 'D4.trg ' || r || ' ' || f || ' EXECUTE revoked', NOT has_function_privilege(r, f, 'EXECUTE'), NULL
FROM unnest(ARRAY['sandbox_exec', 'sandbox_exec_ci0mockref']) r,
     unnest(ARRAY['public.sec_guard()', 'public.sec_insert_guard()', 'public.sec_norm_lineage_check()',
                  'public.sec_supersession_check()']) f;
INSERT INTO d4_results(label, ok, detail) VALUES
  ('D4.keep sandbox_exec_ci0mockref sec_is_admin() EXECUTE kept',
   has_function_privilege('sandbox_exec_ci0mockref', 'public.sec_is_admin()', 'EXECUTE'), NULL),
  ('D4.keep sandbox_exec_ci0mockref has_role() EXECUTE untouched (out of D4 scope)',
   has_function_privilege('sandbox_exec_ci0mockref', 'public.has_role(uuid,public.app_role)', 'EXECUTE'), NULL),
  ('D4.keep sandbox_exec user_roles INSERT untouched (out of D4 scope)',
   has_table_privilege('sandbox_exec', 'public.user_roles', 'INSERT'), NULL),
  ('D4.api anon/authenticated/service_role no EXECUTE on lockdown helper',
   NOT (has_function_privilege('anon', 'public.sec_lockdown_platform_privileges()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.sec_lockdown_platform_privileges()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.sec_lockdown_platform_privileges()', 'EXECUTE')), NULL),
  ('D4.api service_role keeps EXECUTE on the 4 run RPCs',
   has_function_privilege('service_role', 'public.sec_record_download(uuid,integer,text,bigint,bytea)', 'EXECUTE')
   AND has_function_privilege('service_role', 'public.sec_fail_run(uuid,text,jsonb)', 'EXECUTE')
   AND has_function_privilege('service_role', 'public.sec_fail_stale_runs(interval)', 'EXECUTE')
   AND has_function_privilege('service_role', 'public.sec_finalize_run(uuid,jsonb,jsonb)', 'EXECUTE'), NULL);

-- Idempotence: a second call revokes nothing new and still passes its postcondition.
DO $$ BEGIN PERFORM public.sec_lockdown_platform_privileges(); END $$;
INSERT INTO d4_results(label, ok) VALUES ('D4.idem second lockdown call succeeds', true);

SELECT CASE WHEN ok THEN 'ok' ELSE 'not ok' END || ' - ' || label || COALESCE(' # ' || detail, '')
FROM d4_results ORDER BY seq;
SELECT format('# D4 behaviour: %s/%s ok', count(*) FILTER (WHERE ok), count(*)) FROM d4_results;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM d4_results WHERE NOT ok) THEN RAISE EXCEPTION 'D4 behaviour checks failed'; END IF;
END $$;
ROLLBACK;

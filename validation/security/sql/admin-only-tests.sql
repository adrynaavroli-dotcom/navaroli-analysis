-- Admin-only model — behaviour tests (disposable databases only; never production).
--
-- Contract
--   * One transaction that is never committed; each probe additionally runs in its own
--     sub-transaction that is always rolled back, so cases are independent.
--   * Every case states WHICH LAYER must stop it:
--       grant  -> SQLSTATE 42501 "permission denied ..."          (SQL privileges)
--       rls    -> SQLSTATE 42501 "... row-level security ..."     (RLS WITH CHECK)
--       rows:N -> no error and exactly N rows affected            (RLS USING filters)
--       ok     -> no error
--       state:XXXXX -> that SQLSTATE
--   * Synthetic identities only: A = admin, N = authenticated non-admin, X = account
--     without profile. JWT claims are set the way PostgREST does (request.jwt.claims).
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
SET client_min_messages = warning;
BEGIN;
CREATE SCHEMA adm_t;
CREATE TABLE adm_t.results (seq serial, label text NOT NULL, ok boolean NOT NULL, detail text);

CREATE FUNCTION adm_t.claims(_who text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _who
    WHEN 'A' THEN '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}'::jsonb
    WHEN 'N' THEN '{"sub":"a0000000-0000-4000-8000-00000000000b","role":"authenticated"}'::jsonb
    ELSE NULL END $$;

-- Run _sql as _role (with the JWT claims of _who) inside a sub-transaction that is always
-- rolled back; report SQLSTATE, message and affected rows.
CREATE FUNCTION adm_t.probe(_sql text, _role text, _who text, OUT state text, OUT msg text, OUT nrows bigint)
LANGUAGE plpgsql AS $$
BEGIN
  state := '00000';
  BEGIN
    PERFORM set_config('request.jwt.claims', COALESCE(adm_t.claims(_who)::text, ''), true);
    IF _role IS NOT NULL THEN EXECUTE format('SET LOCAL ROLE %I', _role); END IF;
    EXECUTE _sql;
    GET DIAGNOSTICS nrows = ROW_COUNT;
    RAISE EXCEPTION 'undo probe' USING ERRCODE = 'AT000';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> 'AT000' THEN state := SQLSTATE; msg := SQLERRM; nrows := NULL; END IF;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

CREATE FUNCTION adm_t.expect(_label text, _sql text, _want text, _role text DEFAULT NULL, _who text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record; good boolean;
BEGIN
  SELECT * INTO r FROM adm_t.probe(_sql, _role, _who);
  good := CASE
    WHEN _want = 'ok'    THEN r.state = '00000'
    WHEN _want = 'grant' THEN r.state = '42501' AND r.msg LIKE 'permission denied%'
    WHEN _want = 'rls'   THEN r.state = '42501' AND r.msg LIKE '%row-level security%'
    WHEN _want LIKE 'rows:%'  THEN r.state = '00000' AND r.nrows = substr(_want, 6)::bigint
    WHEN _want LIKE 'state:%' THEN r.state = substr(_want, 7)
    ELSE false END;
  INSERT INTO adm_t.results(label, ok, detail) VALUES (_label || ' [' || _want || ']', good,
    CASE WHEN good THEN NULL ELSE format('got %s rows=%s %s', r.state, r.nrows, r.msg) END);
END $$;

-- Scalar read as _role/_who; 'ERR:<state>' on error.
CREATE FUNCTION adm_t.val(_sql text, _role text DEFAULT NULL, _who text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', COALESCE(adm_t.claims(_who)::text, ''), true);
    IF _role IS NOT NULL THEN EXECUTE format('SET LOCAL ROLE %I', _role); END IF;
    EXECUTE _sql INTO v;
    RAISE EXCEPTION 'undo' USING ERRCODE = 'AT000';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE <> 'AT000' THEN v := 'ERR:' || SQLSTATE; END IF;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $$;

CREATE FUNCTION adm_t.eq(_label text, _got text, _want text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO adm_t.results(label, ok, detail)
  VALUES (_label || ' [= ' || _want || ']', _got IS NOT DISTINCT FROM _want,
          CASE WHEN _got IS DISTINCT FROM _want THEN 'got ' || COALESCE(_got, 'NULL') END) $$;

-- ------------------------------------------------------------------ fixtures
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-4000-8000-00000000000a', 'admin@example.invalid'),
  ('a0000000-0000-4000-8000-00000000000b', 'user@example.invalid'),
  ('a0000000-0000-4000-8000-00000000000c', 'noprofile@example.invalid');
DELETE FROM public.profiles WHERE user_id = 'a0000000-0000-4000-8000-00000000000c';
INSERT INTO public.user_roles (user_id, role) VALUES ('a0000000-0000-4000-8000-00000000000a', 'admin');
INSERT INTO public.theses (id, ticker, company_name, sector, current_price, user_id, is_published) VALUES
  ('10000000-0000-4000-8000-000000000001', 'PUB', 'Published', 'Tech', 1, 'a0000000-0000-4000-8000-00000000000a', true),
  ('10000000-0000-4000-8000-000000000002', 'DRF', 'Draft', 'Tech', 1, 'a0000000-0000-4000-8000-00000000000a', false);
INSERT INTO public.public_thesis_data (id, user_id, ticker, company_name, published_at) VALUES
  ('20000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'PUB', 'Published', now()),
  ('20000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a', 'DRF', 'Draft', NULL);
INSERT INTO public.analysis_workspaces (id, user_id, ticker, company_name) VALUES
  ('30000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'PUB', 'Published');
INSERT INTO public.thesis_purchases (id, thesis_id, user_id, shares, price_per_share) VALUES
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 1, 1);
INSERT INTO public.thesis_alerts (id, thesis_id, user_id, alert_type, ticker, message) VALUES
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'price_drop', 'PUB', 'seed');
INSERT INTO public.page_content (page_key, content) VALUES ('zz_seed', '{}');

-- One INSERT / UPDATE / DELETE statement per table (UPDATE/DELETE target exactly one seed row).
CREATE TABLE adm_t.stmts (tbl text PRIMARY KEY, ins text, upd text, del text);
INSERT INTO adm_t.stmts VALUES
 ('theses',
  $q$INSERT INTO public.theses (ticker, company_name, sector, current_price, user_id) VALUES ('ZZZ','Probe','Tech',1,'a0000000-0000-4000-8000-00000000000a')$q$,
  $q$UPDATE public.theses SET company_name = 'x' WHERE id = '10000000-0000-4000-8000-000000000001'$q$,
  $q$DELETE FROM public.theses WHERE id = '10000000-0000-4000-8000-000000000002'$q$),
 ('public_thesis_data',
  $q$INSERT INTO public.public_thesis_data (user_id, ticker, company_name) VALUES ('a0000000-0000-4000-8000-00000000000a','ZZZ','Probe')$q$,
  $q$UPDATE public.public_thesis_data SET company_name = 'x' WHERE id = '20000000-0000-4000-8000-000000000001'$q$,
  $q$DELETE FROM public.public_thesis_data WHERE id = '20000000-0000-4000-8000-000000000002'$q$),
 ('analysis_workspaces',
  $q$INSERT INTO public.analysis_workspaces (user_id, ticker, company_name) VALUES ('a0000000-0000-4000-8000-00000000000a','ZZZ','Probe')$q$,
  $q$UPDATE public.analysis_workspaces SET company_name = 'x' WHERE id = '30000000-0000-4000-8000-000000000001'$q$,
  $q$DELETE FROM public.analysis_workspaces WHERE id = '30000000-0000-4000-8000-000000000001'$q$),
 ('thesis_purchases',
  $q$INSERT INTO public.thesis_purchases (thesis_id, user_id, shares, price_per_share) VALUES ('10000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-00000000000a',1,1)$q$,
  $q$UPDATE public.thesis_purchases SET shares = 2 WHERE id = '40000000-0000-4000-8000-000000000001'$q$,
  $q$DELETE FROM public.thesis_purchases WHERE id = '40000000-0000-4000-8000-000000000001'$q$),
 ('thesis_alerts',
  $q$INSERT INTO public.thesis_alerts (user_id, alert_type, ticker, message) VALUES ('a0000000-0000-4000-8000-00000000000a','review','ZZZ','probe')$q$,
  $q$UPDATE public.thesis_alerts SET acknowledged = true WHERE id = '50000000-0000-4000-8000-000000000001'$q$,
  $q$DELETE FROM public.thesis_alerts WHERE id = '50000000-0000-4000-8000-000000000001'$q$),
 ('profiles',
  $q$INSERT INTO public.profiles (user_id) VALUES ('a0000000-0000-4000-8000-00000000000c')$q$,
  $q$UPDATE public.profiles SET full_name = 'x' WHERE user_id = 'a0000000-0000-4000-8000-00000000000a'$q$,
  $q$DELETE FROM public.profiles WHERE user_id = 'a0000000-0000-4000-8000-00000000000b'$q$),
 ('page_content',
  $q$INSERT INTO public.page_content (page_key, content) VALUES ('zz_probe', '{}')$q$,
  $q$UPDATE public.page_content SET content = '{"x":1}' WHERE page_key = 'zz_seed'$q$,
  $q$DELETE FROM public.page_content WHERE page_key = 'zz_seed'$q$),
 ('user_roles',
  $q$INSERT INTO public.user_roles (user_id, role) VALUES ('a0000000-0000-4000-8000-00000000000b', 'admin')$q$,
  $q$UPDATE public.user_roles SET role = 'user' WHERE user_id = 'a0000000-0000-4000-8000-00000000000a'$q$,
  $q$DELETE FROM public.user_roles WHERE user_id = 'a0000000-0000-4000-8000-00000000000a'$q$),
 ('sec_companies',
  $q$INSERT INTO public.sec_companies (cik, entity_name, is_published) VALUES ('9999999990','Probe',true)$q$,
  $q$UPDATE public.sec_companies SET entity_name = 'x' WHERE cik = '9999999990'$q$,
  $q$DELETE FROM public.sec_companies WHERE cik = '9999999990'$q$);

-- Expected outcome per (identity, table, operation). Absent = not asserted here.
CREATE TABLE adm_t.matrix (who text, tbl text, op text, want text);
-- anon: SQL privileges stop every write (no RLS needed).
INSERT INTO adm_t.matrix SELECT 'anon', tbl, op, 'grant' FROM adm_t.stmts CROSS JOIN unnest(ARRAY['ins','upd','del']) op;
-- authenticated non-admin: privileges stop alerts/roles/page_content deletes; RLS stops the rest.
INSERT INTO adm_t.matrix VALUES
 ('N','theses','ins','rls'), ('N','theses','upd','rows:0'), ('N','theses','del','rows:0'),
 ('N','public_thesis_data','ins','rls'), ('N','public_thesis_data','upd','rows:0'), ('N','public_thesis_data','del','rows:0'),
 ('N','analysis_workspaces','ins','rls'), ('N','analysis_workspaces','upd','rows:0'), ('N','analysis_workspaces','del','rows:0'),
 ('N','thesis_purchases','ins','rls'), ('N','thesis_purchases','upd','rows:0'), ('N','thesis_purchases','del','rows:0'),
 ('N','thesis_alerts','ins','grant'), ('N','thesis_alerts','upd','rows:0'), ('N','thesis_alerts','del','rows:0'),
 ('N','profiles','ins','rls'), ('N','profiles','upd','rows:0'), ('N','profiles','del','rows:0'),
 ('N','page_content','ins','rls'), ('N','page_content','upd','rows:0'), ('N','page_content','del','grant'),
 ('N','user_roles','ins','grant'), ('N','user_roles','upd','grant'), ('N','user_roles','del','grant'),
 ('N','sec_companies','ins','grant'), ('N','sec_companies','upd','grant'), ('N','sec_companies','del','grant');
-- admin: authorised operations succeed; roles and sec_* stay out of the API.
INSERT INTO adm_t.matrix VALUES
 ('A','theses','ins','rows:1'), ('A','theses','upd','rows:1'), ('A','theses','del','rows:1'),
 ('A','public_thesis_data','ins','rows:1'), ('A','public_thesis_data','upd','rows:1'), ('A','public_thesis_data','del','rows:1'),
 ('A','analysis_workspaces','ins','rows:1'), ('A','analysis_workspaces','upd','rows:1'), ('A','analysis_workspaces','del','rows:1'),
 ('A','thesis_purchases','ins','rows:1'), ('A','thesis_purchases','upd','rows:1'), ('A','thesis_purchases','del','rows:1'),
 ('A','thesis_alerts','ins','grant'), ('A','thesis_alerts','upd','rows:1'), ('A','thesis_alerts','del','rows:1'),
 ('A','profiles','ins','rows:1'), ('A','profiles','upd','rows:1'), ('A','profiles','del','rows:1'),
 ('A','page_content','ins','rows:1'), ('A','page_content','upd','rows:1'), ('A','page_content','del','grant'),
 ('A','user_roles','ins','grant'), ('A','user_roles','upd','grant'), ('A','user_roles','del','grant'),
 ('A','sec_companies','ins','grant'), ('A','sec_companies','upd','grant'), ('A','sec_companies','del','grant');
-- service_role: only the server-function inventory (column-level UPDATEs checked below).
INSERT INTO adm_t.matrix VALUES
 ('service_role','theses','ins','grant'), ('service_role','theses','upd','grant'), ('service_role','theses','del','grant'),
 ('service_role','public_thesis_data','ins','grant'), ('service_role','public_thesis_data','upd','grant'), ('service_role','public_thesis_data','del','grant'),
 ('service_role','analysis_workspaces','ins','grant'), ('service_role','analysis_workspaces','upd','grant'), ('service_role','analysis_workspaces','del','grant'),
 ('service_role','thesis_purchases','ins','grant'), ('service_role','thesis_purchases','upd','grant'), ('service_role','thesis_purchases','del','grant'),
 ('service_role','thesis_alerts','ins','rows:1'), ('service_role','thesis_alerts','upd','grant'), ('service_role','thesis_alerts','del','grant'),
 ('service_role','profiles','ins','grant'), ('service_role','profiles','upd','grant'), ('service_role','profiles','del','grant'),
 ('service_role','page_content','ins','grant'), ('service_role','page_content','upd','grant'), ('service_role','page_content','del','grant'),
 ('service_role','user_roles','ins','grant'), ('service_role','user_roles','upd','grant'), ('service_role','user_roles','del','grant');
-- sandbox_exec*: no write anywhere (BYPASSRLS, so only privileges can stop it).
INSERT INTO adm_t.matrix SELECT r.rolname, s.tbl, op, 'grant'
FROM adm_t.stmts s CROSS JOIN unnest(ARRAY['ins','upd','del']) op
CROSS JOIN pg_roles r WHERE r.rolname ~ '^sandbox_exec(_[a-z0-9]+)?$';

SELECT adm_t.expect(
  format('W %s %s %s', CASE WHEN m.who ~ '^sandbox_exec_' THEN 'sandbox_exec_<ref>' ELSE m.who END, m.op, m.tbl),
  CASE m.op WHEN 'ins' THEN s.ins WHEN 'upd' THEN s.upd ELSE s.del END,
  m.want,
  CASE WHEN m.who IN ('A','N') THEN 'authenticated' ELSE m.who END,
  CASE WHEN m.who IN ('A','N') THEN m.who END)
FROM adm_t.matrix m JOIN adm_t.stmts s USING (tbl) ORDER BY m.who, m.tbl, m.op;

-- TRUNCATE: privileges only, for every API and platform role.
SELECT adm_t.expect(format('T %s truncate theses', CASE WHEN r ~ '^sandbox_exec_' THEN 'sandbox_exec_<ref>' ELSE r END),
                    'TRUNCATE public.theses CASCADE', 'grant', r, NULL)
FROM unnest(ARRAY['anon','authenticated','service_role']
            || ARRAY(SELECT rolname::text FROM pg_roles WHERE rolname ~ '^sandbox_exec(_[a-z0-9]+)?$')) r;

-- service_role column-level inventory.
SELECT adm_t.expect('S service_role update theses.current_price,sparkline_data',
  $q$UPDATE public.theses SET current_price = 2, sparkline_data = '[]' WHERE id = '10000000-0000-4000-8000-000000000001'$q$, 'rows:1', 'service_role');
SELECT adm_t.expect('S service_role update public_thesis_data review columns',
  $q$UPDATE public.public_thesis_data SET last_alert_sent_at = now(), alert_type = 'review', needs_review = true, price_at_last_check = 1 WHERE id = '20000000-0000-4000-8000-000000000001'$q$, 'rows:1', 'service_role');
SELECT adm_t.expect('S service_role update thesis_alerts.email_sent (as check-thesis-alerts)',
  $q$UPDATE public.thesis_alerts SET email_sent = true WHERE thesis_id = '20000000-0000-4000-8000-000000000001' AND alert_type = 'price_drop' AND acknowledged = false$q$, 'rows:1', 'service_role');
SELECT adm_t.expect('S service_role update thesis_alerts.message', $q$UPDATE public.thesis_alerts SET message = 'x'$q$, 'grant', 'service_role');
SELECT adm_t.expect('S service_role reads profiles.notification_email',
  $q$SELECT notification_email FROM public.profiles WHERE user_id = 'a0000000-0000-4000-8000-00000000000a'$q$, 'ok', 'service_role');

-- Reads: public sees only published content; admin-only tables are closed.
SELECT adm_t.eq('R anon theses visible', adm_t.val('SELECT count(*) FROM public.theses', 'anon'), '1');
SELECT adm_t.eq('R anon public_thesis_data_view visible', adm_t.val('SELECT count(*) FROM public.public_thesis_data_view', 'anon'), '1');
SELECT adm_t.eq('R anon page_content visible', adm_t.val($q$SELECT count(*) FROM public.page_content WHERE page_key = 'zz_seed'$q$, 'anon'), '1');
SELECT adm_t.eq('R anon analysis_workspaces', adm_t.val('SELECT count(*) FROM public.analysis_workspaces', 'anon'), 'ERR:42501');
SELECT adm_t.eq('R anon profiles', adm_t.val('SELECT count(*) FROM public.profiles', 'anon'), 'ERR:42501');
SELECT adm_t.eq('R anon user_roles', adm_t.val('SELECT count(*) FROM public.user_roles', 'anon'), 'ERR:42501');
SELECT adm_t.eq('R N theses visible', adm_t.val('SELECT count(*) FROM public.theses', 'authenticated', 'N'), '1');
SELECT adm_t.eq('R N public_thesis_data visible', adm_t.val('SELECT count(*) FROM public.public_thesis_data', 'authenticated', 'N'), '1');
SELECT adm_t.eq('R N analysis_workspaces visible', adm_t.val('SELECT count(*) FROM public.analysis_workspaces', 'authenticated', 'N'), '0');
SELECT adm_t.eq('R N thesis_purchases visible', adm_t.val('SELECT count(*) FROM public.thesis_purchases', 'authenticated', 'N'), '0');
SELECT adm_t.eq('R N thesis_alerts visible', adm_t.val('SELECT count(*) FROM public.thesis_alerts', 'authenticated', 'N'), '0');
SELECT adm_t.eq('R N profiles visible (own included)', adm_t.val('SELECT count(*) FROM public.profiles', 'authenticated', 'N'), '0');
SELECT adm_t.eq('R N user_roles visible (other accounts)', adm_t.val('SELECT count(*) FROM public.user_roles', 'authenticated', 'N'), '0');
SELECT adm_t.eq('R A theses visible', adm_t.val('SELECT count(*) FROM public.theses', 'authenticated', 'A'), '2');
SELECT adm_t.eq('R A public_thesis_data visible', adm_t.val('SELECT count(*) FROM public.public_thesis_data', 'authenticated', 'A'), '2');
SELECT adm_t.eq('R A analysis_workspaces visible', adm_t.val('SELECT count(*) FROM public.analysis_workspaces', 'authenticated', 'A'), '1');
SELECT adm_t.eq('R A profiles visible', adm_t.val('SELECT count(*) FROM public.profiles', 'authenticated', 'A'), '2');
SELECT adm_t.eq('R A user_roles own row', adm_t.val('SELECT count(*) FROM public.user_roles', 'authenticated', 'A'), '1');

-- Helpers and routines.
SELECT adm_t.eq('F is_admin() anon (no subject)', adm_t.val('SELECT public.is_admin()::text', 'anon'), 'false');
SELECT adm_t.eq('F is_admin() non-admin', adm_t.val('SELECT public.is_admin()::text', 'authenticated', 'N'), 'false');
SELECT adm_t.eq('F is_admin() admin', adm_t.val('SELECT public.is_admin()::text', 'authenticated', 'A'), 'true');
SELECT adm_t.eq('F is_admin() authenticated without subject', adm_t.val('SELECT public.is_admin()::text', 'authenticated'), 'false');
SELECT adm_t.eq('F sec_is_admin() unchanged for admin', adm_t.val('SELECT public.sec_is_admin()::text', 'authenticated', 'A'), 'true');
SELECT adm_t.expect('F anon has_role()', $q$SELECT public.has_role('a0000000-0000-4000-8000-00000000000a', 'admin')$q$, 'grant', 'anon');
SELECT adm_t.expect('F authenticated has_role() (no UUID probing)', $q$SELECT public.has_role('a0000000-0000-4000-8000-00000000000a', 'admin')$q$, 'grant', 'authenticated', 'N');
SELECT adm_t.eq('F service_role has_role() (server functions)', adm_t.val($q$SELECT public.has_role('a0000000-0000-4000-8000-00000000000a', 'admin')::text$q$, 'service_role'), 'true');
SELECT adm_t.expect(format('F %s enforce_privilege_baseline()', r), 'SELECT public.enforce_privilege_baseline()', 'grant', r, NULL)
FROM unnest(ARRAY['anon','authenticated','service_role']) r;

-- Platform roles: no mutating routine, read helpers only.
SELECT adm_t.expect(format('X %s %s', CASE WHEN r.rolname ~ '^sandbox_exec_' THEN 'sandbox_exec_<ref>' ELSE r.rolname END, f.label), f.sql, f.want, r.rolname, NULL)
FROM pg_roles r CROSS JOIN (VALUES
  ('has_role()', $q$SELECT public.has_role('a0000000-0000-4000-8000-00000000000a', 'admin')$q$, 'grant'),
  ('sec_finalize_run()', $q$SELECT public.sec_finalize_run(gen_random_uuid(), '{}'::jsonb)$q$, 'grant'),
  ('sec_fail_stale_runs()', $q$SELECT public.sec_fail_stale_runs('1 day')$q$, 'grant'),
  ('sec_record_download()', $q$SELECT public.sec_record_download(gen_random_uuid(), 200, 'x', 1, '\x00')$q$, 'grant'),
  ('enforce_privilege_baseline()', 'SELECT public.enforce_privilege_baseline()', 'grant'),
  ('select theses (read kept)', 'SELECT count(*) FROM public.theses', 'ok')) f(label, sql, want)
WHERE r.rolname ~ '^sandbox_exec(_[a-z0-9]+)?$';
SELECT adm_t.expect(format('X %s insert storage.%s', CASE WHEN r.rolname ~ '^sandbox_exec_' THEN 'sandbox_exec_<ref>' ELSE r.rolname END, t),
                    format('INSERT INTO storage.%I DEFAULT VALUES', t), 'grant', r.rolname, NULL)
FROM pg_roles r CROSS JOIN unnest(ARRAY['buckets','objects']) t
WHERE r.rolname ~ '^sandbox_exec(_[a-z0-9]+)?$' AND to_regclass('storage.' || t) IS NOT NULL;

-- Single administrator, even through a privileged path (runs as the migrator).
SELECT adm_t.expect('U second admin row as migrator',
  $q$INSERT INTO public.user_roles (user_id, role) VALUES ('a0000000-0000-4000-8000-00000000000b', 'admin')$q$, 'state:23505');
SELECT adm_t.expect('U non-admin role row as migrator (allowed)',
  $q$INSERT INTO public.user_roles (user_id, role) VALUES ('a0000000-0000-4000-8000-00000000000b', 'user')$q$, 'rows:1');

-- ------------------------------------------------------------------ report
SELECT CASE WHEN ok THEN 'ok' ELSE 'not ok' END || ' ' || seq || ' - ' || label || COALESCE(' # ' || detail, '')
FROM adm_t.results ORDER BY seq;
SELECT '# admin-only tests: ' || count(*) FILTER (WHERE ok) || '/' || count(*) || ' passed' FROM adm_t.results;
SELECT CASE WHEN bool_and(ok) THEN 'ADMIN-ONLY-PASS' ELSE 'ADMIN-ONLY-FAIL' END FROM adm_t.results;
ROLLBACK;

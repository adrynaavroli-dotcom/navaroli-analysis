-- FND-001 / M1.1 — database and access tests (database portion of T1–T33).
--
-- Contract
--   * Runs as one transaction that is never committed: the runner closes the session
--     without COMMIT (an aborted or open transaction is discarded), and
--     run-db-tests.sh then checks that every sec_* table is still empty.
--   * Each case runs inside a PL/pgSQL exception block (= savepoint). A case that is
--     expected to fail but succeeds raises the sentinel FT001 so its side effects are
--     rolled back and it is reported as `not ok`.
--   * Expected SQLSTATEs come from the approved spec (section E). Where the
--     implementation legitimately rejects with a different code, the case asserts the
--     actual code and the line carries "DEVIATION"; those are listed in the as-built log.
--   * Synthetic CIKs 9999999901 (A, published) and 9999999902 (B, unpublished). No
--     production data is read or written.
--   * Cases that need the ingestion function (M1.2) are listed as DEFERRED, not run.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
SET client_min_messages = warning;
BEGIN;

-- ------------------------------------------------------------------ harness
CREATE SCHEMA fnd001_t;
CREATE TABLE fnd001_t.results (seq serial, label text NOT NULL, ok boolean NOT NULL, detail text);
CREATE TABLE fnd001_t.ids (name text PRIMARY KEY, id uuid NOT NULL);

CREATE FUNCTION fnd001_t.id(_n text) RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE v uuid; BEGIN
  SELECT id INTO v FROM fnd001_t.ids WHERE name = _n;
  IF v IS NULL THEN RAISE EXCEPTION 'fixture % missing', _n; END IF; RETURN v; END $$;
CREATE FUNCTION fnd001_t.newid(_n text) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO fnd001_t.ids VALUES (_n, gen_random_uuid()) RETURNING id $$;
-- Deterministic 32-byte identity for a fixture label (the DB does not recompute hashes).
CREATE FUNCTION fnd001_t.h(_label text) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
  SELECT sha256(convert_to(_label, 'UTF8')) $$;

-- Run _sql (optionally as _role with JWT claims) and compare the resulting SQLSTATE.
CREATE FUNCTION fnd001_t.expect(_label text, _sql text, _state text,
                                _role text DEFAULT NULL, _claims jsonb DEFAULT NULL,
                                _flush boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE got text := '00000'; msg text := NULL;
BEGIN
  BEGIN
    IF _claims IS NOT NULL THEN PERFORM set_config('request.jwt.claims', _claims::text, true); END IF;
    IF _role IS NOT NULL THEN EXECUTE format('SET LOCAL ROLE %I', _role); END IF;
    EXECUTE _sql;
    IF _flush THEN SET CONSTRAINTS ALL IMMEDIATE; END IF;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    IF _state <> '00000' THEN RAISE EXCEPTION 'unexpected success' USING ERRCODE = 'FT001'; END IF;
  EXCEPTION WHEN OTHERS THEN got := SQLSTATE; msg := SQLERRM;
  END;
  IF _flush THEN SET CONSTRAINTS ALL DEFERRED; END IF;
  INSERT INTO fnd001_t.results(label, ok, detail)
  VALUES (_label, got = _state,
          CASE WHEN got = _state THEN NULL ELSE format('expected %s got %s: %s', _state, got, msg) END);
END $$;

-- Evaluate a scalar query (optionally as _role) and return it as text, or 'ERR:<state>'.
CREATE FUNCTION fnd001_t.val(_sql text, _role text DEFAULT NULL, _claims jsonb DEFAULT NULL)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  BEGIN
    IF _claims IS NOT NULL THEN PERFORM set_config('request.jwt.claims', _claims::text, true); END IF;
    IF _role IS NOT NULL THEN EXECUTE format('SET LOCAL ROLE %I', _role); END IF;
    EXECUTE _sql INTO v;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
  EXCEPTION WHEN OTHERS THEN v := 'ERR:' || SQLSTATE;
  END;
  RETURN v;
END $$;

CREATE FUNCTION fnd001_t.eq(_label text, _got text, _want text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO fnd001_t.results(label, ok, detail)
  VALUES (_label, _got IS NOT DISTINCT FROM _want,
          CASE WHEN _got IS NOT DISTINCT FROM _want THEN NULL ELSE format('expected %s got %s', _want, _got) END) $$;

CREATE FUNCTION fnd001_t.x(_sql text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN EXECUTE _sql; END $$;

-- ------------------------------------------------------------------ fixture builders
CREATE FUNCTION fnd001_t.mkrun(_n text, _cik text, _kind text, _started timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid := fnd001_t.newid(_n);
BEGIN
  INSERT INTO public.sec_ingestion_runs(run_id, cik, resource_kind, endpoint_url, user_agent, started_at)
  VALUES (v, _cik, _kind,
          CASE _kind WHEN 'submissions'  THEN 'https://data.sec.gov/submissions/CIK' || _cik || '.json'
                     WHEN 'companyfacts' THEN 'https://data.sec.gov/api/xbrl/companyfacts/CIK' || _cik || '.json' END,
          'Navaroli Analysis FND-001 tests adrynaavroli@gmail.com', COALESCE(_started, now()));
  RETURN v;
END $$;
CREATE FUNCTION fnd001_t.dl(_n text) RETURNS void LANGUAGE sql AS $$
  SELECT public.sec_record_download(fnd001_t.id(_n), 200, 'application/json', 2, sha256('{}'::bytea)) $$;
CREATE FUNCTION fnd001_t.st(_n text) RETURNS text LANGUAGE sql AS $$
  SELECT status FROM public.sec_ingestion_runs WHERE run_id = fnd001_t.id(_n) $$;
CREATE FUNCTION fnd001_t.runcol(_n text, _col text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text; BEGIN
  EXECUTE format('SELECT %I::text FROM public.sec_ingestion_runs WHERE run_id = %L', _col, fnd001_t.id(_n)) INTO v;
  RETURN v; END $$;

CREATE FUNCTION fnd001_t.filing_sql(_cik text, _acc text, _run text, _form text DEFAULT '10-K',
                                    _filed date DEFAULT '2025-02-01', _conflict_ignore boolean DEFAULT false)
RETURNS text LANGUAGE sql AS $$
  SELECT format('INSERT INTO public.sec_filings(cik, accession_number, form, filed_date, first_run_id) VALUES (%L,%L,%L,%L,%L)%s',
                _cik, _acc, _form, _filed, fnd001_t.id(_run),
                CASE WHEN _conflict_ignore THEN ' ON CONFLICT (cik, accession_number) DO NOTHING' ELSE '' END) $$;

CREATE FUNCTION fnd001_t.raw_sql(_h text, _cik text, _acc text, _run text,
    _kind text DEFAULT 'numeric', _num text DEFAULT '1', _txt text DEFAULT NULL, _unit text DEFAULT 'USD',
    _ptype text DEFAULT 'instant', _pstart date DEFAULT NULL, _pend date DEFAULT '2024-12-31',
    _tax text DEFAULT 'us-gaap', _tag text DEFAULT 'Revenues', _conflict_ignore boolean DEFAULT false)
RETURNS text LANGUAGE sql AS $$
  SELECT format('INSERT INTO public.sec_raw_facts(fact_hash, cik, accession_number, taxonomy_key, tag, unit, period_type,'
                ' period_start, period_end, value_kind, value_numeric, value_text, first_run_id)'
                ' VALUES (%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L::numeric,%L,%L)%s',
                fnd001_t.h(_h), _cik, _acc, _tax, _tag, _unit, _ptype, _pstart, _pend, _kind, _num, _txt,
                fnd001_t.id(_run),
                CASE WHEN _conflict_ignore THEN ' ON CONFLICT (fact_hash) DO NOTHING' ELSE '' END) $$;

CREATE FUNCTION fnd001_t.obs_sql(_cik text, _h text, _run text, _content text DEFAULT 'c',
                                 _ck text DEFAULT NULL, _conflict_ignore boolean DEFAULT false)
RETURNS text LANGUAGE sql AS $$
  SELECT format('INSERT INTO public.sec_raw_fact_observations(cik, raw_fact_hash, run_id, raw_json, raw_json_sha256,'
                ' conflict, conflict_kind, conflict_detail) VALUES (%L,%L,%L,%L::jsonb,%L,%L,%L,%L::jsonb)%s',
                _cik, fnd001_t.h(_h), fnd001_t.id(_run), jsonb_build_object('c', _content)::text,
                sha256(convert_to(_content, 'UTF8')), _ck IS NOT NULL, _ck,
                CASE WHEN _ck IS NULL THEN NULL ELSE '{"field":"test"}' END,
                CASE WHEN _conflict_ignore THEN ' ON CONFLICT ON CONSTRAINT sec_obs_content_uq DO NOTHING' ELSE '' END) $$;

CREATE FUNCTION fnd001_t.norm_sql(_id text, _cik text, _acc text, _src text, _concept text DEFAULT 'Revenues',
                                  _nv text DEFAULT 'v1', _pend date DEFAULT '2024-12-31')
RETURNS text LANGUAGE sql AS $$
  SELECT format('INSERT INTO public.sec_normalized_facts(normalized_fact_id, cik, canonical_concept, unit, period_type,'
                ' period_end, logical_key, accession_number, value_numeric, normalizer_version, rule_version, source_run_id)'
                ' VALUES (%L,%L,%L,''USD'',''instant'',%L,''client-value-is-overwritten'',%L,1,%L,''r1'',%L)',
                fnd001_t.id(_id), _cik, _concept, _pend, _acc, _nv, fnd001_t.id(_src)) $$;
CREATE FUNCTION fnd001_t.src_sql(_cik text, _id text, _h text) RETURNS text LANGUAGE sql AS $$
  SELECT format('INSERT INTO public.sec_normalized_fact_sources(cik, normalized_fact_id, raw_fact_hash) VALUES (%L,%L,%L)',
                _cik, fnd001_t.id(_id), fnd001_t.h(_h)) $$;

CREATE FUNCTION fnd001_t.fin_facts(_run text, _payload int, _dup int DEFAULT 0, _drop text DEFAULT NULL)
RETURNS text LANGUAGE sql AS $$
  SELECT public.sec_finalize_run(fnd001_t.id(_run),
    jsonb_build_object('payload_fact_count', _payload, 'facts_skipped_scope', 0,
                       'payload_duplicate_count', _dup, 'facts_rejected', 0) - COALESCE(_drop, '')) $$;
CREATE FUNCTION fnd001_t.fin_sub(_run text, _payload int, _conf int DEFAULT 0, _samples jsonb DEFAULT NULL,
                                 _drop text DEFAULT NULL)
RETURNS text LANGUAGE sql AS $$
  SELECT public.sec_finalize_run(fnd001_t.id(_run),
    jsonb_build_object('payload_filing_count', _payload, 'filings_skipped_form', 0, 'filing_conflicts', _conf)
      - COALESCE(_drop, ''), _samples) $$;

-- ------------------------------------------------------------------ base fixtures (as owner)
INSERT INTO public.sec_companies(cik, entity_name, is_published) VALUES
  ('9999999901', 'Test Company A (published)', true),
  ('9999999902', 'Test Company B (unpublished)', false);
SELECT fnd001_t.mkrun('sA', '9999999901', 'submissions');
SELECT fnd001_t.mkrun('sB', '9999999902', 'submissions');
SELECT fnd001_t.x(fnd001_t.filing_sql('9999999901', '0000000001-24-000001', 'sA'));
SELECT fnd001_t.x(fnd001_t.filing_sql('9999999901', '0000000001-24-000002', 'sA', '10-Q'));
SELECT fnd001_t.x(fnd001_t.filing_sql('9999999902', '0000000002-24-000001', 'sB'));
SELECT fnd001_t.mkrun('cA',  '9999999901', 'companyfacts');
SELECT fnd001_t.mkrun('cA2', '9999999901', 'companyfacts');
SELECT fnd001_t.mkrun('cB',  '9999999902', 'companyfacts');
SELECT fnd001_t.x(fnd001_t.raw_sql('rfA1', '9999999901', '0000000001-24-000001', 'cA'));
SELECT fnd001_t.x(fnd001_t.raw_sql('rfB1', '9999999902', '0000000002-24-000001', 'cB'));
-- Completed companyfacts runs (sources for normalization) for A and B
SELECT fnd001_t.mkrun('cAd', '9999999901', 'companyfacts');
SELECT fnd001_t.x(fnd001_t.raw_sql('rfAd', '9999999901', '0000000001-24-000001', 'cAd', _tag => 'NetIncomeLoss'));
SELECT fnd001_t.x(fnd001_t.obs_sql('9999999901', 'rfAd', 'cAd'));
SELECT fnd001_t.dl('cAd');
SELECT fnd001_t.eq('setup.cAd completed', fnd001_t.fin_facts('cAd', 1), 'completed');
SELECT fnd001_t.mkrun('cBd', '9999999902', 'companyfacts');
SELECT fnd001_t.x(fnd001_t.raw_sql('rfBd', '9999999902', '0000000002-24-000001', 'cBd', _tag => 'NetIncomeLoss'));
SELECT fnd001_t.x(fnd001_t.obs_sql('9999999902', 'rfBd', 'cBd'));
SELECT fnd001_t.dl('cBd');
SELECT fnd001_t.eq('setup.cBd completed', fnd001_t.fin_facts('cBd', 1), 'completed');
-- Normalized facts with lineage
SELECT fnd001_t.newid('nA1'); SELECT fnd001_t.newid('nA2'); SELECT fnd001_t.newid('nA3'); SELECT fnd001_t.newid('nB1');
SELECT fnd001_t.x(fnd001_t.norm_sql('nA1', '9999999901', '0000000001-24-000001', 'cAd'));
SELECT fnd001_t.x(fnd001_t.src_sql('9999999901', 'nA1', 'rfAd'));
SELECT fnd001_t.x(fnd001_t.norm_sql('nA2', '9999999901', '0000000001-24-000001', 'cAd', 'NetIncomeLoss'));
SELECT fnd001_t.x(fnd001_t.src_sql('9999999901', 'nA2', 'rfAd'));
SELECT fnd001_t.x(fnd001_t.norm_sql('nA3', '9999999901', '0000000001-24-000002', 'cAd'));
SELECT fnd001_t.x(fnd001_t.src_sql('9999999901', 'nA3', 'rfAd'));
SELECT fnd001_t.x(fnd001_t.norm_sql('nB1', '9999999902', '0000000002-24-000001', 'cBd'));
SELECT fnd001_t.x(fnd001_t.src_sql('9999999902', 'nB1', 'rfBd'));
SET CONSTRAINTS ALL IMMEDIATE;   -- validate base lineage now
SET CONSTRAINTS ALL DEFERRED;
SELECT fnd001_t.eq('setup.logical_key computed by trigger',
  (SELECT logical_key FROM public.sec_normalized_facts WHERE normalized_fact_id = fnd001_t.id('nA1')),
  'Revenues|USD|instant||2024-12-31');

-- ------------------------------------------------------------------ T1–T3 multi-company FKs
SELECT fnd001_t.expect('T1 filing of A with run of B',
  fnd001_t.filing_sql('9999999901', '0000000001-24-000099', 'sB'), '23503');
SELECT fnd001_t.expect('T2.1 raw fact of A with filing of B',
  fnd001_t.raw_sql('t2', '9999999901', '0000000002-24-000001', 'cA'), '23503');
SELECT fnd001_t.expect('T2.2 observation of A with run of B',
  fnd001_t.obs_sql('9999999901', 'rfA1', 'cB'), '23503');
SELECT fnd001_t.newid('t3n');
SELECT fnd001_t.expect('T3.1 normalized of A with filing of B',
  fnd001_t.norm_sql('t3n', '9999999901', '0000000002-24-000001', 'cAd'), '23503');
SELECT fnd001_t.newid('t3n2');
SELECT fnd001_t.expect('T3.2 source (A, normalized of A, raw of B) DEVIATION spec=23503: BEFORE INSERT lineage guard rejects first',
  fnd001_t.norm_sql('t3n2', '9999999901', '0000000001-24-000001', 'cAd', 'Assets') || ';' ||
  fnd001_t.src_sql('9999999901', 't3n2', 'rfBd'), '23514');

-- ------------------------------------------------------------------ T4–T7 value types, periods, NaN, precision
SELECT fnd001_t.expect('T4.1 numeric + text',      fnd001_t.raw_sql('t4a', '9999999901', '0000000001-24-000001', 'cA', 'numeric', '1', 'x'), '23514');
SELECT fnd001_t.expect('T4.2 numeric without unit', fnd001_t.raw_sql('t4b', '9999999901', '0000000001-24-000001', 'cA', 'numeric', '1', NULL, NULL), '23514');
SELECT fnd001_t.expect('T4.3 text with NULL value_text', fnd001_t.raw_sql('t4c', '9999999901', '0000000001-24-000001', 'cA', 'text', NULL, NULL), '23514');
SELECT fnd001_t.expect('T4.4 text + number',       fnd001_t.raw_sql('t4d', '9999999901', '0000000001-24-000001', 'cA', 'text', '1', 'x'), '23514');
SELECT fnd001_t.expect('T4.5 nil with value',      fnd001_t.raw_sql('t4e', '9999999901', '0000000001-24-000001', 'cA', 'nil', '1', NULL), '23514');
SELECT fnd001_t.expect('T4.6 numeric + unit OK',   fnd001_t.raw_sql('t4f', '9999999901', '0000000001-24-000001', 'cA'), '00000');
SELECT fnd001_t.expect('T4.7 text + unit NULL OK', fnd001_t.raw_sql('t4g', '9999999901', '0000000001-24-000001', 'cA', 'text', NULL, 'Yes', NULL, _tax => 'dei', _tag => 'AmendmentFlag'), '00000');
SELECT fnd001_t.expect('T4.8 text empty string OK', fnd001_t.raw_sql('t4h', '9999999901', '0000000001-24-000001', 'cA', 'text', NULL, '', NULL, _tax => 'dei', _tag => 'DocumentType'), '00000');
SELECT fnd001_t.expect('T4.9 nil OK',              fnd001_t.raw_sql('t4i', '9999999901', '0000000001-24-000001', 'cA', 'nil', NULL, NULL, NULL), '00000');
SELECT fnd001_t.expect('T5.1 instant with start',  fnd001_t.raw_sql('t5a', '9999999901', '0000000001-24-000001', 'cA', _ptype => 'instant', _pstart => '2024-01-01'), '23514');
SELECT fnd001_t.expect('T5.2 duration without start', fnd001_t.raw_sql('t5b', '9999999901', '0000000001-24-000001', 'cA', _ptype => 'duration'), '23514');
SELECT fnd001_t.expect('T5.3 start > end',         fnd001_t.raw_sql('t5c', '9999999901', '0000000001-24-000001', 'cA', _ptype => 'duration', _pstart => '2025-06-01'), '23514');
SELECT fnd001_t.expect('T5.4 valid duration OK',   fnd001_t.raw_sql('t5d', '9999999901', '0000000001-24-000001', 'cA', _ptype => 'duration', _pstart => '2024-01-01'), '00000');
SELECT fnd001_t.expect('T6.1 NaN',       fnd001_t.raw_sql('t6a', '9999999901', '0000000001-24-000001', 'cA', 'numeric', 'NaN'), '23514');
SELECT fnd001_t.expect('T6.2 Infinity',  fnd001_t.raw_sql('t6b', '9999999901', '0000000001-24-000001', 'cA', 'numeric', 'Infinity'), '23514');
SELECT fnd001_t.expect('T6.3 -Infinity', fnd001_t.raw_sql('t6c', '9999999901', '0000000001-24-000001', 'cA', 'numeric', '-Infinity'), '23514');
SELECT fnd001_t.expect('T7.0 insert 60-digit decimal',
  fnd001_t.raw_sql('t7', '9999999901', '0000000001-24-000001', 'cA', 'numeric',
                   '123456789012345678901234567890123456789.123456789012345678901'), '00000');
SELECT fnd001_t.eq('T7.1 decimal reads back identical',
  (SELECT value_numeric::text FROM public.sec_raw_facts WHERE fact_hash = fnd001_t.h('t7')),
  '123456789012345678901234567890123456789.123456789012345678901');

-- ------------------------------------------------------------------ T8–T10 observations, reingest, conflicts
SELECT fnd001_t.x(fnd001_t.raw_sql('rf8', '9999999901', '0000000001-24-000001', 'cA', _tag => 'Assets'));
SELECT fnd001_t.x(fnd001_t.obs_sql('9999999901', 'rf8', 'cA', 'same', _conflict_ignore => true));
SELECT fnd001_t.x(fnd001_t.obs_sql('9999999901', 'rf8', 'cA', 'same', _conflict_ignore => true));
SELECT fnd001_t.eq('T8.1 same content twice in one run -> 1 row',
  (SELECT count(*)::text FROM public.sec_raw_fact_observations WHERE raw_fact_hash = fnd001_t.h('rf8')), '1');
SELECT fnd001_t.expect('T8.2 same content without ON CONFLICT -> unique violation',
  fnd001_t.obs_sql('9999999901', 'rf8', 'cA', 'same'), '23505');
SELECT fnd001_t.x(fnd001_t.obs_sql('9999999901', 'rf8', 'cA', 'different-json'));
SELECT fnd001_t.eq('T8.3 same fact_hash, different raw_json_sha256 -> 2 rows',
  (SELECT count(*)::text FROM public.sec_raw_fact_observations WHERE raw_fact_hash = fnd001_t.h('rf8')), '2');

SELECT fnd001_t.x(fnd001_t.raw_sql('rf9', '9999999901', '0000000001-24-000001', 'cA', _tag => 'Liabilities'));
SELECT fnd001_t.x(fnd001_t.obs_sql('9999999901', 'rf9', 'cA'));
SELECT fnd001_t.x(fnd001_t.raw_sql('rf9', '9999999901', '0000000001-24-000001', 'cA2', _tag => 'Liabilities', _conflict_ignore => true));
SELECT fnd001_t.x(fnd001_t.obs_sql('9999999901', 'rf9', 'cA2'));
SELECT fnd001_t.eq('T9.1 same fact in two runs -> 1 raw fact',
  (SELECT count(*)::text FROM public.sec_raw_facts WHERE fact_hash = fnd001_t.h('rf9')), '1');
SELECT fnd001_t.eq('T9.2 same fact in two runs -> 2 observations',
  (SELECT count(*)::text FROM public.sec_raw_fact_observations WHERE raw_fact_hash = fnd001_t.h('rf9')), '2');

SELECT fnd001_t.mkrun('c10m', '9999999901', 'companyfacts');
SELECT fnd001_t.x(fnd001_t.raw_sql('rf10m', '9999999901', '0000000001-24-000001', 'c10m', _tag => 'Equity'));
SELECT fnd001_t.x(fnd001_t.obs_sql('9999999901', 'rf10m', 'c10m', 'fp-changed', 'metadata'));
SELECT fnd001_t.dl('c10m');
SELECT fnd001_t.eq('T10.1 metadata conflict -> finalize failed', fnd001_t.fin_facts('c10m', 1), 'failed');
SELECT fnd001_t.eq('T10.2 metadata_conflicts recorded', fnd001_t.runcol('c10m', 'metadata_conflicts'), '1');
SELECT fnd001_t.mkrun('c10f', '9999999901', 'companyfacts');
SELECT fnd001_t.x(fnd001_t.raw_sql('rf10f', '9999999901', '0000000001-24-000001', 'c10f', _tag => 'Cash'));
SELECT fnd001_t.x(fnd001_t.obs_sql('9999999901', 'rf10f', 'c10f', 'frame-changed', 'frame_only'));
SELECT fnd001_t.dl('c10f');
SELECT fnd001_t.eq('T10.3 frame_only -> finalize completed', fnd001_t.fin_facts('c10f', 1), 'completed');
SELECT fnd001_t.eq('T10.4 frame_changes recorded', fnd001_t.runcol('c10f', 'frame_changes'), '1');

-- ------------------------------------------------------------------ T11–T15 append-only and supersession
SELECT fnd001_t.expect('T11.1 service_role UPDATE filings',      'UPDATE public.sec_filings SET form = ''10-Q'' WHERE cik = ''9999999901''', '42501', 'service_role');
SELECT fnd001_t.expect('T11.2 service_role DELETE filings',      'DELETE FROM public.sec_filings WHERE cik = ''9999999901''', '42501', 'service_role');
SELECT fnd001_t.expect('T11.3 service_role UPDATE raw facts',    'UPDATE public.sec_raw_facts SET tag = ''X'' WHERE cik = ''9999999901''', '42501', 'service_role');
SELECT fnd001_t.expect('T11.4 service_role DELETE raw facts',    'DELETE FROM public.sec_raw_facts WHERE cik = ''9999999901''', '42501', 'service_role');
SELECT fnd001_t.expect('T11.5 service_role UPDATE observations', 'UPDATE public.sec_raw_fact_observations SET frame = ''X'' WHERE cik = ''9999999901''', '42501', 'service_role');
SELECT fnd001_t.expect('T11.6 service_role DELETE observations', 'DELETE FROM public.sec_raw_fact_observations WHERE cik = ''9999999901''', '42501', 'service_role');
SELECT fnd001_t.expect('T11.7 service_role UPDATE sources',      'UPDATE public.sec_normalized_fact_sources SET role = ''component'' WHERE cik = ''9999999901''', '42501', 'service_role');
SELECT fnd001_t.expect('T11.8 service_role DELETE sources',      'DELETE FROM public.sec_normalized_fact_sources WHERE cik = ''9999999901''', '42501', 'service_role');
SELECT fnd001_t.expect('T11.9 service_role TRUNCATE sources',    'TRUNCATE public.sec_normalized_fact_sources', '42501', 'service_role');
SELECT fnd001_t.expect('T11.10 service_role TRUNCATE filings',   'TRUNCATE public.sec_filings CASCADE', '42501', 'service_role');
-- Same operations as the table owner: the append-only triggers, not only privileges, must block them
SELECT fnd001_t.expect('T11.11 owner UPDATE filings (trigger)',      'UPDATE public.sec_filings SET form = ''10-Q'' WHERE cik = ''9999999901''', '42501');
SELECT fnd001_t.expect('T11.12 owner DELETE raw facts (trigger)',    'DELETE FROM public.sec_raw_facts WHERE fact_hash = ''\x00''::bytea OR cik = ''9999999901''', '42501');
SELECT fnd001_t.expect('T11.13 owner UPDATE observations (trigger)', 'UPDATE public.sec_raw_fact_observations SET frame = ''X'' WHERE cik = ''9999999901''', '42501');
SELECT fnd001_t.expect('T11.14 owner DELETE sources (trigger)',      'DELETE FROM public.sec_normalized_fact_sources WHERE cik = ''9999999901''', '42501');
SELECT fnd001_t.expect('T11.15 owner TRUNCATE sources (trigger)',    'TRUNCATE public.sec_normalized_fact_sources', '42501');

SELECT fnd001_t.expect('T12.1 service_role UPDATE normalized value',
  format('UPDATE public.sec_normalized_facts SET value_numeric = 2 WHERE normalized_fact_id = %L', fnd001_t.id('nA2')), '42501', 'service_role');
SELECT fnd001_t.expect('T12.2 service_role DELETE normalized',
  format('DELETE FROM public.sec_normalized_facts WHERE normalized_fact_id = %L', fnd001_t.id('nA2')), '42501', 'service_role');
SELECT fnd001_t.expect('T12.3 owner DELETE normalized (trigger)',
  format('DELETE FROM public.sec_normalized_facts WHERE normalized_fact_id = %L', fnd001_t.id('nA2')), '42501');
SELECT fnd001_t.newid('nA1v2');
SELECT fnd001_t.expect('T12.4 valid supersession (retire old, insert new, add source) as service_role',
  format('UPDATE public.sec_normalized_facts SET is_current = false, superseded_by = %L WHERE normalized_fact_id = %L;',
         fnd001_t.id('nA1v2'), fnd001_t.id('nA1'))
  || fnd001_t.norm_sql('nA1v2', '9999999901', '0000000001-24-000001', 'cAd', 'Revenues', 'v2') || ';'
  || fnd001_t.src_sql('9999999901', 'nA1v2', 'rfAd'),
  '00000', 'service_role', NULL, true);
SELECT fnd001_t.eq('T12.5 exactly one current version after supersession',
  (SELECT count(*)::text FROM public.sec_normalized_facts
    WHERE cik = '9999999901' AND logical_key = 'Revenues|USD|instant||2024-12-31'
      AND accession_number = '0000000001-24-000001' AND is_current), '1');

SELECT fnd001_t.expect('T13 supersession towards another company',
  format('UPDATE public.sec_normalized_facts SET is_current = false, superseded_by = %L WHERE normalized_fact_id = %L',
         fnd001_t.id('nB1'), fnd001_t.id('nA2')), '23503', 'service_role', NULL, true);
SELECT fnd001_t.expect('T14.1 supersession towards another logical_key',
  format('UPDATE public.sec_normalized_facts SET is_current = false, superseded_by = %L WHERE normalized_fact_id = %L',
         fnd001_t.id('nA1v2'), fnd001_t.id('nA2')), '23503', 'service_role', NULL, true);
SELECT fnd001_t.expect('T14.2 supersession towards another accession',
  format('UPDATE public.sec_normalized_facts SET is_current = false, superseded_by = %L WHERE normalized_fact_id = %L',
         fnd001_t.id('nA3'), fnd001_t.id('nA1v2')), '23503', 'service_role', NULL, true);
SELECT fnd001_t.expect('T15.1 supersession towards a non-current version (at commit)',
  format('UPDATE public.sec_normalized_facts SET is_current = false, superseded_by = %L WHERE normalized_fact_id = %L',
         fnd001_t.id('nA1'), fnd001_t.id('nA1v2')), '23514', 'service_role', NULL, true);
-- Same (normalizer_version, rule_version) for the same identity cannot exist (sec_norm_version_uq);
-- the reachable equivalent is self-supersession, rejected by CHECK.
SELECT fnd001_t.expect('T15.2 self-supersession',
  format('UPDATE public.sec_normalized_facts SET is_current = false, superseded_by = %L WHERE normalized_fact_id = %L',
         fnd001_t.id('nA2'), fnd001_t.id('nA2')), '23514', 'service_role', NULL, true);
SELECT fnd001_t.newid('nA2dup');
SELECT fnd001_t.expect('T15.3 duplicate (normalizer_version, rule_version) for same identity',
  format('UPDATE public.sec_normalized_facts SET is_current = false, superseded_by = %L WHERE normalized_fact_id = %L;',
         fnd001_t.id('nA2dup'), fnd001_t.id('nA2'))
  || fnd001_t.norm_sql('nA2dup', '9999999901', '0000000001-24-000001', 'cAd', 'NetIncomeLoss', 'v1') || ';'
  || fnd001_t.src_sql('9999999901', 'nA2dup', 'rfAd'), '23505', 'service_role', NULL, true);

-- ------------------------------------------------------------------ T16 run initial state
SELECT fnd001_t.expect('T16.1 INSERT run already completed',
  'INSERT INTO public.sec_ingestion_runs(cik, resource_kind, endpoint_url, user_agent, status) VALUES '
  '(''9999999901'',''companyfacts'',''https://data.sec.gov/api/xbrl/companyfacts/CIK9999999901.json'',''ua'',''completed'')',
  '23514', 'service_role');
SELECT fnd001_t.expect('T16.2 INSERT run with ' || f.col || ' not null',
  format('INSERT INTO public.sec_ingestion_runs(cik, resource_kind, endpoint_url, user_agent, %I) VALUES '
         '(''9999999901'',''companyfacts'',''https://data.sec.gov/api/xbrl/companyfacts/CIK9999999901.json'',''ua'',%s)',
         f.col, f.lit), '23514', 'service_role')
FROM (VALUES ('finished_at','now()'), ('http_status','200'), ('content_type','''x'''), ('payload_bytes','1'),
             ('payload_sha256','sha256(''x''::bytea)'), ('storage_bucket','''b'''), ('storage_path','''p'''),
             ('payload_filing_count','0'), ('filings_skipped_form','0'), ('filings_inserted','0'),
             ('filings_not_inserted','0'), ('filing_conflicts','0'), ('payload_fact_count','0'),
             ('facts_skipped_scope','0'), ('payload_duplicate_count','0'), ('facts_inserted','0'),
             ('facts_existing','0'), ('facts_rejected','0'), ('observations_written','0'),
             ('metadata_conflicts','0'), ('frame_changes','0'), ('conflict_samples','''[]''::jsonb'),
             ('error_message','''e''')) AS f(col, lit);
SELECT fnd001_t.expect('T16.3 endpoint does not match kind/CIK',
  'INSERT INTO public.sec_ingestion_runs(cik, resource_kind, endpoint_url, user_agent) VALUES '
  '(''9999999901'',''companyfacts'',''https://data.sec.gov/api/xbrl/companyfacts/CIK9999999902.json'',''ua'')',
  '23514', 'service_role');
SELECT fnd001_t.expect('T16.4 page_name of another CIK',
  'INSERT INTO public.sec_ingestion_runs(cik, resource_kind, page_name, endpoint_url, user_agent) VALUES '
  '(''9999999901'',''submissions_page'',''CIK9999999902-submissions-001.json'','
  '''https://data.sec.gov/submissions/CIK9999999902-submissions-001.json'',''ua'')',
  '23514', 'service_role');
SELECT fnd001_t.expect('T16.5 valid submissions_page run OK',
  'INSERT INTO public.sec_ingestion_runs(cik, resource_kind, page_name, endpoint_url, user_agent) VALUES '
  '(''9999999901'',''submissions_page'',''CIK9999999901-submissions-001.json'','
  '''https://data.sec.gov/submissions/CIK9999999901-submissions-001.json'',''ua'')',
  '00000', 'service_role');

-- ------------------------------------------------------------------ T17 failure mid-run and retry (DB portion)
SELECT fnd001_t.mkrun('c17a', '9999999901', 'companyfacts');
SELECT fnd001_t.x(fnd001_t.raw_sql('rf17', '9999999901', '0000000001-24-000001', 'c17a', _tag => 'Inventory'));
SELECT fnd001_t.x(fnd001_t.obs_sql('9999999901', 'rf17', 'c17a', 'batch1'));
SELECT public.sec_fail_run(fnd001_t.id('c17a'), 'batch 2 raised');
SELECT fnd001_t.eq('T17.1 failed run keeps status failed', fnd001_t.st('c17a'), 'failed');
SELECT fnd001_t.eq('T17.2 partial observations preserved',
  (SELECT count(*)::text FROM public.sec_raw_fact_observations WHERE run_id = fnd001_t.id('c17a')), '1');
SELECT fnd001_t.expect('T17.3 new observation in failed run', fnd001_t.obs_sql('9999999901', 'rf17', 'c17a', 'batch2'), '23514');
SELECT fnd001_t.mkrun('c17b', '9999999901', 'companyfacts');
SELECT fnd001_t.x(fnd001_t.raw_sql('rf17', '9999999901', '0000000001-24-000001', 'c17b', _tag => 'Inventory', _conflict_ignore => true));
SELECT fnd001_t.x(fnd001_t.obs_sql('9999999901', 'rf17', 'c17b', 'batch1'));
SELECT fnd001_t.dl('c17b');
SELECT fnd001_t.eq('T17.4 retry with new run -> completed', fnd001_t.fin_facts('c17b', 1), 'completed');
SELECT fnd001_t.eq('T17.5 no duplicate raw fact after retry',
  (SELECT count(*)::text FROM public.sec_raw_facts WHERE fact_hash = fnd001_t.h('rf17')), '1');
SELECT fnd001_t.eq('T17.6 retry counts fact as existing', fnd001_t.runcol('c17b', 'facts_existing'), '1');

-- ------------------------------------------------------------------ T18 only completed companyfacts runs are normalized
SELECT fnd001_t.newid('t18a'); SELECT fnd001_t.newid('t18b'); SELECT fnd001_t.newid('t18c');
SELECT fnd001_t.expect('T18.1 normalize from failed run',  fnd001_t.norm_sql('t18a', '9999999901', '0000000001-24-000001', 'c17a', 'Inventory'), '23514');
SELECT fnd001_t.expect('T18.2 normalize from running run', fnd001_t.norm_sql('t18b', '9999999901', '0000000001-24-000001', 'cA', 'Inventory'), '23514');
SELECT fnd001_t.expect('T18.3 normalize from submissions run', fnd001_t.norm_sql('t18c', '9999999901', '0000000001-24-000001', 'sA', 'Inventory'), '23514');

-- ------------------------------------------------------------------ T20 sec_is_admin (simulated claims; real JWT in access-check.ts)
SELECT fnd001_t.eq('T20.1 anon, no claims -> false',
  fnd001_t.val('SELECT public.sec_is_admin()::text', 'anon'), 'false');
SELECT fnd001_t.eq('T20.2 authenticated without sub -> false',
  fnd001_t.val('SELECT public.sec_is_admin()::text', 'authenticated', '{"role":"authenticated"}'), 'false');
SELECT fnd001_t.eq('T20.3 non-admin UID -> false',
  fnd001_t.val('SELECT public.sec_is_admin()::text', 'authenticated',
               '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}'), 'false');
SELECT fnd001_t.eq('T20.4 anon cannot execute has_role',
  fnd001_t.val('SELECT public.has_role(''00000000-0000-4000-8000-000000000001'', ''admin'')::text', 'anon'), 'ERR:42501');

-- ------------------------------------------------------------------ T21 RLS and grants (SET ROLE; real JWT in access-check.ts)
SELECT fnd001_t.eq('T21.1 anon sees published company only',
  fnd001_t.val('SELECT string_agg(cik, '','' ORDER BY cik) FROM public.sec_companies WHERE cik LIKE ''99999999%''', 'anon'), '9999999901');
SELECT fnd001_t.eq('T21.2 anon sees filings of published company only',
  fnd001_t.val('SELECT count(*) FILTER (WHERE cik = ''9999999902'')::text FROM public.sec_filings', 'anon'), '0');
SELECT fnd001_t.eq('T21.3 anon sees only current normalized facts of published company',
  fnd001_t.val('SELECT count(*) FILTER (WHERE NOT is_current OR cik = ''9999999902'')::text FROM public.sec_normalized_facts', 'anon'), '0');
SELECT fnd001_t.eq('T21.4 anon reads published current normalized facts',
  fnd001_t.val('SELECT (count(*) > 0)::text FROM public.sec_normalized_facts WHERE cik = ''9999999901''', 'anon'), 'true');
SELECT fnd001_t.eq('T21.5 anon cannot read runs',         fnd001_t.val('SELECT count(*)::text FROM public.sec_ingestion_runs', 'anon'), 'ERR:42501');
SELECT fnd001_t.eq('T21.6 anon cannot read raw facts',    fnd001_t.val('SELECT count(*)::text FROM public.sec_raw_facts', 'anon'), 'ERR:42501');
SELECT fnd001_t.eq('T21.7 anon cannot read observations', fnd001_t.val('SELECT count(*)::text FROM public.sec_raw_fact_observations', 'anon'), 'ERR:42501');
SELECT fnd001_t.eq('T21.8 anon cannot read sources',      fnd001_t.val('SELECT count(*)::text FROM public.sec_normalized_fact_sources', 'anon'), 'ERR:42501');
SELECT fnd001_t.expect('T21.9 anon INSERT company', 'INSERT INTO public.sec_companies(cik, entity_name) VALUES (''9999999903'',''x'')', '42501', 'anon');
SELECT fnd001_t.eq('T21.10 non-admin sees 0 runs', fnd001_t.val('SELECT count(*)::text FROM public.sec_ingestion_runs', 'authenticated',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}'), '0');
SELECT fnd001_t.eq('T21.11 non-admin sees 0 raw facts', fnd001_t.val('SELECT count(*)::text FROM public.sec_raw_facts', 'authenticated',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}'), '0');
SELECT fnd001_t.eq('T21.12 non-admin sees 0 observations', fnd001_t.val('SELECT count(*)::text FROM public.sec_raw_fact_observations', 'authenticated',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}'), '0');
SELECT fnd001_t.eq('T21.13 non-admin sees 0 sources', fnd001_t.val('SELECT count(*)::text FROM public.sec_normalized_fact_sources', 'authenticated',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}'), '0');
SELECT fnd001_t.eq('T21.14 non-admin does not see unpublished company',
  fnd001_t.val('SELECT count(*)::text FROM public.sec_companies WHERE cik = ''9999999902''', 'authenticated',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}'), '0');
SELECT fnd001_t.expect('T21.15 non-admin INSERT company', 'INSERT INTO public.sec_companies(cik, entity_name) VALUES (''9999999903'',''x'')', '42501',
  'authenticated', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}');
SELECT fnd001_t.expect('T21.16 non-admin UPDATE company', 'UPDATE public.sec_companies SET is_published = true', '42501',
  'authenticated', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}');
SELECT fnd001_t.expect('T21.17 service_role INSERT company OK', 'INSERT INTO public.sec_companies(cik, entity_name) VALUES (''9999999903'',''Test C'')', '00000', 'service_role');
SELECT fnd001_t.expect('T21.18 service_role DELETE company', 'DELETE FROM public.sec_companies WHERE cik = ''9999999903''', '42501', 'service_role');

-- ------------------------------------------------------------------ T23–T24 finalisation counters (DB portion)
SELECT fnd001_t.mkrun('s23', '9999999901', 'submissions');
SELECT fnd001_t.x(fnd001_t.filing_sql('9999999901', '0000000001-24-000003', 's23'));
SELECT fnd001_t.x(fnd001_t.filing_sql('9999999901', '0000000001-24-000004', 's23', '10-Q'));
SELECT fnd001_t.x(fnd001_t.filing_sql('9999999901', '0000000001-24-000001', 's23', _conflict_ignore => true));  -- existing identical
SELECT fnd001_t.dl('s23');
SELECT fnd001_t.eq('T23.1 3 filings (2 new, 1 existing) -> completed', fnd001_t.fin_sub('s23', 3), 'completed');
SELECT fnd001_t.eq('T23.2 filings_inserted from DB', fnd001_t.runcol('s23', 'filings_inserted'), '2');
SELECT fnd001_t.eq('T23.3 observations_written not used', fnd001_t.runcol('s23', 'observations_written'), NULL);
SELECT fnd001_t.mkrun('s23b', '9999999901', 'submissions');
SELECT fnd001_t.x(fnd001_t.filing_sql('9999999901', '0000000001-24-000005', 's23b'));
SELECT fnd001_t.x(fnd001_t.filing_sql('9999999901', '0000000001-24-000006', 's23b'));
SELECT fnd001_t.dl('s23b');
SELECT fnd001_t.eq('T23.4 incoherent count (client 1 < inserted 2) -> failed', fnd001_t.fin_sub('s23b', 1), 'failed');

SELECT fnd001_t.mkrun('c24', '9999999901', 'companyfacts');
SELECT fnd001_t.x(fnd001_t.raw_sql('rf24a', '9999999901', '0000000001-24-000001', 'c24', _tag => 'A24'));
SELECT fnd001_t.x(fnd001_t.raw_sql('rf24b', '9999999901', '0000000001-24-000001', 'c24', _tag => 'B24'));
SELECT fnd001_t.x(fnd001_t.obs_sql('9999999901', 'rf24a', 'c24'));
SELECT fnd001_t.x(fnd001_t.obs_sql('9999999901', 'rf24b', 'c24'));
SELECT fnd001_t.dl('c24');
SELECT fnd001_t.eq('T24.1 N=3 with 1 in-payload duplicate -> completed', fnd001_t.fin_facts('c24', 3, 1), 'completed');
SELECT fnd001_t.eq('T24.2 facts_inserted', fnd001_t.runcol('c24', 'facts_inserted'), '2');
SELECT fnd001_t.mkrun('c24r', '9999999901', 'companyfacts');
SELECT fnd001_t.x(fnd001_t.raw_sql('rf24a', '9999999901', '0000000001-24-000001', 'c24r', _tag => 'A24', _conflict_ignore => true));
SELECT fnd001_t.x(fnd001_t.raw_sql('rf24b', '9999999901', '0000000001-24-000001', 'c24r', _tag => 'B24', _conflict_ignore => true));
SELECT fnd001_t.x(fnd001_t.obs_sql('9999999901', 'rf24a', 'c24r'));
SELECT fnd001_t.x(fnd001_t.obs_sql('9999999901', 'rf24b', 'c24r'));
SELECT fnd001_t.dl('c24r');
SELECT fnd001_t.eq('T24.3 reingest -> completed', fnd001_t.fin_facts('c24r', 3, 1), 'completed');
SELECT fnd001_t.eq('T24.4 reingest facts_inserted = 0', fnd001_t.runcol('c24r', 'facts_inserted'), '0');
SELECT fnd001_t.eq('T24.5 reingest facts_existing = N-1', fnd001_t.runcol('c24r', 'facts_existing'), '2');
SELECT fnd001_t.eq('T24.6 reingest observations_written = N-1', fnd001_t.runcol('c24r', 'observations_written'), '2');

-- ------------------------------------------------------------------ T25 run RPCs
SELECT fnd001_t.expect('T25.1 service_role direct UPDATE of run status',
  format('UPDATE public.sec_ingestion_runs SET status = ''completed'' WHERE run_id = %L', fnd001_t.id('cA')), '42501', 'service_role');
SELECT fnd001_t.mkrun('c25', '9999999901', 'companyfacts');
SELECT fnd001_t.dl('c25');
SELECT fnd001_t.eq('T25.2 service_role sec_finalize_run OK',
  fnd001_t.val(format('SELECT public.sec_finalize_run(%L, %L::jsonb)', fnd001_t.id('c25'),
    '{"payload_fact_count":0,"facts_skipped_scope":0,"payload_duplicate_count":0,"facts_rejected":0}'), 'service_role'), 'completed');
SELECT fnd001_t.mkrun('c25old', '9999999901', 'companyfacts', now() - interval '2 hours');
SELECT fnd001_t.eq('T25.3 sec_fail_stale_runs(1 hour) marks the orphan',
  fnd001_t.val('SELECT public.sec_fail_stale_runs(''1 hour'')::text', 'service_role'), '1');
SELECT fnd001_t.eq('T25.4 orphan is failed', fnd001_t.st('c25old'), 'failed');
SELECT fnd001_t.eq('T25.5 recent running runs untouched', fnd001_t.st('cA'), 'running');
SELECT fnd001_t.expect('T25.6 sec_fail_stale_runs(NULL)',      'SELECT public.sec_fail_stale_runs(NULL)', 'P0001', 'service_role');
SELECT fnd001_t.expect('T25.7 sec_fail_stale_runs(5 minutes)', 'SELECT public.sec_fail_stale_runs(''5 minutes'')', 'P0001', 'service_role');
SELECT fnd001_t.expect('T25.8 anon cannot execute run RPCs',
  format('SELECT public.sec_fail_run(%L, ''x'')', fnd001_t.id('cA')), '42501', 'anon');
SELECT fnd001_t.expect('T25.9 authenticated cannot execute run RPCs',
  format('SELECT public.sec_fail_run(%L, ''x'')', fnd001_t.id('cA')), '42501', 'authenticated',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}');

-- ------------------------------------------------------------------ T26–T27 run kind, lineage, filing conflicts
SELECT fnd001_t.expect('T26.1 filing with companyfacts run', fnd001_t.filing_sql('9999999901', '0000000001-24-000090', 'cA'), '23514');
SELECT fnd001_t.expect('T26.2 raw fact with submissions run', fnd001_t.raw_sql('t26', '9999999901', '0000000001-24-000001', 'sA'), '23514');
SELECT fnd001_t.expect('T26.3 observation with submissions run', fnd001_t.obs_sql('9999999901', 'rfA1', 'sA'), '23514');
SELECT fnd001_t.newid('t27');
SELECT fnd001_t.expect('T27.1 normalized fact without sources (at commit)',
  fnd001_t.norm_sql('t27', '9999999901', '0000000001-24-000001', 'cAd', 'Goodwill'), '23514', NULL, NULL, true);
SELECT fnd001_t.mkrun('s27', '9999999901', 'submissions');
SELECT fnd001_t.dl('s27');
SELECT fnd001_t.eq('T27.2 filing conflict reported -> failed',
  fnd001_t.fin_sub('s27', 1, 1, '[{"accession_number":"0000000001-24-000001","field":"form"}]'), 'failed');
SELECT fnd001_t.eq('T27.3 filing_conflicts stored', fnd001_t.runcol('s27', 'filing_conflicts'), '1');
SELECT fnd001_t.eq('T27.4 conflict sample stored', fnd001_t.runcol('s27', 'conflict_samples'),
  '[{"field": "form", "accession_number": "0000000001-24-000001"}]');

-- ------------------------------------------------------------------ T28–T29 taxonomy and form scope (DB portion)
SELECT fnd001_t.expect('T28.1 raw fact with taxonomy srt',
  fnd001_t.raw_sql('t28', '9999999901', '0000000001-24-000001', 'cA', _tax => 'srt'), '23514');
SELECT fnd001_t.expect('T28.2 raw fact with taxonomy ifrs-full',
  fnd001_t.raw_sql('t28b', '9999999901', '0000000001-24-000001', 'cA', _tax => 'ifrs-full'), '23514');
SELECT fnd001_t.expect('T29.1 filing form 8-K',  fnd001_t.filing_sql('9999999901', '0000000001-24-000091', 'sA', '8-K'), '23514');
SELECT fnd001_t.expect('T29.2 filing form 20-F', fnd001_t.filing_sql('9999999901', '0000000001-24-000092', 'sA', '20-F'), '23514');
SELECT fnd001_t.expect('T29.3 filing form 10-K/A OK', fnd001_t.filing_sql('9999999901', '0000000001-24-000093', 'sA', '10-K/A'), '00000');
SELECT fnd001_t.expect('T29.4 filing form 10-Q/A OK', fnd001_t.filing_sql('9999999901', '0000000001-24-000094', 'sA', '10-Q/A'), '00000');

-- ------------------------------------------------------------------ T30 required counters
SELECT fnd001_t.mkrun('s30_' || k, '9999999901', 'submissions')
  FROM unnest(ARRAY['payload_filing_count','filings_skipped_form','filing_conflicts']) k;
SELECT fnd001_t.dl('s30_' || k) FROM unnest(ARRAY['payload_filing_count','filings_skipped_form','filing_conflicts']) k;
SELECT fnd001_t.eq('T30.1 finalize submissions without ' || k || ' -> failed', fnd001_t.fin_sub('s30_' || k, 0, 0, NULL, k), 'failed')
  FROM unnest(ARRAY['payload_filing_count','filings_skipped_form','filing_conflicts']) k;
SELECT fnd001_t.mkrun('c30_' || k, '9999999901', 'companyfacts')
  FROM unnest(ARRAY['payload_fact_count','facts_skipped_scope','payload_duplicate_count','facts_rejected']) k;
SELECT fnd001_t.dl('c30_' || k) FROM unnest(ARRAY['payload_fact_count','facts_skipped_scope','payload_duplicate_count','facts_rejected']) k;
SELECT fnd001_t.eq('T30.2 finalize companyfacts without ' || k || ' -> failed', fnd001_t.fin_facts('c30_' || k, 0, 0, k), 'failed')
  FROM unnest(ARRAY['payload_fact_count','facts_skipped_scope','payload_duplicate_count','facts_rejected']) k;
-- Direct UPDATE as owner (bypasses the RPC): the CHECKs alone must refuse "completed" with a NULL counter
SELECT fnd001_t.mkrun('s30d', '9999999901', 'submissions'); SELECT fnd001_t.dl('s30d');
SELECT fnd001_t.expect('T30.3 owner completes submissions with NULL ' || k,
  format('UPDATE public.sec_ingestion_runs SET status = ''completed'', finished_at = now(), %s WHERE run_id = %L',
         (SELECT string_agg(format('%I = %s', c, CASE WHEN c = k THEN 'NULL' ELSE '0' END), ', ')
            FROM unnest(ARRAY['payload_filing_count','filings_skipped_form','filings_inserted','filings_not_inserted','filing_conflicts']) c),
         fnd001_t.id('s30d')), '23514')
  FROM unnest(ARRAY['payload_filing_count','filings_skipped_form','filings_inserted','filings_not_inserted','filing_conflicts']) k;
SELECT fnd001_t.expect('T30.4 owner completes submissions with a companyfacts counter set',
  format('UPDATE public.sec_ingestion_runs SET status = ''completed'', finished_at = now(), payload_filing_count = 0,'
         ' filings_skipped_form = 0, filings_inserted = 0, filings_not_inserted = 0, filing_conflicts = 0,'
         ' payload_fact_count = 0 WHERE run_id = %L', fnd001_t.id('s30d')), '23514');
SELECT fnd001_t.mkrun('c30d', '9999999901', 'companyfacts'); SELECT fnd001_t.dl('c30d');
SELECT fnd001_t.expect('T30.5 owner completes companyfacts with NULL ' || k,
  format('UPDATE public.sec_ingestion_runs SET status = ''completed'', finished_at = now(), %s WHERE run_id = %L',
         (SELECT string_agg(format('%I = %s', c, CASE WHEN c = k THEN 'NULL' ELSE '0' END), ', ')
            FROM unnest(ARRAY['payload_fact_count','facts_skipped_scope','payload_duplicate_count','facts_inserted',
                              'facts_existing','facts_rejected','observations_written','metadata_conflicts','frame_changes']) c),
         fnd001_t.id('c30d')), '23514')
  FROM unnest(ARRAY['payload_fact_count','facts_skipped_scope','payload_duplicate_count','facts_inserted',
                    'facts_existing','facts_rejected','observations_written','metadata_conflicts','frame_changes']) k;
SELECT fnd001_t.expect('T30.6 owner completes companyfacts with a submissions counter set',
  format('UPDATE public.sec_ingestion_runs SET status = ''completed'', finished_at = now(), payload_fact_count = 0,'
         ' facts_skipped_scope = 0, payload_duplicate_count = 0, facts_inserted = 0, facts_existing = 0, facts_rejected = 0,'
         ' observations_written = 0, metadata_conflicts = 0, frame_changes = 0, payload_filing_count = 0 WHERE run_id = %L',
         fnd001_t.id('c30d')), '23514');
SELECT fnd001_t.expect('T30.7 control: owner completes companyfacts with all counters OK',
  format('UPDATE public.sec_ingestion_runs SET status = ''completed'', finished_at = now(), payload_fact_count = 0,'
         ' facts_skipped_scope = 0, payload_duplicate_count = 0, facts_inserted = 0, facts_existing = 0, facts_rejected = 0,'
         ' observations_written = 0, metadata_conflicts = 0, frame_changes = 0 WHERE run_id = %L',
         fnd001_t.id('c30d')), '00000');

-- ------------------------------------------------------------------ T31 derived "existing" counters and sample bounds
SELECT fnd001_t.mkrun('s31', '9999999901', 'submissions');
SELECT fnd001_t.x(fnd001_t.filing_sql('9999999901', acc, 's31', _conflict_ignore => true))
  FROM unnest(ARRAY['0000000001-24-000001','0000000001-24-000002','0000000001-24-000003']) acc;
SELECT fnd001_t.dl('s31');
SELECT fnd001_t.eq('T31.1 reingest 3 existing filings -> completed', fnd001_t.fin_sub('s31', 3), 'completed');
SELECT fnd001_t.eq('T31.2 filings_not_inserted = 3 (DB)', fnd001_t.runcol('s31', 'filings_not_inserted'), '3');
SELECT fnd001_t.eq('T31.3 facts_existing = distinct(observed) - inserted',
  (SELECT (r.facts_existing = (SELECT count(DISTINCT raw_fact_hash) FROM public.sec_raw_fact_observations o WHERE o.run_id = r.run_id)
                              - r.facts_inserted)::text
     FROM public.sec_ingestion_runs r WHERE r.run_id = fnd001_t.id('c24r')), 'true');
SELECT fnd001_t.mkrun('s31b', '9999999901', 'submissions'); SELECT fnd001_t.dl('s31b');
SELECT fnd001_t.eq('T31.4 samples that do not match filing_conflicts -> failed',
  fnd001_t.fin_sub('s31b', 0, 0, '[{"accession_number":"0000000001-24-000001"}]'), 'failed');
SELECT fnd001_t.mkrun('s31c', '9999999901', 'submissions');
SELECT fnd001_t.expect('T31.5 sec_fail_run with 101 conflict samples',
  format('SELECT public.sec_fail_run(%L, ''x'', (SELECT jsonb_agg(jsonb_build_object(''i'', g)) FROM generate_series(1, 101) g))',
         fnd001_t.id('s31c')), '23514', 'service_role');
SELECT fnd001_t.expect('T31.6 owner UPDATE with 101 conflict samples',
  format('UPDATE public.sec_ingestion_runs SET conflict_samples = (SELECT jsonb_agg(jsonb_build_object(''i'', g)) FROM generate_series(1, 101) g) WHERE run_id = %L',
         fnd001_t.id('s31c')), '23514');

-- ------------------------------------------------------------------ T33 repeated filings inside one payload (DB portion)
SELECT fnd001_t.mkrun('s33', '9999999901', 'submissions');
SELECT fnd001_t.x(fnd001_t.filing_sql('9999999901', '0000000001-24-000033', 's33'));
SELECT fnd001_t.x(fnd001_t.filing_sql('9999999901', '0000000001-24-000034', 's33'));
SELECT fnd001_t.x(fnd001_t.filing_sql('9999999901', '0000000001-24-000033', 's33', _conflict_ignore => true));  -- identical repeat
SELECT fnd001_t.dl('s33');
SELECT fnd001_t.eq('T33.1 3 eligible with 1 identical repeat -> completed', fnd001_t.fin_sub('s33', 3), 'completed');
SELECT fnd001_t.eq('T33.2 filings_inserted = 2', fnd001_t.runcol('s33', 'filings_inserted'), '2');
SELECT fnd001_t.eq('T33.3 filings_not_inserted = 1 (repeat, not pre-existing)', fnd001_t.runcol('s33', 'filings_not_inserted'), '1');
SELECT fnd001_t.mkrun('s33b', '9999999901', 'submissions');
SELECT fnd001_t.x(fnd001_t.filing_sql('9999999901', '0000000001-24-000035', 's33b'));
SELECT fnd001_t.dl('s33b');
SELECT fnd001_t.eq('T33.4 repeat with different metadata reported as conflict -> failed',
  fnd001_t.fin_sub('s33b', 2, 1, '[{"accession_number":"0000000001-24-000035","field":"form"}]'), 'failed');
SELECT fnd001_t.eq('T33.5 filing_conflicts = 1', fnd001_t.runcol('s33b', 'filing_conflicts'), '1');

-- ------------------------------------------------------------------ report
SELECT CASE WHEN ok THEN 'ok ' ELSE 'not ok ' END || seq || ' - ' || label || COALESCE(' # ' || detail, '')
  FROM fnd001_t.results ORDER BY seq;
SELECT '# DEFERRED to M1.2 (need sec-ingest): T19; T22; T32; parser/payload parts of T17, T23, T24, T28, T29, T33';
SELECT format('# total=%s passed=%s failed=%s', count(*), count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok))
  FROM fnd001_t.results;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM fnd001_t.results WHERE NOT ok) THEN RAISE EXCEPTION 'FND-001 db_tests: failures present'; END IF;
END $$;
ROLLBACK;

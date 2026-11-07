-- Committed seed for access-check.ts. ONLY for the ephemeral CI Supabase stack (the
-- rows cannot be deleted afterwards: the sec_* tables are append-only by design).
-- Company A (9999999901) published, company B (9999999902) unpublished; each has a
-- completed companyfacts run, a filing, a raw fact, an observation and a normalized
-- fact with lineage. A also has a superseded (non-current) normalized version.
\set ON_ERROR_STOP 1
BEGIN;
INSERT INTO public.sec_companies(cik, entity_name, is_published) VALUES
  ('9999999901', 'Test Company A (published)', true),
  ('9999999902', 'Test Company B (unpublished)', false);
DO $$
DECLARE c text; s uuid; f uuid; n1 uuid; n2 uuid; acc text; h bytea;
BEGIN
  FOREACH c IN ARRAY ARRAY['9999999901','9999999902'] LOOP
    acc := substr(c, 1, 10) || '-24-000001';
    INSERT INTO public.sec_ingestion_runs(cik, resource_kind, endpoint_url, user_agent)
    VALUES (c, 'submissions', 'https://data.sec.gov/submissions/CIK' || c || '.json', 'Navaroli Analysis CI') RETURNING run_id INTO s;
    INSERT INTO public.sec_filings(cik, accession_number, form, filed_date, first_run_id) VALUES (c, acc, '10-K', '2025-02-01', s);
    PERFORM public.sec_record_download(s, 200, 'application/json', 2, sha256('{}'::bytea));
    PERFORM public.sec_finalize_run(s, '{"payload_filing_count":1,"filings_skipped_form":0,"filing_conflicts":0}');
    INSERT INTO public.sec_ingestion_runs(cik, resource_kind, endpoint_url, user_agent)
    VALUES (c, 'companyfacts', 'https://data.sec.gov/api/xbrl/companyfacts/CIK' || c || '.json', 'Navaroli Analysis CI') RETURNING run_id INTO f;
    h := sha256(convert_to('seed-' || c, 'UTF8'));
    INSERT INTO public.sec_raw_facts(fact_hash, cik, accession_number, taxonomy_key, tag, unit, period_type, period_end,
                                     value_kind, value_numeric, first_run_id)
    VALUES (h, c, acc, 'us-gaap', 'Revenues', 'USD', 'instant', '2024-12-31', 'numeric', 1, f);
    INSERT INTO public.sec_raw_fact_observations(cik, raw_fact_hash, run_id, raw_json, raw_json_sha256)
    VALUES (c, h, f, '{"c":"seed"}', sha256('seed'::bytea));
    PERFORM public.sec_record_download(f, 200, 'application/json', 2, sha256('{}'::bytea));
    PERFORM public.sec_finalize_run(f, '{"payload_fact_count":1,"facts_skipped_scope":0,"payload_duplicate_count":0,"facts_rejected":0}');
    n1 := gen_random_uuid();
    INSERT INTO public.sec_normalized_facts(normalized_fact_id, cik, canonical_concept, unit, period_type, period_end, logical_key,
                                            accession_number, value_numeric, normalizer_version, rule_version, source_run_id)
    VALUES (n1, c, 'Revenues', 'USD', 'instant', '2024-12-31', 'x', acc, 1, 'v1', 'r1', f);
    INSERT INTO public.sec_normalized_fact_sources(cik, normalized_fact_id, raw_fact_hash) VALUES (c, n1, h);
    IF c = '9999999901' THEN
      n2 := gen_random_uuid();
      UPDATE public.sec_normalized_facts SET is_current = false, superseded_by = n2 WHERE normalized_fact_id = n1;
      INSERT INTO public.sec_normalized_facts(normalized_fact_id, cik, canonical_concept, unit, period_type, period_end, logical_key,
                                              accession_number, value_numeric, normalizer_version, rule_version, source_run_id)
      VALUES (n2, c, 'Revenues', 'USD', 'instant', '2024-12-31', 'x', acc, 2, 'v2', 'r1', f);
      INSERT INTO public.sec_normalized_fact_sources(cik, normalized_fact_id, raw_fact_hash) VALUES (c, n2, h);
    END IF;
  END LOOP;
END $$;
COMMIT;

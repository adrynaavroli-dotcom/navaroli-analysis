#!/usr/bin/env bash
# Run the FND-001 database suite (sql/db_tests.sql) against a disposable database.
# Refuses non-loopback targets (lib/guard.sh) and verifies afterwards that the suite
# left no sec_* rows behind (it runs in a transaction that is rolled back).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
source "$ROOT/validation/fnd001/lib/guard.sh"
fnd001_require_local_db

count_sec_rows() {
  fnd001_psql -At -c "SELECT (SELECT count(*) FROM public.sec_companies) + (SELECT count(*) FROM public.sec_ticker_mappings)
    + (SELECT count(*) FROM public.sec_ingestion_runs) + (SELECT count(*) FROM public.sec_filings)
    + (SELECT count(*) FROM public.sec_raw_facts) + (SELECT count(*) FROM public.sec_raw_fact_observations)
    + (SELECT count(*) FROM public.sec_normalized_facts) + (SELECT count(*) FROM public.sec_normalized_fact_sources)"
}

before=$(count_sec_rows)
if [ "$before" != "0" ]; then echo "REFUSED: target already holds $before sec_* rows; use an empty database" >&2; exit 2; fi

status=0
fnd001_psql -f "$ROOT/validation/fnd001/sql/db_tests.sql" || status=$?

after=$(count_sec_rows)
if [ "$after" != "0" ]; then echo "not ok - rollback check: $after sec_* rows left behind" >&2; exit 1; fi
echo "ok - rollback check: 0 sec_* rows left behind"
exit "$status"

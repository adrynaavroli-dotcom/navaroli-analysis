#!/usr/bin/env bash
# D-e — what the pg_net platform grants let a PLATFORM role do, exercised on the DISPOSABLE
# CI stack only (lib/guard.sh refuses anything that is not loopback). Production is never
# touched: there the same privileges are only shown by the catalog (evidence §P8, §P13,
# §P14) because exercising them would be DML on the live database.
# Every HTTP request targets 127.0.0.1:9 (discard port inside the database container), so
# nothing leaves the runner. Output lines: "demo|<capability>|DEMONSTRATED|..." or
# "demo|<capability>|NOT DEMONSTRATED|<reason>". Exit 0 unless the guard refuses the target:
# this step documents a residual risk, it is not a pass/fail gate.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
source "$ROOT/validation/fnd001/lib/guard.sh"
fnd001_require_local_db
set +e
q() { fnd001_psql -At -c "$1" 2>&1; }
as_sandbox() { fnd001_psql -At -c "SET ROLE sandbox_exec; $1" 2>&1; }
line() { echo "demo|$1|$2|$3"; }

if [ "$(q "SELECT to_regnamespace('net') IS NOT NULL")" != "t" ]; then
  out=$(q "CREATE EXTENSION IF NOT EXISTS pg_net")
  [ "$(q "SELECT to_regnamespace('net') IS NOT NULL")" = "t" ] || { line extension "NOT DEMONSTRATED" "pg_net unavailable: $out"; exit 0; }
fi
echo "env|pg_net|$(q "SELECT extversion FROM pg_extension WHERE extname = 'pg_net'")|worker=$(q "SELECT count(*) FROM pg_stat_activity WHERE backend_type ILIKE '%pg_net%' OR application_name ILIKE '%pg_net%'")"
mock=$(q "SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'net'")
echo "env|net owner|$mock"
for r in sandbox_exec anon authenticated service_role; do
  echo "priv|$r|$(q "SELECT 'usage=' || has_schema_privilege('$r', 'net', 'USAGE') || ' queue=' ||
    (SELECT string_agg(p, ',') FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER']) p WHERE has_table_privilege('$r', 'net.http_request_queue', p)) ||
    ' seq=' || has_sequence_privilege('$r', 'net.http_request_queue_id_seq', 'USAGE')")"
done
# Production grants PUBLIC ALL on both tables and the sequence (§P14). If this stack grants
# less, mirror production so the demonstration exercises the same privileges.
if [ "$(q "SELECT has_table_privilege('sandbox_exec', 'net.http_request_queue', 'INSERT, UPDATE, DELETE, SELECT') AND has_schema_privilege('sandbox_exec', 'net', 'USAGE')")" != "t" ]; then
  out=$(q "GRANT USAGE ON SCHEMA net TO PUBLIC; GRANT ALL ON net.http_request_queue, net._http_response TO PUBLIC; GRANT ALL ON SEQUENCE net.http_request_queue_id_seq TO PUBLIC")
  echo "env|mirror production grants (PUBLIC ALL on queue/response/sequence)|$([ -z "$out" ] && echo applied || echo "failed: $out")"
fi

# 1. direct INSERT into the queue (no pg_net function involved)
id1=$(as_sandbox "INSERT INTO net.http_request_queue (method, url, headers, body, timeout_milliseconds) VALUES ('GET', 'http://127.0.0.1:9/d5-direct-insert', '{\"x-probe\":\"d5\"}', NULL, 1000) RETURNING id" | tail -n 1)
if [[ "$id1" =~ ^[0-9]+$ ]]; then line queue-insert DEMONSTRATED "sandbox_exec inserted request id=$id1 directly into net.http_request_queue"
else line queue-insert "NOT DEMONSTRATED" "$id1"; fi
# 2. through the public API of the extension
id2=$(as_sandbox "SELECT net.http_post('http://127.0.0.1:9/d5-http-post', '{\"k\":1}'::jsonb)" | tail -n 1)
if [[ "$id2" =~ ^[0-9]+$ ]]; then line http_post DEMONSTRATED "sandbox_exec queued request id=$id2 via net.http_post"
else line http_post "NOT DEMONSTRATED" "$id2"; fi
# 3. the background worker sends what a platform role queued (response row appears)
for id in $id1 $id2; do
  [[ "$id" =~ ^[0-9]+$ ]] || continue
  got=""
  for _ in $(seq 1 30); do got=$(q "SELECT coalesce(error_msg, 'status=' || status_code) FROM net._http_response WHERE id = $id"); [ -n "$got" ] && break; sleep 1; done
  if [ -n "$got" ]; then line worker-sends DEMONSTRATED "request $id was executed by the pg_net worker: $got"
  else line worker-sends "NOT DEMONSTRATED" "no response row for request $id within 30 s (worker not running on this stack?)"; fi
done
# 4. read / alter / delete OTHER sessions' requests and responses
q "SELECT net.http_get('http://127.0.0.1:9/d5-owned-by-migrator', headers => '{\"x-cron-secret\":\"demo-not-a-secret\"}'::jsonb)" > /tmp/pgnet-migrator-id.txt
mid=$(tail -n 1 /tmp/pgnet-migrator-id.txt)
seen=$(as_sandbox "SELECT count(*) FROM net.http_request_queue WHERE id = $mid AND headers ? 'x-cron-secret'")
line read-pending-headers "$([ "$seen" = "1" ] && echo DEMONSTRATED || echo 'NOT DEMONSTRATED')" "sandbox_exec sees the headers of a request queued by postgres while pending: count=$seen (timing-dependent: the worker may already have consumed it)"
for _ in $(seq 1 30); do r=$(q "SELECT count(*) FROM net._http_response WHERE id = $mid"); [ "$r" = "1" ] && break; sleep 1; done
rr=$(as_sandbox "SELECT count(*) FROM net._http_response WHERE id = $mid")
line read-responses "$([ "$rr" = "1" ] && echo DEMONSTRATED || echo 'NOT DEMONSTRATED')" "sandbox_exec reads the response of a request issued by postgres: count=$rr"
upd=$(fnd001_psql -At <<SQL 2>&1 | tail -n 1
BEGIN;
INSERT INTO net.http_request_queue (method, url, headers, timeout_milliseconds) VALUES ('GET', 'http://127.0.0.1:9/d5-before', '{}', 1000);
SET LOCAL ROLE sandbox_exec;
WITH u AS (UPDATE net.http_request_queue SET url = 'http://127.0.0.1:9/d5-rewritten-by-sandbox' WHERE url = 'http://127.0.0.1:9/d5-before' RETURNING 1) SELECT count(*) FROM u;
ROLLBACK;
SQL
)
line rewrite-pending "$([ "$upd" = "1" ] && echo DEMONSTRATED || echo 'NOT DEMONSTRATED')" "sandbox_exec rewrote the URL of a pending request queued by postgres (same transaction, rolled back): rows=$upd"
del=$(as_sandbox "WITH d AS (DELETE FROM net._http_response WHERE id = $mid RETURNING 1) SELECT count(*) FROM d")
line delete-responses "$([ "$del" = "1" ] && echo DEMONSTRATED || echo 'NOT DEMONSTRATED')" "sandbox_exec deleted the response of a request issued by postgres: rows=$del"
tr=$(fnd001_psql -At <<SQL 2>&1 | tail -n 1
BEGIN; SET LOCAL ROLE sandbox_exec; TRUNCATE net.http_request_queue; SELECT 'truncated'; ROLLBACK;
SQL
)
line truncate-queue "$([ "$tr" = "truncated" ] && echo DEMONSTRATED || echo 'NOT DEMONSTRATED')" "sandbox_exec can TRUNCATE the whole queue (rolled back): $tr"
# 5. can it hang code on the queue? (needs TRIGGER on the table AND a trigger function it can create)
cr=$(as_sandbox "SELECT count(*) FROM pg_namespace WHERE has_schema_privilege('sandbox_exec', oid, 'CREATE') AND nspname NOT LIKE 'pg\\_temp\\_%' AND nspname NOT LIKE 'pg\\_toast\\_temp\\_%'")
line create-function-schema "$([ "$cr" = "0" ] && echo 'NOT DEMONSTRATED' || echo DEMONSTRATED)" "schemas where sandbox_exec may CREATE (temp excluded): $cr"
exit 0

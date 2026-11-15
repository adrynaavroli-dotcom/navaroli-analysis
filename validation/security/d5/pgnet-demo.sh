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

# Use the REAL pg_net extension when the stack ships it: the simulation installed the
# stand-in schema of validation/security/sql/d5-platform-mock.sql, which has no worker.
# The swap is one transaction, so a failing CREATE EXTENSION keeps the mock as it was.
prov() { q "SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN 'extension'
                        WHEN to_regnamespace('net') IS NOT NULL THEN 'mock' ELSE 'none' END"; }
if [ "$(prov)" != extension ] && [ "$(q "SELECT count(*) FROM pg_available_extensions WHERE name = 'pg_net'")" = "1" ]; then
  out=$(fnd001_psql -At -c "BEGIN; DROP SCHEMA IF EXISTS net CASCADE; CREATE EXTENSION pg_net; COMMIT;" 2>&1)
  echo "env|switch to the real pg_net extension|$([ "$(prov)" = extension ] && echo done || echo "failed, mock kept: $out")"
fi
prov=$(prov)
if [ "$prov" = none ]; then
  out=$(q "CREATE EXTENSION IF NOT EXISTS pg_net")
  prov=$(prov)
  [ "$prov" != none ] || { line extension "NOT DEMONSTRATED" "pg_net unavailable: $out"; exit 0; }
fi
echo "env|net provenance|$prov$([ "$prov" = mock ] && echo ' (validation/security/sql/d5-platform-mock.sql: no worker; results show PostgreSQL privilege semantics only)')"
echo "env|pg_net|$(q "SELECT extversion FROM pg_extension WHERE extname = 'pg_net'")|worker backends=$(q "SELECT count(*) FROM pg_stat_activity WHERE backend_type ILIKE '%pg_net%' OR application_name ILIKE '%pg_net%'")"
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
# 5. TRIGGER on the pg_net tables. PostgreSQL (CREATE TRIGGER): "To create or replace a
#    trigger on a table, the user must have the TRIGGER privilege on the table. The user
#    must also have EXECUTE privilege on the trigger function." No CREATE on any schema is
#    needed, so EXISTING trigger functions are enough. A trigger fires in the session that
#    writes the row — for net._http_response that is the pg_net worker (production: as
#    postgres, evidence §P13), for the queue every caller of net.http_*.
cr=$(as_sandbox "SELECT count(*) FROM pg_namespace WHERE has_schema_privilege('sandbox_exec', oid, 'CREATE') AND nspname NOT LIKE 'pg\\_temp\\_%' AND nspname NOT LIKE 'pg\\_toast\\_temp\\_%'")
line create-function-schema "$([ "$cr" = "0" ] && echo 'NOT DEMONSTRATED' || echo DEMONSTRATED)" "schemas where sandbox_exec may CREATE (temp excluded): $cr — NOT required to attach a trigger, see below"
roles=$(q "SELECT string_agg(rolname, ' ' ORDER BY rolname) FROM pg_roles WHERE rolname ~ '^sandbox_exec(_[a-z0-9]+)?\$'")
for r in $roles; do
  lbl=$([ "$r" = sandbox_exec ] && echo sandbox_exec || echo 'sandbox_exec_<ref>')
  for t in net.http_request_queue net._http_response; do
    echo "trigger-priv|$lbl|$t|TRIGGER=$(q "SELECT has_table_privilege('$r', '$t', 'TRIGGER')")"
  done
  echo "trigger-fns|$lbl|executable=$(q "SELECT count(*) FROM pg_proc WHERE prorettype = 'trigger'::regtype AND pronargs = 0 AND has_function_privilege('$r', oid, 'EXECUTE')")|total=$(q "SELECT count(*) FROM pg_proc WHERE prorettype = 'trigger'::regtype AND pronargs = 0")"
done
ref=$(q "SELECT rolname FROM pg_roles WHERE rolname ~ '^sandbox_exec_[a-z0-9]+\$' ORDER BY 1 LIMIT 1")
q "SELECT 'trigger-fn|' || n.nspname || '|' || p.oid::regprocedure::text || '|secdef=' || p.prosecdef || '|owner=' || pg_get_userbyid(p.proowner)
          || '|sandbox_exec=' || has_function_privilege('sandbox_exec', p.oid, 'EXECUTE')
          || '|sandbox_exec_<ref>=' || COALESCE(has_function_privilege(NULLIF('$ref', ''), p.oid, 'EXECUTE')::text, 'n/a')
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.prorettype = 'trigger'::regtype AND p.pronargs = 0 ORDER BY 1"

# 5a. attach EXISTING pg_catalog trigger functions as sandbox_exec, then write the rows the
#     way the worker (response) and every caller (queue) do. One transaction, rolled back.
#     tsvector_update_trigger raises on a non-tsvector column, i.e. a blocking trigger.
att=$(fnd001_psql -At 2>&1 <<SQL
\set ON_ERROR_STOP off
BEGIN;
SET LOCAL ROLE sandbox_exec;
CREATE TRIGGER zz_d5_attach_resp BEFORE INSERT ON net._http_response FOR EACH ROW EXECUTE FUNCTION pg_catalog.tsvector_update_trigger('content', 'pg_catalog.simple', 'content');
CREATE TRIGGER zz_d5_attach_queue BEFORE INSERT ON net.http_request_queue FOR EACH ROW EXECUTE FUNCTION pg_catalog.tsvector_update_trigger('url', 'pg_catalog.simple', 'url');
SELECT 'attached=' || count(*) FROM pg_trigger WHERE tgname LIKE 'zz\_d5\_attach\_%';
RESET ROLE;
SAVEPOINT s1;
INSERT INTO net._http_response (id, status_code, content) VALUES (-1, 200, 'x');
SELECT 'response-insert=allowed';
ROLLBACK TO s1;
SAVEPOINT s2;
SELECT 'http_get=' || net.http_get('http://127.0.0.1:9/d5-after-attach');
ROLLBACK TO s2;
SAVEPOINT s3;
SET LOCAL ROLE sandbox_exec;
DROP TRIGGER zz_d5_attach_resp ON net._http_response;
SELECT 'drop-by-sandbox=allowed';
ROLLBACK TO s3;
SAVEPOINT s4;
SET LOCAL ROLE sandbox_exec;
ALTER TABLE net._http_response DISABLE TRIGGER zz_d5_attach_resp;
SELECT 'disable-by-sandbox=allowed';
ROLLBACK TO s4;
ROLLBACK;
SQL
)
echo "$att" | sed 's/^/attach-raw|/'
if echo "$att" | grep -q '^attached=2$'; then
  line trigger-attach DEMONSTRATED "sandbox_exec attached pg_catalog.tsvector_update_trigger to net._http_response and net.http_request_queue without CREATE on any schema (rolled back)"
else line trigger-attach "NOT DEMONSTRATED" "$(echo "$att" | grep -m1 -i error)"; fi
if echo "$att" | grep -q 'not of tsvector type' && ! echo "$att" | grep -q '^response-insert=allowed$'; then
  line trigger-blocks-response-write DEMONSTRATED "with that trigger an INSERT into net._http_response (what the worker does after each request) fails: $(echo "$att" | grep -m1 'tsvector type')"
else line trigger-blocks-response-write "NOT DEMONSTRATED" "$(echo "$att" | grep -m1 -E 'response-insert|ERROR')"; fi
if ! echo "$att" | grep -q '^http_get=' && echo "$att" | grep -q 'column "url" is not of tsvector type'; then
  line trigger-blocks-enqueue DEMONSTRATED "with that trigger net.http_get fails for every caller (scheduled server-function calls included): $(echo "$att" | grep -m1 'column "url" is not of tsvector type')"
else line trigger-blocks-enqueue "NOT DEMONSTRATED" "$(echo "$att" | grep -m1 '^http_get=')"; fi
if echo "$att" | grep -q '^drop-by-sandbox=allowed$' || echo "$att" | grep -q '^disable-by-sandbox=allowed$'; then
  line trigger-persistence "NOT DEMONSTRATED" "sandbox_exec could also drop/disable the trigger"
else
  line trigger-persistence DEMONSTRATED "sandbox_exec cannot DROP or DISABLE the trigger it attached (must be owner of the table: $(q "SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'net._http_response'::regclass")); removal needs the table owner"
fi

# 5b. the REAL worker with a committed trigger — only where pg_net is the real extension
#     AND this session can remove the trigger afterwards (owner of the table, or a member of
#     the owner); otherwise the stack would keep a trigger that the next guard step reports.
can_clean=$(q "SELECT pg_has_role(current_user, relowner, 'USAGE') FROM pg_class WHERE oid = 'net._http_response'::regclass")
if [ "$prov" != extension ]; then
  line worker-behaviour "NOT RUN" "schema net is the mock (no pg_net worker on this stack); worker effect shown only on the write the worker performs (5a)"
elif [ "$can_clean" != "t" ]; then
  line worker-behaviour "NOT RUN" "this session ($(q "SELECT current_user")) is not the owner of net._http_response and could not remove a committed trigger"
else
  as_sandbox "CREATE TRIGGER zz_d5_worker BEFORE INSERT ON net._http_response FOR EACH ROW EXECUTE FUNCTION pg_catalog.tsvector_update_trigger('content', 'pg_catalog.simple', 'content')" > /dev/null
  wid=$(q "SELECT net.http_get('http://127.0.0.1:9/d5-worker-with-trigger')" | tail -n 1)
  got=""; for _ in $(seq 1 30); do got=$(q "SELECT count(*) FROM net._http_response WHERE id = $wid"); [ "$got" = "1" ] && break; sleep 1; done
  pending=$(q "SELECT count(*) FROM net.http_request_queue WHERE id = $wid")
  q "DROP TRIGGER IF EXISTS zz_d5_worker ON net._http_response" > /dev/null
  cid=$(q "SELECT net.http_get('http://127.0.0.1:9/d5-worker-control')" | tail -n 1)
  ctl=""; for _ in $(seq 1 30); do ctl=$(q "SELECT count(*) FROM net._http_response WHERE id = $cid"); [ "$ctl" = "1" ] && break; sleep 1; done
  left=$(q "SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE c.relnamespace = 'net'::regnamespace AND NOT t.tgisinternal")
  if [ "$got" != "1" ] && [ "$ctl" = "1" ]; then
    line worker-behaviour DEMONSTRATED "with the trigger the worker stored no response for request $wid (still queued: $pending); after removal the control request $cid got its response"
  else
    line worker-behaviour "NOT DEMONSTRATED" "response with trigger=$got, still queued=$pending, control response=$ctl"
  fi
  echo "env|user triggers left on net tables after cleanup|$left"
fi
exit 0

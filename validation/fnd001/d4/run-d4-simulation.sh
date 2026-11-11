#!/usr/bin/env bash
# FND-001 / D4 — simulation of the PROPOSED lockdown on a DISPOSABLE database.
# Never touches production: every psql call goes through lib/guard.sh (loopback only).
# Expects an EMPTY database whose cluster already has the Supabase roles (CI stack, or
# bare PostgreSQL after sql/local-shim.sql). Steps:
#   1. simulate the production platform roles (sql/ci-platform-roles-mock.sql);
#   2. rebuild the chain (apply-chain.sh) -> fingerprint F0 + guard (expected: FAIL,
#      reproduces the D3 finding);
#   3. apply d4-migration.sql -> fingerprint F1 + guard (expected: PASS);
#   4. behaviour checks, T1–T33 database suite, M1.2-style new object with and without
#      the lockdown call (guard must fail without it).
# Output directory: $1 (default /tmp/fnd001-d4).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
source "$ROOT/validation/fnd001/lib/guard.sh"
fnd001_require_local_db
OUT="${1:-/tmp/fnd001-d4}"; mkdir -p "$OUT"
SQL="$ROOT/validation/fnd001/sql"
guard() { fnd001_psql -At -f "$SQL/sec-platform-acl-guard.sql" | sed '/^$/d'; }
violations() { grep -c '^violation|' "$1" || true; }

echo "== 1. platform roles mock";             fnd001_psql -f "$SQL/ci-platform-roles-mock.sql"
echo "== 2. chain";                           bash "$ROOT/validation/fnd001/apply-chain.sh" > "$OUT/apply-chain.txt"
bash "$ROOT/validation/fnd001/catalog-fingerprint.sh" > "$OUT/F0-fingerprint.txt"
guard > "$OUT/guard-before.txt"
echo "   guard before D4: $(violations "$OUT/guard-before.txt") violation(s) (expected > 0)"
[ "$(violations "$OUT/guard-before.txt")" -gt 0 ] || { echo "not ok - guard did not detect the pre-D4 grants"; exit 1; }

echo "== 3. D4 migration (proposal)";         fnd001_psql -1 -f "$ROOT/validation/fnd001/d4/d4-migration.sql" > "$OUT/d4-apply.txt"
bash "$ROOT/validation/fnd001/catalog-fingerprint.sh" > "$OUT/F1-fingerprint.txt"
guard > "$OUT/guard-after.txt"
echo "   guard after D4: $(violations "$OUT/guard-after.txt") violation(s) (expected 0)"
[ "$(violations "$OUT/guard-after.txt")" -eq 0 ] || { cat "$OUT/guard-after.txt"; exit 1; }
diff "$OUT/F0-fingerprint.txt" "$OUT/F1-fingerprint.txt" > "$OUT/fingerprint-F0-F1.diff" || true
echo "   fingerprint F0 -> F1: $(grep -c '^[<>]' "$OUT/fingerprint-F0-F1.diff" || true) changed line(s), all must mention sec_lockdown_platform_privileges"
if grep '^[<>]' "$OUT/fingerprint-F0-F1.diff" | grep -v 'sec_lockdown_platform_privileges' | grep -q .; then
  echo "not ok - D4 changed catalog lines other than its own helper"; exit 1; fi

echo "== 4a. behaviour";                      fnd001_psql -f "$SQL/d4-behaviour-checks.sql" | sed '/^$/d' | tee "$OUT/behaviour.txt" | tail -1
echo "== 4b. T1–T33 database suite after D4"; bash "$ROOT/validation/fnd001/run-db-tests.sh" > "$OUT/db-tests-after-d4.txt" 2>&1
grep -E '^# |rollback' "$OUT/db-tests-after-d4.txt" | tail -3

echo "== 4c. M1.2-style migration WITHOUT the lockdown call (guard must fail)"
fnd001_psql -At > "$OUT/m12-without.txt" <<'SQL'
BEGIN;
CREATE TABLE public.sec_d4_probe (id int PRIMARY KEY);
CREATE FUNCTION public.sec_d4_probe_fn() RETURNS int LANGUAGE sql AS 'SELECT 1';
\i validation/fnd001/sql/sec-platform-acl-guard.sql
ROLLBACK;
SQL
echo "   violations without call: $(violations "$OUT/m12-without.txt")"
[ "$(violations "$OUT/m12-without.txt")" -gt 0 ] || { echo "not ok - guard missed a SEC object without lockdown"; exit 1; }
echo "== 4d. same migration WITH the lockdown call (guard must pass)"
fnd001_psql -At > "$OUT/m12-with.txt" <<'SQL'
BEGIN;
CREATE TABLE public.sec_d4_probe (id int PRIMARY KEY);
CREATE FUNCTION public.sec_d4_probe_fn() RETURNS int LANGUAGE sql AS 'SELECT 1';
SELECT 'revoked=' || public.sec_lockdown_platform_privileges();
\i validation/fnd001/sql/sec-platform-acl-guard.sql
ROLLBACK;
SQL
echo "   violations with call: $(violations "$OUT/m12-with.txt")"
[ "$(violations "$OUT/m12-with.txt")" -eq 0 ] || { cat "$OUT/m12-with.txt"; exit 1; }
echo "== D4 simulation: all steps passed"

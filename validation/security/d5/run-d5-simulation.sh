#!/usr/bin/env bash
# D5 (admin-only model) — simulation of the PROPOSED permission migration on a
# DISPOSABLE database. Never touches production: every psql call goes through
# validation/fnd001/lib/guard.sh (loopback only, ambient PG* variables dropped).
# Expects an EMPTY database whose cluster has the Supabase API roles (CI stack, or bare
# PostgreSQL after validation/fnd001/sql/local-shim.sql). Steps:
#   1. platform mocks (sandbox_exec roles + default ACLs, storage grants) — as production;
#   2. chain rebuild -> fingerprint F0; guard and behaviour tests MUST FAIL (they detect
#      today's open paths, so they are able to fail);
#   3. D5 proposal in one transaction -> fingerprint F1; guard 0 violations; behaviour
#      tests all pass; FND-001 T1–T33 suite still passes;
#   4. regression probes: a new object without review, an owner-based write policy, a
#      has_role() policy and an unreviewed SECURITY DEFINER function must each fail the guard;
#   5. idempotence: a second baseline call changes nothing;
#   6. coverage: the number of behaviour cases, FND-001 cases and probes is asserted
#      exactly, so a silently shrunk suite cannot report PASS; the service_role column
#      inventory of the helper must equal the guard's allowlist.
# Output directory: $1 (default /tmp/d5-sim).
# Expected counts: change them only together with the cases they count, in the same commit.
EXPECTED_ADMIN_ONLY_CASES=237
EXPECTED_FND001_CASES=186
EXPECTED_PROBES=17
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
source "$ROOT/validation/fnd001/lib/guard.sh"
fnd001_require_local_db
OUT="${1:-/tmp/d5-sim}"; mkdir -p "$OUT"
SEC="$ROOT/validation/security/sql"
guard() { fnd001_psql -At -f "$SEC/admin-only-acl-guard.sql" | sed '/^$/d'; }
violations() { grep -c '^violation|' "$1" || true; }
tests() { fnd001_psql -At -f "$SEC/admin-only-tests.sql" 2>&1 | sed '/^$/d'; }
fail() { echo "not ok - $1"; exit 1; }

echo "== 1. platform mocks"
fnd001_psql -f "$ROOT/validation/fnd001/sql/ci-platform-roles-mock.sql"
fnd001_psql -f "$SEC/d5-platform-mock.sql"
echo "== 2. chain (current schema = production)"
bash "$ROOT/validation/fnd001/apply-chain.sh" > "$OUT/apply-chain.txt"
bash "$ROOT/validation/fnd001/catalog-fingerprint.sh" > "$OUT/F0-fingerprint.txt"
guard > "$OUT/guard-before.txt"
echo "   guard before D5: $(violations "$OUT/guard-before.txt") violation(s) (expected > 0)"
[ "$(violations "$OUT/guard-before.txt")" -gt 0 ] || fail "guard did not detect today's open paths"
tests > "$OUT/tests-before.txt" || true
echo "   behaviour tests before D5: $(grep -c '^not ok' "$OUT/tests-before.txt" || true) failing case(s) (expected > 0)"
grep -q '^ADMIN-ONLY-FAIL' "$OUT/tests-before.txt" || fail "behaviour tests passed on the unprotected schema"

echo "== 3. D5 proposal (single transaction)"
fnd001_psql -1 -f "$ROOT/validation/security/d5/d5-admin-only-migration.sql" > "$OUT/d5-apply.txt"
bash "$ROOT/validation/fnd001/catalog-fingerprint.sh" > "$OUT/F1-fingerprint.txt"
diff "$OUT/F0-fingerprint.txt" "$OUT/F1-fingerprint.txt" > "$OUT/fingerprint-F0-F1.diff" || true
echo "   fingerprint F0 -> F1: $(grep -c '^<' "$OUT/fingerprint-F0-F1.diff" || true) line(s) removed, $(grep -c '^>' "$OUT/fingerprint-F0-F1.diff" || true) added"
if grep '^[<>]' "$OUT/fingerprint-F0-F1.diff" | grep -E '\|sec_' | grep -vE 'sandbox|is_admin|enforce_privilege_baseline' | grep -E '^[<>] (acl|pol|col|con|trg|fn)\|' | grep -q .; then
  grep '^[<>]' "$OUT/fingerprint-F0-F1.diff" | grep -E '\|sec_' > "$OUT/sec-changes.txt"
  fail "D5 changed sec_* catalog lines (see $OUT/sec-changes.txt); M1.1 canonical ACLs must stay"
fi
guard > "$OUT/guard-after.txt"
echo "   guard after D5: $(violations "$OUT/guard-after.txt") violation(s) (expected 0); $(grep -c '^risk|' "$OUT/guard-after.txt" || true) open D-e risk line(s) (pg_net, reported, not accepted)"
[ "$(violations "$OUT/guard-after.txt")" -eq 0 ] || { grep '^violation' "$OUT/guard-after.txt"; fail "guard after D5"; }
tests > "$OUT/tests-after.txt" || true
grep '^# admin-only' "$OUT/tests-after.txt"
grep -q '^ADMIN-ONLY-PASS' "$OUT/tests-after.txt" || { grep '^not ok' "$OUT/tests-after.txt"; fail "behaviour tests after D5"; }
# Coverage: PASS alone is not enough — the exact number of cases must have run and passed.
summary=$(grep -E '^# admin-only tests: [0-9]+/[0-9]+ passed$' "$OUT/tests-after.txt" || true)
[ "$summary" = "# admin-only tests: $EXPECTED_ADMIN_ONLY_CASES/$EXPECTED_ADMIN_ONLY_CASES passed" ] \
  || fail "behaviour case count: got '${summary:-no summary}', expected $EXPECTED_ADMIN_ONLY_CASES/$EXPECTED_ADMIN_ONLY_CASES"
[ "$(grep -c '^ok [0-9]* - ' "$OUT/tests-after.txt")" -eq "$EXPECTED_ADMIN_ONLY_CASES" ] || fail "behaviour 'ok' line count differs from $EXPECTED_ADMIN_ONLY_CASES"
echo "   ok - behaviour cases: exactly $EXPECTED_ADMIN_ONLY_CASES ran and passed"
bash "$ROOT/validation/fnd001/run-db-tests.sh" > "$OUT/fnd001-db-tests-after-d5.txt" 2>&1 || { tail -20 "$OUT/fnd001-db-tests-after-d5.txt"; fail "FND-001 suite after D5"; }
grep -E '^# |rollback' "$OUT/fnd001-db-tests-after-d5.txt" | tail -2
grep -qx "# total=$EXPECTED_FND001_CASES passed=$EXPECTED_FND001_CASES failed=0" "$OUT/fnd001-db-tests-after-d5.txt" \
  || fail "FND-001 case count differs from $EXPECTED_FND001_CASES"
echo "   ok - FND-001 T1–T33: exactly $EXPECTED_FND001_CASES ran and passed"

echo "== 4. regression probes (each must produce violations; all rolled back)"
probes_run=0
probe() { # $1 name, $2 SQL, $3 rule that must appear, $4 optional fixed string the line must contain
  fnd001_psql -At > "$OUT/probe-$1.txt" 2>&1 <<SQL
BEGIN;
$2
\i validation/security/sql/admin-only-acl-guard.sql
ROLLBACK;
SQL
  grep "^violation|$3|" "$OUT/probe-$1.txt" | grep -qF -- "${4:-|}" \
    || { cat "$OUT/probe-$1.txt"; fail "probe $1 not caught by $3${4:+ on '$4'}"; }
  probes_run=$((probes_run + 1))
  echo "   ok - probe $1 caught ($3: $(grep -c "^violation|$3|" "$OUT/probe-$1.txt"))${4:+ on '$4'}"
}
probe new-table-defaults "CREATE TABLE public.zz_probe (id int PRIMARY KEY);" G3
probe new-table-baseline "CREATE TABLE public.zz_probe (id int PRIMARY KEY); ALTER TABLE public.zz_probe ENABLE ROW LEVEL SECURITY; SELECT public.enforce_privilege_baseline();" G1
probe owner-write-policy "CREATE POLICY zz_owner ON public.theses FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);" G6
probe has-role-policy "CREATE POLICY zz_hr ON public.page_content FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));" G6
probe secdef-function "CREATE FUNCTION public.zz_grant_admin() RETURNS void LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'; SELECT public.enforce_privilege_baseline();" G5
probe execute-grant "GRANT EXECUTE ON FUNCTION public.sec_finalize_run(uuid, jsonb, jsonb) TO authenticated;" G4
probe sandbox-insert "GRANT INSERT ON public.user_roles TO sandbox_exec;" G3
probe storage-insert "GRANT INSERT ON storage.objects TO sandbox_exec;" G8
probe membership "GRANT service_role TO anon;" G7
# Signature, not name: an overload of an allowed helper is an unreviewed routine. The
# second probe is the worst case (SECURITY DEFINER, pinned search_path, PUBLIC revoked,
# EXECUTE to anon only) that a name-based inventory accepted with 0 violations.
probe overload-invoker "CREATE FUNCTION public.is_admin(_uid uuid) RETURNS boolean LANGUAGE sql STABLE AS 'SELECT true';" G1 "routine is_admin(uuid)"
probe overload-secdef "CREATE FUNCTION public.is_admin(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS 'SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid)'; REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, service_role, sandbox_exec_ci0mockref; GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon, authenticated;" G5 "routine is_admin(uuid)"
probe overload-execute "CREATE FUNCTION public.is_admin(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS 'SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid)'; REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, service_role, sandbox_exec_ci0mockref; GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon, authenticated;" G4 "routine is_admin(uuid)|anon|EXECUTE"
# Column-level grants (one column, not the table) must be seen by the guard.
probe column-anon "GRANT UPDATE (full_name) ON public.profiles TO anon;" G3 "relation profiles.full_name|anon|UPDATE"
probe column-authenticated "GRANT INSERT (message) ON public.thesis_alerts TO authenticated;" G3 "relation thesis_alerts.message|authenticated|INSERT"
probe column-service "GRANT UPDATE (content) ON public.page_content TO service_role;" G3 "relation page_content.content|service_role|UPDATE"
probe column-storage "GRANT UPDATE (name) ON storage.buckets TO sandbox_exec;" G8 "relation storage.buckets.name|sandbox_exec|UPDATE"
# pg_net must never become reachable from public (D-e).
probe net-routine "CREATE FUNCTION public.zz_fetch(u text) RETURNS void LANGUAGE plpgsql AS \$f\$ BEGIN PERFORM net.http_get(u); END \$f\$;" G9 "routine zz_fetch(text)"
[ "$probes_run" -eq "$EXPECTED_PROBES" ] || fail "probe count: $probes_run run, $EXPECTED_PROBES expected"
echo "   ok - exactly $EXPECTED_PROBES probes ran and were caught"
# After the baseline call a new table may only report what needs an explicit review: the
# inventory (G1) and the authenticated/service_role writes inherited from the default ACL
# (G3), which each migration must keep or revoke on purpose. Nothing for anon, PUBLIC or
# sandbox_exec* may remain.
if grep '^violation|' "$OUT/probe-new-table-baseline.txt" \
   | grep -vE '^violation\|(G1\||G3\|relation zz_probe\|(authenticated|service_role)\|)' | grep -q .; then
  grep '^violation|' "$OUT/probe-new-table-baseline.txt"; fail "baseline call left anon/PUBLIC/platform paths on a new table"; fi
echo "   ok - after the baseline call a new table keeps only review items (inventory + explicit authenticated/service_role decisions)"

echo "== 5. idempotence"
fnd001_psql -At -c "SELECT 'baseline objects=' || public.enforce_privilege_baseline()"
bash "$ROOT/validation/fnd001/catalog-fingerprint.sh" > "$OUT/F2-fingerprint.txt"
cmp -s "$OUT/F1-fingerprint.txt" "$OUT/F2-fingerprint.txt" || fail "second baseline call changed the catalog"
echo "   ok - second call leaves the catalog byte-identical"

echo "== 6. single inventory: helper _svc_columns == guard service_role column allowlist"
guard_cols=$(grep -oE "\('service_role', '[a-z_]+', '(INSERT|UPDATE)', '[a-z_]+'\)" "$SEC/admin-only-acl-guard.sql" \
  | sed -E "s/\('service_role', '([a-z_]+)', '([A-Z]+)', '([a-z_]+)'\)/\1.\3:\2/" | sort)
helper_cols=$(sed -n '/_svc_columns constant text\[\] := ARRAY\[/,/\];/p' "$ROOT/validation/security/d5/d5-admin-only-migration.sql" \
  | grep -oE "'[a-z_]+\.[a-z_]+:(INSERT|UPDATE)'" | tr -d "'" | sort)
[ -n "$guard_cols" ] && [ "$guard_cols" = "$helper_cols" ] || { diff <(echo "$guard_cols") <(echo "$helper_cols"); fail "service_role column inventory differs between guard and helper"; }
echo "   ok - $(echo "$guard_cols" | wc -l | tr -d ' ') service_role column grant(s), identical in guard and helper"
# Let PostgREST (CI stack) see the new functions/policies before the REST checks.
fnd001_psql -c "NOTIFY pgrst, 'reload schema'"
echo "== D5 simulation: all steps passed"

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
#   4b. PUBLIC column ACLs (G2 + helper postcondition): column grants to PUBLIC are seen by
#      the guard, removed by the helper, and one the helper cannot revoke aborts it;
#   5. idempotence: a second baseline call changes nothing;
#   6. coverage: the number of behaviour cases, FND-001 cases and probes is asserted
#      exactly, so a silently shrunk suite cannot report PASS; the write and EXECUTE
#      inventories of the helper must equal the guard's allow_w / allow_x.
# Output directory: $1 (default /tmp/d5-sim).
# Expected counts: change them only together with the cases they count, in the same commit.
EXPECTED_ADMIN_ONLY_CASES=316
EXPECTED_FND001_CASES=186
EXPECTED_PROBES=27
EXPECTED_PUBLIC_COLUMN_CHECKS=12
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
grep -q '^summary|violations=0|risks=[0-9]*$' "$OUT/guard-after.txt" || fail "guard summary line missing or malformed"
if [ "$(fnd001_psql -At -c "SELECT to_regnamespace('net') IS NOT NULL")" = "t" ]; then
  [ "$(grep -c '^risk|D-e|' "$OUT/guard-after.txt")" -gt 0 ] || fail "schema net exists but the D-e residual risk is not reported"
fi
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
probe net-view "CREATE VIEW public.zz_netv AS SELECT id FROM net.http_request_queue;" G9 "relation zz_netv"
probe net-trigger "CREATE FUNCTION public.zz_t() RETURNS trigger LANGUAGE plpgsql AS \$f\$ BEGIN RETURN NEW; END \$f\$; CREATE TRIGGER zz_net BEFORE INSERT ON net.http_request_queue FOR EACH ROW EXECUTE FUNCTION public.zz_t();" G9 "trigger zz_net on net.http_request_queue"
# Reads (G6): one more PERMISSIVE SELECT policy is OR-ed with the reviewed ones, so any
# policy that is not "published rows / own roles / admin" must fail the guard.
probe select-open-theses "CREATE POLICY zz_open ON public.theses FOR SELECT USING (true);" G6 "policy theses.zz_open"
probe select-open-ptd "CREATE POLICY zz_open ON public.public_thesis_data FOR SELECT USING (true);" G6 "policy public_thesis_data.zz_open"
probe select-drafts-authenticated "CREATE POLICY zz_signed_in ON public.theses FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);" G6 "policy theses.zz_signed_in"
# search_path of reviewed SECURITY DEFINER routines must be safe, not merely present (G5).
probe secdef-path-public "ALTER FUNCTION public.is_admin() SET search_path = public;" G5 "routine is_admin()|-|SECURITY DEFINER search_path unsafe"
probe secdef-path-pgtemp-first "ALTER FUNCTION public.sec_is_admin() SET search_path = pg_temp, pg_catalog;" G5 "routine sec_is_admin()|-|SECURITY DEFINER search_path unsafe"
probe secdef-path-writable "CREATE SCHEMA zz_w; GRANT CREATE ON SCHEMA zz_w TO authenticated; ALTER FUNCTION public.is_admin() SET search_path = zz_w, pg_temp;" G5 "routine is_admin()|-|SECURITY DEFINER search_path unsafe"
# pg_net: a platform role attaches an EXISTING trigger function (no CREATE needed) (G9).
probe net-trigger-existing-fn "SET LOCAL ROLE sandbox_exec; CREATE TRIGGER zz_net2 BEFORE UPDATE ON net._http_response FOR EACH ROW EXECUTE FUNCTION pg_catalog.suppress_redundant_updates_trigger(); RESET ROLE;" G9 "trigger zz_net2 on net._http_response"
# H-level probe: a new table is clean after the helper except for its inventory entry.
probe new-table-explicit-grants "CREATE TABLE public.zz_probe (id int PRIMARY KEY); ALTER TABLE public.zz_probe ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.zz_probe TO service_role, authenticated, anon; CREATE FUNCTION public.zz_f() RETURNS int LANGUAGE sql AS 'SELECT 1'; GRANT EXECUTE ON FUNCTION public.zz_f() TO anon, authenticated, service_role; SELECT public.enforce_privilege_baseline();" G1 "relation zz_probe"
[ "$probes_run" -eq "$EXPECTED_PROBES" ] || fail "probe count: $probes_run run, $EXPECTED_PROBES expected"
echo "   ok - exactly $EXPECTED_PROBES probes ran and were caught"
# After the baseline call a new table or routine may only report its missing inventory
# entry (G1): no write (G3) or EXECUTE (G4) path for anon, authenticated, service_role,
# PUBLIC or sandbox_exec* survives, even after explicit GRANT ALL / GRANT EXECUTE.
for pr in new-table-baseline new-table-explicit-grants; do
  if grep '^violation|' "$OUT/probe-$pr.txt" | grep -vE '^violation\|G1\|' | grep -q .; then
    grep '^violation|' "$OUT/probe-$pr.txt"; fail "baseline call left a privilege path on a new object ($pr)"; fi
done
echo "   ok - after the baseline call new objects keep only their inventory item (G1); 0 G3/G4 paths"
# Control: a safe non-empty search_path (trusted schemas, explicit trailing pg_temp) is NOT
# reported, so G5 judges safety rather than rejecting every non-empty value.
fnd001_psql -At > "$OUT/control-safe-search-path.txt" 2>&1 <<SQL
BEGIN;
ALTER FUNCTION public.is_admin() SET search_path = pg_catalog, public, pg_temp;
\i validation/security/sql/admin-only-acl-guard.sql
ROLLBACK;
SQL
grep -q '^summary|violations=0|' "$OUT/control-safe-search-path.txt" || { grep '^violation' "$OUT/control-safe-search-path.txt"; fail "G5 flagged a safe search_path"; }
echo "   ok - control: search_path = pg_catalog, public, pg_temp accepted (0 violations)"

echo "== 4b. column ACLs granted directly to PUBLIC (G2 + helper postcondition; all rolled back)"
col_checks=0
colok() { col_checks=$((col_checks + 1)); echo "   ok - $1"; }
section() { awk -v s="#$2" '/^#/{on=($0==s); next} on' "$1"; }
# anon's column ACLs (the approved curated SELECT columns) must be identical before and after.
ANONCOLS="SELECT 'anoncol|' || c.relname || '.' || a.attname || '|' || x.privilege_type || '|' || x.is_grantable
  FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
  CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE c.relnamespace = 'public'::regnamespace AND x.grantee = 'anon'::regrole ORDER BY 1;"
PUBCOLS="SELECT 'public-column-acl=' || count(*) FROM pg_class c
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
  CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE c.relnamespace = 'public'::regnamespace AND x.grantee = 0;"
# Lifecycle: one column grant to PUBLIC per column privilege (SELECT, INSERT, UPDATE,
# REFERENCES); zz_nobody is a role without any grant, so it sees only what PUBLIC holds.
fnd001_psql -At > "$OUT/public-column-lifecycle.txt" 2>&1 <<SQL
BEGIN;
CREATE ROLE zz_nobody NOLOGIN;
\echo '#anon-before'
$ANONCOLS
GRANT SELECT (full_name) ON public.profiles TO PUBLIC;
GRANT INSERT (content), UPDATE (content) ON public.page_content TO PUBLIC;
GRANT REFERENCES (id) ON public.theses TO PUBLIC;
\echo '#granted'
$PUBCOLS
SELECT 'nobody-select-full_name=' || has_column_privilege('zz_nobody', 'public.profiles', 'full_name', 'SELECT');
\echo '#guard-granted'
\i validation/security/sql/admin-only-acl-guard.sql
\echo '#helper'
SELECT 'baseline objects=' || public.enforce_privilege_baseline();
$PUBCOLS
SELECT 'nobody-select-full_name=' || has_column_privilege('zz_nobody', 'public.profiles', 'full_name', 'SELECT');
\echo '#anon-after'
$ANONCOLS
\echo '#guard-after'
\i validation/security/sql/admin-only-acl-guard.sql
ROLLBACK;
SQL
L="$OUT/public-column-lifecycle.txt"
grep -q '^ERROR' "$L" && { cat "$L"; fail "PUBLIC column lifecycle script errored"; }
section "$L" granted | grep -qx 'public-column-acl=4' || { cat "$L"; fail "setup: expected 4 PUBLIC column ACL entries"; }
section "$L" granted | grep -qx 'nobody-select-full_name=true' || { cat "$L"; fail "setup: PUBLIC column SELECT not effective"; }
colok "setup: 4 column ACL entries granted to PUBLIC, effective for a role without grants"
for want in 'column profiles.full_name|PUBLIC|SELECT' 'column page_content.content|PUBLIC|INSERT' \
            'column page_content.content|PUBLIC|UPDATE' 'column theses.id|PUBLIC|REFERENCES'; do
  section "$L" guard-granted | grep -qxF "violation|G2|$want" || { cat "$L"; fail "guard (before helper) missed G2 $want"; }
  colok "guard before helper: G2 $want"
done
section "$L" helper | grep -qx 'public-column-acl=0' || { cat "$L"; fail "helper left a PUBLIC column ACL"; }
colok "helper: 0 column ACL entries granted to PUBLIC remain in public"
section "$L" helper | grep -qx 'nobody-select-full_name=false' || { cat "$L"; fail "PUBLIC column SELECT still effective after helper"; }
colok "helper: PUBLIC column SELECT no longer effective (role without grants)"
cmp -s <(section "$L" anon-before) <(section "$L" anon-after) || { cat "$L"; fail "anon column ACLs changed"; }
[ "$(section "$L" anon-before | grep -c '^anoncol|')" -gt 0 ] || { cat "$L"; fail "no anon column ACLs found to compare"; }
colok "anon column ACLs unchanged ($(section "$L" anon-before | grep -c '^anoncol|') entries)"
section "$L" guard-after | grep -q '^summary|violations=0|' || { section "$L" guard-after | grep '^violation'; fail "guard after helper not at 0"; }
colok "guard after helper: 0 violations"
# Postcondition: a PUBLIC column grant issued by another grantor survives the owner's
# REVOKE, so the helper must abort and name it (it may never pass silently).
fnd001_psql -At > "$OUT/public-column-other-grantor.txt" 2>&1 <<SQL || true
BEGIN;
GRANT SELECT (full_name) ON public.profiles TO authenticated WITH GRANT OPTION;
SET LOCAL ROLE authenticated;
GRANT SELECT (full_name) ON public.profiles TO PUBLIC;
RESET ROLE;
\echo '#guard'
\i validation/security/sql/admin-only-acl-guard.sql
\echo '#helper'
SELECT 'baseline objects=' || public.enforce_privilege_baseline();
ROLLBACK;
SQL
G="$OUT/public-column-other-grantor.txt"
section "$G" guard | grep -qxF 'violation|G2|column profiles.full_name|PUBLIC|SELECT' || { cat "$G"; fail "guard missed other-grantor PUBLIC column SELECT"; }
colok "guard: other-grantor PUBLIC column SELECT detected"
grep -q 'enforce_privilege_baseline: privilege path(s) remain.*PUBLIC holds column SELECT (full_name) on public.profiles' "$G" \
  && ! grep -q '^baseline objects=' "$G" || { cat "$G"; fail "helper did not abort on a surviving PUBLIC column grant"; }
colok "helper postcondition aborts on surviving PUBLIC column SELECT and names it"
[ "$col_checks" -eq "$EXPECTED_PUBLIC_COLUMN_CHECKS" ] || fail "PUBLIC column checks: $col_checks run, $EXPECTED_PUBLIC_COLUMN_CHECKS expected"
echo "   ok - exactly $EXPECTED_PUBLIC_COLUMN_CHECKS PUBLIC column checks ran and passed"

echo "== 5. idempotence"
fnd001_psql -At -c "SELECT 'baseline objects=' || public.enforce_privilege_baseline()"
bash "$ROOT/validation/fnd001/catalog-fingerprint.sh" > "$OUT/F2-fingerprint.txt"
cmp -s "$OUT/F1-fingerprint.txt" "$OUT/F2-fingerprint.txt" || fail "second baseline call changed the catalog"
echo "   ok - second call leaves the catalog byte-identical"

echo "== 6. single inventory: helper _allow_w/_allow_x == guard allow_w/allow_x"
MIG="$ROOT/validation/security/d5/d5-admin-only-migration.sql"
guard_w=$(grep -oE "\('(anon|authenticated|service_role|sandbox)', '[a-z_]+', '[A-Z]+', '[a-z_*]+'\)" "$SEC/admin-only-acl-guard.sql" \
  | sed -E "s/\('([a-z_]+)', '([a-z_]+)', '([A-Z]+)', '([a-z_*]+)'\)/\1|\2|\3|\4/" | sort)
helper_w=$(sed -n '/_allow_w constant text\[\] := ARRAY\[/,/\];/p' "$MIG" | grep -oE "'[a-z_]+\|[a-z_]+\|[A-Z]+\|[a-z_*]+'" | tr -d "'" | sort)
[ -n "$guard_w" ] && [ "$guard_w" = "$helper_w" ] || { diff <(echo "$guard_w") <(echo "$helper_w"); fail "write inventory differs between guard and helper"; }
guard_x=$(grep -oE "\('(anon|authenticated|service_role|sandbox)', '[a-z_]+\([a-z_,]*\)'\)" "$SEC/admin-only-acl-guard.sql" \
  | sed -E "s/\('([a-z_]+)', '([^']+)'\)/\1|\2/" | sort)
helper_x=$(sed -n '/_allow_x constant text\[\] := ARRAY\[/,/\];/p' "$MIG" | grep -oE "'[a-z_]+\|public\.[^']+'" | tr -d "'" | sed 's/public\.//g' | sort)
[ -n "$guard_x" ] && [ "$guard_x" = "$helper_x" ] || { diff <(echo "$guard_x") <(echo "$helper_x"); fail "EXECUTE inventory differs between guard and helper"; }
echo "   ok - $(echo "$guard_w" | wc -l | tr -d ' ') write and $(echo "$guard_x" | wc -l | tr -d ' ') EXECUTE inventory entries, identical in guard and helper"
# Let PostgREST (CI stack) see the new functions/policies before the REST checks.
fnd001_psql -c "NOTIFY pgrst, 'reload schema'"
echo "== D5 simulation: all steps passed"

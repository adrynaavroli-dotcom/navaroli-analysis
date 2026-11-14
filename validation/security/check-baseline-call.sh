#!/usr/bin/env bash
# D-f control (static, no database): once the D5 helper exists in the migration chain,
# EVERY later migration that creates a relation or routine in schema public must end with
#   SELECT public.enforce_privilege_baseline();
# so that the default privileges of postgres (docs/security/d5-design.md §11) are withdrawn
# inside the same transaction and the helper's postcondition can abort it.
# The rule is "armed" by the first migration (journal order) that creates the helper; the
# arming migration itself must also end with the call. Earlier migrations are exempt.
# Usage: check-baseline-call.sh [migrations_dir]   (default: drizzle/migrations)
#        check-baseline-call.sh --self-test        (proves the check can fail)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

check() {
  python3 - "$1" <<'PY'
import json, os, re, sys
d = sys.argv[1]
entries = sorted(json.load(open(os.path.join(d, "meta", "_journal.json")))["entries"], key=lambda e: e["idx"])
def strip(sql):  # comments out; dollar-quoted bodies kept (conservative: more files are checked)
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.S)
    return re.sub(r"--[^\n]*", " ", sql)
creates_helper = re.compile(r"CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.enforce_privilege_baseline\s*\(", re.I)
creates_public = re.compile(
    r"\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+|UNLOGGED\s+)?"
    r"(TABLE|VIEW|MATERIALIZED\s+VIEW|SEQUENCE|FUNCTION|PROCEDURE|FOREIGN\s+TABLE)\s+(?:IF\s+NOT\s+EXISTS\s+)?"
    r"(\"?[A-Za-z_][A-Za-z0-9_]*\"?\s*\.\s*)?\"?[A-Za-z_]", re.I)
final_call = re.compile(r"SELECT\s+public\.enforce_privilege_baseline\s*\(\s*\)\s*;?\s*$", re.I)
armed, bad, checked = None, [], 0
for e in entries:
    sql = strip(open(os.path.join(d, e["tag"] + ".sql")).read())
    if armed is None and creates_helper.search(sql):
        armed = e["tag"]
    if armed is None:
        continue
    public = [m for m in creates_public.finditer(sql)
              if m.group(2) is None or m.group(2).replace('"', '').strip().rstrip('.').strip().lower() == "public"]
    if not public:
        continue
    checked += 1
    body = re.sub(r"--> statement-breakpoint", " ", sql).strip()
    if not final_call.search(body):
        bad.append(e["tag"])
if armed is None:
    print(f"ok - rule not armed yet: no migration creates public.enforce_privilege_baseline() ({len(entries)} migration(s) inspected)")
elif bad:
    for t in bad:
        print(f"not ok - {t}.sql creates objects in public but does not end with SELECT public.enforce_privilege_baseline();")
    sys.exit(1)
else:
    print(f"ok - armed at {armed}; {checked} migration(s) creating public objects end with the baseline call")
PY
}

if [ "${1:-}" = "--self-test" ]; then
  T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
  mk() { # $1 dir, then tag=content pairs
    local dir="$1"; shift; mkdir -p "$dir/meta"; local i=0 js=""
    for pair in "$@"; do local tag="${pair%%=*}"; printf '%s\n' "${pair#*=}" > "$dir/$tag.sql"
      js="$js${js:+,}{\"idx\":$i,\"tag\":\"$tag\"}"; i=$((i+1)); done
    echo "{\"entries\":[$js]}" > "$dir/meta/_journal.json"
  }
  D5='CREATE FUNCTION public.enforce_privilege_baseline() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
SELECT public.enforce_privilege_baseline();'
  mk "$T/pre"  "0000_old=CREATE TABLE public.legacy (id int);"
  mk "$T/good" "0000_old=CREATE TABLE public.legacy (id int);" "0001_d5=$D5" "0002_new=CREATE TABLE public.t (id int);
-- trailing comment
SELECT public.enforce_privilege_baseline();" "0003_other_schema=CREATE TABLE extensions.x (id int);"
  mk "$T/bad"  "0000_d5=$D5" "0001_new=CREATE TABLE t (id int);"
  mk "$T/bad2" "0000_d5=$D5" "0001_fn=CREATE OR REPLACE FUNCTION public.f() RETURNS int LANGUAGE sql AS 'SELECT 1';
SELECT public.enforce_privilege_baseline();
GRANT EXECUTE ON FUNCTION public.f() TO anon;"
  mk "$T/bad3" "0000_d5=CREATE FUNCTION public.enforce_privilege_baseline() RETURNS integer LANGUAGE sql AS \$\$ SELECT 1 \$\$;"
  check "$T/pre" >/dev/null  || { echo "not ok - self-test: pre-D5 chain should pass"; exit 1; }
  check "$T/good" >/dev/null || { echo "not ok - self-test: compliant chain should pass"; exit 1; }
  for b in bad bad2 bad3; do
    if check "$T/$b" >/dev/null; then echo "not ok - self-test: $b should fail"; exit 1; fi
  done
  echo "ok - self-test: 2 compliant chains pass; missing call, call not last, and arming migration without call fail"
  exit 0
fi
check "${1:-$ROOT/drizzle/migrations}"

#!/usr/bin/env bash
# Guards for the single migration chain (see AGENTS.md):
#   legacy supabase/migrations/*.sql (frozen) -> drizzle/migrations (journal order).
# Fails when the legacy chain changes, when sec_* objects appear outside the Drizzle
# chain, when drizzle/schema.ts stops being the blank placeholder, or when the Drizzle
# journal and its SQL files disagree. Read-only: inspects files only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
fail=0
say() { echo "$1"; }

# 1. Legacy chain frozen: same files, same bytes as the committed manifest.
manifest=validation/fnd001/legacy-migrations.sha256
if sha256sum --quiet --strict -c "$manifest"; then say "ok - legacy migrations unchanged"; else say "not ok - legacy migration modified"; fail=1; fi
listed=$(awk '{print $2}' "$manifest" | sort)
present=$(ls supabase/migrations/*.sql | sort)
if [ "$listed" = "$present" ]; then say "ok - no new files in supabase/migrations"
else say "not ok - supabase/migrations differs from manifest (new DDL must go through the Drizzle chain)"; diff <(echo "$listed") <(echo "$present") || true; fail=1; fi

# 2. SEC objects only in the Drizzle chain.
if grep -il 'sec_' supabase/migrations/*.sql >/dev/null 2>&1; then say "not ok - sec_* referenced in supabase/migrations"; fail=1
else say "ok - no sec_* objects in legacy chain"; fi

# 3. drizzle/schema.ts stays the blank placeholder (no schema-derived migrations).
if [ "$(cat drizzle/schema.ts)" = "// auto-generated and intentionally left blank, do not edit" ]; then say "ok - drizzle/schema.ts blank"
else say "not ok - drizzle/schema.ts is not the blank placeholder"; fail=1; fi

# 4. Journal entries and SQL files match one-to-one.
tags=$(python3 -c "import json;print('\n'.join(sorted(e['tag']+'.sql' for e in json.load(open('drizzle/migrations/meta/_journal.json'))['entries'])))")
files=$(cd drizzle/migrations && ls *.sql | sort)
if [ "$tags" = "$files" ]; then say "ok - drizzle journal matches SQL files"
else say "not ok - drizzle journal and SQL files differ"; diff <(echo "$tags") <(echo "$files") || true; fail=1; fi

# 5. No script runs drizzle-kit generate/pull/push.
if grep -Eq 'drizzle-kit[^"]*(generate|pull|push)' package.json; then say "not ok - package.json runs drizzle-kit generate/pull/push"; fail=1
else say "ok - no drizzle-kit generate/pull/push scripts"; fi

# 6. The CI workflow never calls psql directly: every database script runs through its
#    guarded wrapper (apply-chain.sh, run-db-tests.sh, catalog-fingerprint.sh,
#    access-check.ts), which enforces lib/guard.sh.
if grep -nE '(^|[^a-z_])psql([^a-z_]|$)' .github/workflows/quality-checks.yml >/dev/null; then
  say "not ok - quality-checks.yml calls psql directly (use the guarded wrappers)"; fail=1
else say "ok - workflow runs SQL only through guarded wrappers"; fi

exit $fail

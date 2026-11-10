#!/usr/bin/env bash
# Rebuild the full application schema in a disposable database from the single
# source of truth (AGENTS.md): the frozen legacy chain supabase/migrations/*.sql
# in filename order, followed by drizzle/migrations in journal order.
#
# Nothing is ever written to the live project's migration history: the target is
# a throwaway database guarded by lib/guard.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
source "$ROOT/validation/fnd001/lib/guard.sh"
fnd001_require_local_db

echo "== legacy chain (supabase/migrations, filename order)"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  echo "   apply $(basename "$f")"
  fnd001_psql -1 -f "$f"
done

echo "== drizzle chain (journal order)"
tags=$(python3 -c "import json,sys;print('\n'.join(e['tag'] for e in sorted(json.load(open(sys.argv[1]))['entries'],key=lambda e:e['idx'])))" "$ROOT/drizzle/migrations/meta/_journal.json")
for t in $tags; do
  echo "   apply $t.sql"
  fnd001_psql -1 -f "$ROOT/drizzle/migrations/$t.sql"
done
echo "== chain applied"
# Make PostgREST (CI stack) see the new objects before the REST/JWT checks; harmless
# on a bare local PostgreSQL where nobody listens on the channel.
fnd001_psql -c "NOTIFY pgrst, 'reload schema'"

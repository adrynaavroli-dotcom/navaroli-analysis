#!/usr/bin/env bash
# Shared safety guard for every FND-001 database script.
#
# Why: these scripts create schemas, insert fixtures and (in the CI stack) commit
# seed rows. They must only ever touch a disposable database. The guard
#   1. drops every libpq PG* variable inherited from the environment, so psql can
#      never fall back to an ambient connection (the Lovable sandbox exports PG*
#      variables that point at the live project database);
#   2. requires an explicit FND001_TEST_DB_URL whose host is loopback;
#   3. rejects anything that looks like a hosted Supabase / pooler endpoint or the
#      live project reference, even if it were tunnelled to localhost.
set -euo pipefail

fnd001_require_local_db() {
  unset PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLMODE PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS
  : "${FND001_TEST_DB_URL:?FND001_TEST_DB_URL must point to a disposable local database}"
  case "$FND001_TEST_DB_URL" in
    *zhhagwrgufwamqvjaoip*|*supabase.co*|*supabase.com*|*pooler*)
      echo "REFUSED: FND001_TEST_DB_URL looks like a hosted/production database" >&2; exit 2 ;;
  esac
  if ! [[ "$FND001_TEST_DB_URL" =~ ^postgres(ql)?://[^@/]+@(127\.0\.0\.1|localhost)(:[0-9]+)?/[A-Za-z0-9_]+$ ]]; then
    echo "REFUSED: FND001_TEST_DB_URL must be postgresql://user[:pw]@127.0.0.1|localhost[:port]/db" >&2; exit 2
  fi
}

fnd001_psql() {
  psql "$FND001_TEST_DB_URL" -X -v ON_ERROR_STOP=1 -q "$@"
}

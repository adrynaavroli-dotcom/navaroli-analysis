#!/usr/bin/env bash
# FND-001 / D3 — read-only catalog capture of the LIVE project database.
#
# This is the only FND-001 script allowed to touch the live database, and only because
# D3 authorises catalog SELECTs. Safety model (deliberately the inverse of lib/guard.sh):
#   * it uses the ambient PG* connection of the Lovable sandbox (it never accepts a URL);
#   * every session is forced to default_transaction_read_only=on before the SQL runs,
#     and the script aborts if the server does not confirm the setting;
#   * the SQL files it runs (catalog-fingerprint.sql, d3-platform-roles.sql) contain only
#     SELECTs over pg_catalog / information views and built-in privilege functions;
#     validation/security/permissions-audit.sql adds aggregate COUNTs, never row contents.
# Output: $1 (default /tmp/fnd001-d3) receives prod-catalog-fingerprint.txt and
# prod-platform-roles.txt; compare the fingerprint with the CI artifact using `diff`.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${1:-/tmp/fnd001-d3}"
mkdir -p "$OUT"
: "${PGHOST:?ambient PG* connection required (Lovable sandbox)}"
unset FND001_TEST_DB_URL

ro_psql() {
  # First statement forces read-only; the marker line proves it before any output is kept.
  psql -X -v ON_ERROR_STOP=1 -q -At -c "SET default_transaction_read_only = on" \
       -c "SELECT 'READONLY=' || current_setting('default_transaction_read_only')" "$@"
}

capture() { # $1 sql file, $2 output file
  ro_psql -f "$1" > "$2.raw"
  if [ "$(head -1 "$2.raw")" != "READONLY=on" ]; then
    echo "ABORT: session was not read-only" >&2; rm -f "$2.raw"; exit 3
  fi
  tail -n +2 "$2.raw" | sed '/^$/d' > "$2"; rm -f "$2.raw"
}

capture "$ROOT/validation/fnd001/sql/catalog-fingerprint.sql" "$OUT/prod-catalog-fingerprint.txt"
capture "$ROOT/validation/fnd001/sql/d3-platform-roles.sql"   "$OUT/prod-platform-roles.txt"
# Transversal admin-only audit (catalog + aggregate counts only; see the SQL header).
capture "$ROOT/validation/security/permissions-audit.sql"       "$OUT/prod-permissions-audit.txt"
# D5 design: identities that run DDL and platform grants on storage/net/cron (catalog only).
capture "$ROOT/validation/security/platform-identity-probe.sql" "$OUT/prod-platform-identity.txt"
# Admin-only regression guard: before D5 it lists the open paths; after D5 it is the postflight.
capture "$ROOT/validation/security/sql/admin-only-acl-guard.sql" "$OUT/prod-admin-only-guard.txt"
wc -l "$OUT"/prod-*.txt

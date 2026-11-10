#!/usr/bin/env bash
# Catalog fingerprint of a DISPOSABLE database (CI ephemeral stack or local rebuild).
# Guarded by lib/guard.sh like every other FND-001 database script; the live project is
# fingerprinted only through run-d3-catalog.sh (read-only session, D3 authorisation).
# Output on stdout, one sorted line per object, in the same format as run-d3-catalog.sh,
# so the two files can be compared with a plain `diff`.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
source "$ROOT/validation/fnd001/lib/guard.sh"
fnd001_require_local_db
fnd001_psql -At -f "$ROOT/validation/fnd001/sql/catalog-fingerprint.sql" | sed '/^$/d'

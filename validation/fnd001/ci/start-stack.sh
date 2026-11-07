#!/usr/bin/env bash
# Start an EPHEMERAL Supabase stack (Docker) for the FND-001 CI job and export its
# loopback endpoints to $GITHUB_ENV. It uses its own temporary project directory and
# config, so the repository's auto-generated supabase/config.toml is never read or
# modified, and no migrations are applied here (apply-chain.sh does that explicitly).
set -euo pipefail
STACK_DIR="${RUNNER_TEMP:-/tmp}/fnd001-stack"
mkdir -p "$STACK_DIR"
cd "$STACK_DIR"
supabase --version
supabase init --force >/dev/null
# Pin the PostgreSQL major version used in production (17).
if grep -q '^major_version' supabase/config.toml; then
  sed -i 's/^major_version = .*/major_version = 17/' supabase/config.toml
else
  printf '\n[db]\nmajor_version = 17\n' >> supabase/config.toml
fi
grep -n '^major_version' supabase/config.toml
# Services not needed for DB/RLS/JWT tests are excluded to keep the job short.
supabase start -x studio,imgproxy,storage-api,realtime,edge-runtime,logflare,vector,postgres-meta
eval "$(supabase status -o env)"
{
  echo "FND001_SUPABASE_URL=${API_URL}"
  echo "FND001_ANON_KEY=${ANON_KEY}"
  echo "FND001_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}"
  echo "FND001_TEST_DB_URL=${DB_URL}"
} >> "${GITHUB_ENV:-/dev/stdout}"
psql "$DB_URL" -XAtc "SELECT 'server_version=' || current_setting('server_version')"

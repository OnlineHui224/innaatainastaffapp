#!/usr/bin/env bash
#
# Runs the migration 019 guard tests against a throwaway PostgreSQL instance.
#
# It never touches a HajjERP database: it initialises a fresh cluster under
# /tmp, applies only the schema these tests need, runs the checks and stops.
#
#   supabase/migrations/tests/run-019-tests.sh
#
# Requires PostgreSQL server binaries (Debian/Ubuntu: /usr/lib/postgresql/*/bin).

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS="$(dirname "$HERE")"

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)}"
if [[ -z "${PGBIN}" || ! -x "${PGBIN}/initdb" ]]; then
  echo "PostgreSQL server binaries not found. Set PGBIN to the directory containing initdb." >&2
  exit 1
fi
export PATH="$PGBIN:$PATH"

PGDATA_DIR="${PGDATA_DIR:-/tmp/hajjerp-019-test}"
PORT="${PORT:-55432}"
SOCKET_DIR="${SOCKET_DIR:-/tmp}"

# initdb refuses to run as root, so drop to an unprivileged user when needed.
RUNNER=""
if [[ "$(id -u)" -eq 0 ]]; then
  id postgres >/dev/null 2>&1 || useradd -m postgres
  RUNNER="postgres"
fi

run() {
  if [[ -n "$RUNNER" ]]; then su "$RUNNER" -c "PATH=$PGBIN:\$PATH $1"; else bash -c "$1"; fi
}

cleanup() {
  run "pg_ctl -D $PGDATA_DIR stop -m immediate" >/dev/null 2>&1 || true
  rm -rf "$PGDATA_DIR"
}
trap cleanup EXIT

rm -rf "$PGDATA_DIR"
mkdir -p "$PGDATA_DIR"
[[ -n "$RUNNER" ]] && chown "$RUNNER:$RUNNER" "$PGDATA_DIR"

run "initdb -D $PGDATA_DIR -U postgres -A trust" >/dev/null
run "pg_ctl -D $PGDATA_DIR -o '-p $PORT -k $SOCKET_DIR' -l $PGDATA_DIR/server.log start" >/dev/null
sleep 2

PSQL=(psql -h "$SOCKET_DIR" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)

# The roles PostgREST switches to per request. `authenticated` is what a browser
# gets; the tests rely on the distinction between it and the server role.
"${PSQL[@]}" -c "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;" >/dev/null

# Minimal stand-ins for the tables migration 019 references. Only the columns
# these tests touch — this is a guard harness, not a schema replica.
"${PSQL[@]}" <<'SQL' >/dev/null
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

CREATE TABLE profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL DEFAULT '',
  email text,
  role text NOT NULL DEFAULT 'operations_staff',
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE sub_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_name text NOT NULL,
  contact_person text NOT NULL,
  active_status boolean NOT NULL DEFAULT true
);
CREATE TABLE pilgrims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  passport_number text NOT NULL,
  nationality text NOT NULL,
  expected_departure_date date NOT NULL
);
CREATE TABLE hotel_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city text NOT NULL,
  name_en text NOT NULL
);
CREATE OR REPLACE FUNCTION is_admin_or_higher() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT false $$;
SQL

echo "Applying migration 019…"
"${PSQL[@]}" -f "$MIGRATIONS/20260817090000_019_visa_contract_records.sql" >/dev/null

# RLS is owner-exempt, and these tests assert trigger behaviour rather than
# policies, so they run as the table owner with RLS forced off for clarity.
"${PSQL[@]}" -c "GRANT ALL ON visa_contract_records, sub_agents, pilgrims, profiles TO authenticated;" >/dev/null
"${PSQL[@]}" -c "ALTER TABLE visa_contract_records DISABLE ROW LEVEL SECURITY;" >/dev/null

echo "Running guard tests…"
"${PSQL[@]}" -f "$HERE/019_visa_contract_records.test.sql"

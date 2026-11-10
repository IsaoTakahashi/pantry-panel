# Shared by launch.sh / doctor.sh / drive.sh / cleanup.sh. Source, don't execute.

ROOT=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
SKILL_DIR="$ROOT/.claude/skills/verify"
STATE_DIR="${VERIFY_STATE_DIR:-${TMPDIR:-/tmp}/pantry-panel-verify}"
EVIDENCE_ROOT="$ROOT/.verify-evidence"
ENV_FILE="$ROOT/frontend/.env.e2e"
SCRATCH_DIR="$ROOT/frontend/e2e/verify-scratch"
BACKEND_PORT=8080
FRONTEND_PORT=3000

# Load frontend/.env.e2e into the environment without printing values.
# There is only one Supabase project (prod and E2E share it), so the safety
# line is the group: E2E_TEST_GROUP_ID is always forced empty, which makes
# global-setup create a throwaway group per run and global-teardown delete only
# that group's items. Node's loadEnvFile in playwright.config.ts keeps a
# pre-set empty value, so .env.e2e cannot override this.
load_verify_env() {
  if [ ! -f "$ENV_FILE" ]; then
    echo "verify: frontend/.env.e2e is missing (copy frontend/.env.e2e.example and fill it)" >&2
    return 1
  fi
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  export E2E_TEST_GROUP_ID=""
  export PORT="$BACKEND_PORT"
  export SUPABASE_JWKS_URL="${SUPABASE_JWKS_URL:-${E2E_SUPABASE_URL:-}/auth/v1/.well-known/jwks.json}"
  export SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-${E2E_SUPABASE_ANON_KEY:-}}"
  export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-${E2E_SUPABASE_URL:-}}"
  export NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-${E2E_SUPABASE_ANON_KEY:-}}"
  # Override frontend/.env.local, which may point at the prod Lambda.
  export NEXT_PUBLIC_API_BASE_URL="http://localhost:$BACKEND_PORT"
  unset CORS_ALLOWED_ORIGINS
  # Any of these makes playwright.config.ts / global-setup.ts target the Vercel
  # preview + preview Lambda instead of this local instance.
  unset PREVIEW_URL PREVIEW_BACKEND_URL VERCEL_BYPASS_TOKEN RUN_SW_E2E

  local missing=""
  for v in DATABASE_URL E2E_SUPABASE_URL E2E_SUPABASE_ANON_KEY E2E_TEST_EMAIL E2E_TEST_PASSWORD; do
    [ -n "${!v:-}" ] || missing="$missing $v"
  done
  if [ -n "$missing" ]; then
    echo "verify: frontend/.env.e2e lacks:$missing" >&2
    return 1
  fi
}

# PIDs listening on a TCP port (empty if free).
port_listeners() {
  { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null || true; } | sort -u
}

# True when every listener on the port belongs to the process group we started.
port_owned_by() {
  local port=$1 pgid=$2 pid
  local pids
  pids=$(port_listeners "$port")
  [ -n "$pids" ] || return 1
  for pid in $pids; do
    [ "$(ps -o pgid= -p "$pid" | tr -d ' ')" = "$pgid" ] || return 1
  done
}

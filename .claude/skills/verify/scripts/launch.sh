#!/usr/bin/env bash
# Start the Go backend (:8080) and Next.js dev (:3000) for verification.
# Refuses if either port is already taken: Playwright's reuseExistingServer
# would otherwise silently drive the user's own dev server.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

for port in $BACKEND_PORT $FRONTEND_PORT; do
  pids=$(port_listeners "$port")
  if [ -n "$pids" ]; then
    echo "verify: port $port is already in use by pid(s): $(echo $pids). Not ours; refusing to launch." >&2
    echo "        Stop your own dev server / go run first, or run cleanup.sh if a previous verify run left it." >&2
    exit 1
  fi
done

load_verify_env
mkdir -p "$STATE_DIR"
# next dev rewrites the managed block in frontend/AGENTS.md; cleanup restores this copy.
cp "$ROOT/frontend/AGENTS.md" "$STATE_DIR/AGENTS.md.orig"

# No-op when cached; a Playwright bump (npm install / Renovate) otherwise fails drive.sh.
(cd "$ROOT/frontend" && ./node_modules/.bin/playwright install chromium >/dev/null)

echo "verify: building backend"
go -C "$ROOT/backend" build -o "$STATE_DIR/pantry-backend" .

# set -m gives each background job its own process group, so cleanup can kill
# exactly what we started (next dev forks a child server).
set -m
nohup "$STATE_DIR/pantry-backend" >"$STATE_DIR/backend.log" 2>&1 </dev/null &
echo $! >"$STATE_DIR/backend.pgid"
(cd "$ROOT/frontend" && exec ./node_modules/.bin/next dev -p "$FRONTEND_PORT") >"$STATE_DIR/frontend.log" 2>&1 </dev/null &
echo $! >"$STATE_DIR/frontend.pgid"
set +m

wait_for() {
  local name=$1 url=$2 tries=$3
  for _ in $(seq 1 "$tries"); do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' "$url")" = "200" ]; then
      echo "verify: $name ready ($url)"
      return 0
    fi
    sleep 1
  done
  echo "verify: $name did not become ready; see $STATE_DIR/$name.log" >&2
  tail -20 "$STATE_DIR/$name.log" >&2 || true
  return 1
}

wait_for backend "http://localhost:$BACKEND_PORT/health" 60
# Ready means usable: without JWKS the API runs with auth disabled and every
# group-scoped call misbehaves.
if ! grep -q "JWT authentication enabled" "$STATE_DIR/backend.log"; then
  echo "verify: backend started without JWT auth (SUPABASE_JWKS_URL missing?)" >&2
  exit 1
fi
# First hit compiles the route; /health is public (not behind middleware auth).
wait_for frontend "http://localhost:$FRONTEND_PORT/health" 180

echo "verify: launched. state in $STATE_DIR"

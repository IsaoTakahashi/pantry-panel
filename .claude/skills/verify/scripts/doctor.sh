#!/usr/bin/env bash
# Read-only: is the running instance ours and worth driving? Exit 0 = yes.
set -uo pipefail
. "$(dirname "$0")/lib.sh"

ok=1
say() { printf '%-9s %s\n' "$1" "$2"; }

if [ -f "$ENV_FILE" ]; then say OK "frontend/.env.e2e present"; else say FAIL "frontend/.env.e2e missing"; ok=0; fi

for name in backend frontend; do
  port=$BACKEND_PORT
  [ "$name" = frontend ] && port=$FRONTEND_PORT
  pgid_file="$STATE_DIR/$name.pgid"
  if [ ! -f "$pgid_file" ]; then
    say FAIL "$name: no verify run recorded ($pgid_file); listeners on :$port = $(echo $(port_listeners "$port"))"
    ok=0
    continue
  fi
  pgid=$(cat "$pgid_file")
  if port_owned_by "$port" "$pgid"; then
    say OK "$name: :$port owned by our process group $pgid"
  else
    say FAIL "$name: :$port not owned by our process group $pgid (listeners: $(echo $(port_listeners "$port")))"
    ok=0
  fi
done

code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$BACKEND_PORT/health")
if [ "$code" = 200 ]; then say OK "backend /health 200 (DB reachable)"; else say FAIL "backend /health $code"; ok=0; fi

if grep -q "JWT authentication enabled" "$STATE_DIR/backend.log" 2>/dev/null; then
  say OK "backend JWT auth enabled"
else
  say FAIL "backend JWT auth not enabled"
  ok=0
fi

code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$FRONTEND_PORT/health")
if [ "$code" = 200 ]; then say OK "frontend /health 200"; else say FAIL "frontend /health $code"; ok=0; fi

[ "$ok" = 1 ] && echo "doctor: healthy" || echo "doctor: NOT healthy — run cleanup.sh then launch.sh"
[ "$ok" = 1 ]

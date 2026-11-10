#!/usr/bin/env bash
# Stop only the process groups launch.sh started and drop scratch state.
# Never touches .verify-evidence/.
set -uo pipefail
. "$(dirname "$0")/lib.sh"

for name in frontend backend; do
  f="$STATE_DIR/$name.pgid"
  [ -f "$f" ] || continue
  pgid=$(cat "$f")
  if kill -0 -- "-$pgid" 2>/dev/null; then
    kill -TERM -- "-$pgid" 2>/dev/null
    for _ in $(seq 1 10); do kill -0 -- "-$pgid" 2>/dev/null || break; sleep 1; done
    kill -KILL -- "-$pgid" 2>/dev/null || true
    echo "verify: stopped $name (pgid $pgid)"
  fi
done

if [ -f "$STATE_DIR/AGENTS.md.orig" ]; then
  cp "$STATE_DIR/AGENTS.md.orig" "$ROOT/frontend/AGENTS.md"
fi
rm -rf "$STATE_DIR" "$SCRATCH_DIR"

for port in $BACKEND_PORT $FRONTEND_PORT; do
  pids=$(port_listeners "$port")
  [ -z "$pids" ] || echo "verify: note: :$port still has listener(s) $(echo $pids) — not started by verify, left alone"
done
echo "verify: cleaned up (evidence kept in $EVIDENCE_ROOT)"

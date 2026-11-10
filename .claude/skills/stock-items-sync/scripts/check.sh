#!/usr/bin/env bash
# Model-check StockItemsSync under every config and compare with the expected
# verdicts below. Exit 0 = every config matches its expectation.
#   .claude/skills/stock-items-sync/scripts/check.sh
set -euo pipefail

SKILL_DIR=$(cd "$(dirname "$0")/.." && pwd)
ROOT=$(git -C "$SKILL_DIR" rev-parse --show-toplevel)
MODEL_DIR="$SKILL_DIR/model"

TLA_VERSION=1.7.4
TLA_SHA256=936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88
JAR="${XDG_CACHE_HOME:-$HOME/.cache}/pantry-panel-tla/tla2tools-$TLA_VERSION.jar"

# Expected verdict per config: pass = invariant holds for every behavior,
# fail = TLC finds a counterexample. Current mirrors the code at the sync
# commit in SKILL.md; its "fail" is the known finding, not a broken check.
EXPECT=(
  "Current:fail"
  "Fixed:pass"
  "RealtimeOnlyGuard:fail"
)

# Code the model describes, and the commit at which the model was last
# confirmed to match it. Keep in sync with "Coverage" in SKILL.md.
SYNC_COMMIT=26b115f71464d32ab421ecc17de0e33708f98fea
COVERED=(
  frontend/src/app/stock-items/useStockItems.ts
  frontend/src/lib/useStockItemsRealtime.ts
  backend/handler/stock_item.go
  backend/repository/stock_item_pg.go
)

drift=0
if ! git -C "$ROOT" diff --quiet "$SYNC_COMMIT" -- "${COVERED[@]}"; then
  drift=1
  echo "STALE covered code changed since sync commit ${SYNC_COMMIT:0:7}:"
  git -C "$ROOT" diff --stat "$SYNC_COMMIT" -- "${COVERED[@]}" | sed 's/^/        /'
  echo "        Re-map the change onto the model (SKILL.md の「コードが変わったとき」) before trusting the verdicts below."
fi

if [ ! -f "$JAR" ]; then
  mkdir -p "$(dirname "$JAR")"
  curl -sSL -o "$JAR.tmp" "https://github.com/tlaplus/tlaplus/releases/download/v$TLA_VERSION/tla2tools.jar"
  mv "$JAR.tmp" "$JAR"
fi
echo "$TLA_SHA256  $JAR" | shasum -a 256 -c --quiet - || { echo "check: tla2tools.jar hash mismatch; delete $JAR and rerun" >&2; exit 1; }

OUT_DIR=$(mktemp -d "${TMPDIR:-/tmp}/stock-items-sync.XXXXXX")
status=0
for entry in "${EXPECT[@]}"; do
  cfg=${entry%%:*}
  want=${entry##*:}
  log="$OUT_DIR/$cfg.log"
  # mise exec -C runs from the repo root (to pick up .mise.toml's java), so paths are absolute.
  mise exec -C "$ROOT" -- java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
    -workers auto -cleanup -metadir "$OUT_DIR/$cfg.states" \
    -config "$MODEL_DIR/$cfg.cfg" "$MODEL_DIR/StockItemsSync.tla" >"$log" 2>&1 || true
  if grep -q "Model checking completed. No error has been found." "$log"; then
    got=pass
  elif grep -q "is violated" "$log"; then
    got=fail
  else
    got=error
  fi
  states=$(grep -oE '[0-9,]+ distinct states found' "$log" | tail -1 || true)
  if [ "$got" = "$want" ]; then
    echo "OK    $cfg: $got (expected $want) ${states:+— $states}"
  else
    echo "DIFF  $cfg: $got (expected $want) — log: $log"
    status=1
  fi
done

echo "check: logs and counterexamples in $OUT_DIR"
[ "$drift" = 0 ] || { echo "check: verdicts are for the model at the sync commit; covered code has drifted (exit 2)"; [ "$status" = 0 ] && status=2; }
exit "$status"

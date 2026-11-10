#!/usr/bin/env bash
# Drive journeys with Playwright against the launched instance and save evidence.
#   drive.sh <journey>...   journey = a file in .claude/skills/verify/journeys/
#                           (e.g. stock-crud.spec.ts) or an existing spec path
#                           relative to frontend/ (e.g. e2e/filter.spec.ts)
# Evidence: .verify-evidence/<run-id>/ (trace, screenshots, HTML report, logs).
set -euo pipefail
. "$(dirname "$0")/lib.sh"

[ $# -gt 0 ] || { echo "usage: drive.sh <journey>..." >&2; exit 2; }
"$(dirname "$0")/doctor.sh" >/dev/null || { echo "verify: doctor failed; run doctor.sh for details" >&2; exit 1; }
load_verify_env

run_id=$(date +%Y%m%d-%H%M%S)
evid="$EVIDENCE_ROOT/$run_id"
mkdir -p "$evid/screenshots"
# An interrupted run must not leave journeys inside frontend/e2e for the normal suite.
trap 'rm -rf "$SCRATCH_DIR"' EXIT

# Journeys live in the skill dir but must run from inside frontend/e2e so
# @playwright/test resolves from frontend/node_modules.
targets=()
for j in "$@"; do
  if [ -f "$SKILL_DIR/journeys/$j" ]; then
    mkdir -p "$SCRATCH_DIR"
    cp "$SKILL_DIR/journeys/$j" "$SCRATCH_DIR/$j"
    targets+=("e2e/verify-scratch/$j")
  else
    targets+=("$j")
  fi
done

status=0
(
  cd "$ROOT/frontend"
  VERIFY_EVIDENCE_DIR="$evid" \
  PLAYWRIGHT_HTML_OUTPUT_DIR="$evid/report" \
  PLAYWRIGHT_HTML_OPEN=never \
  ./node_modules/.bin/playwright test --project=mock --workers=1 --trace=on \
    --output="$evid/test-results" "${targets[@]}"
) 2>&1 | tee "$evid/playwright.log" || status=$?

cp "$STATE_DIR/backend.log" "$evid/backend.log" 2>/dev/null || true
cp "$STATE_DIR/frontend.log" "$evid/frontend.log" 2>/dev/null || true

echo "verify: evidence in $evid (exit $status)"
exit "$status"

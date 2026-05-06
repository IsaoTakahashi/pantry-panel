#!/usr/bin/env bash
# PostToolUse hook: edit/write した file path に応じて linter を実行する。
# - frontend/ 配下: biome check
# - backend/  配下: golangci-lint
# 該当しないファイル (ドキュメント等) は何もしない。

set -euo pipefail

repo_root="$(git -C "$CLAUDE_PROJECT_DIR" rev-parse --show-toplevel 2>/dev/null || echo "$CLAUDE_PROJECT_DIR")"

input="$(cat)"
file_path="$(echo "$input" | jq -r '.tool_input.file_path // empty')"

if [ -z "$file_path" ]; then
  exit 0
fi

case "$file_path" in
  "$repo_root"/frontend/*.ts | "$repo_root"/frontend/*.tsx | \
  "$repo_root"/frontend/*.js | "$repo_root"/frontend/*.jsx | \
  "$repo_root"/frontend/*.json | "$repo_root"/frontend/*.css)
    cd "$repo_root/frontend"
    npx --no-install biome check "$file_path" 1>&2 || exit 2
    ;;
  "$repo_root"/backend/*.go)
    cd "$repo_root/backend"
    pkg_dir="$(dirname "$file_path")"
    golangci-lint run "$pkg_dir" 1>&2 || exit 2
    ;;
  *)
    exit 0
    ;;
esac

#!/usr/bin/env bash
# PreToolUse hook: main ブランチへの直接 `git commit` をブロックする。
#
# fail-open 設計: このhookは Bash ツール呼び出し全件にマッチするため、
# 判定に失敗した場合（jq のパース失敗、git リポジトリ外での実行、
# コマンドが `git commit` を含まない等）は必ず exit 0 でコマンドの実行を許可する。
# `set -e` は使わない（予期しないエラーで意図せずブロック側に倒れることを避けるため）。
#
# ブロックするのは「現在のブランチが厳密に main」かつ「コマンドに git commit を含む」
# ことの両方が明確に確認できた場合のみ。

input="$(cat)"
command="$(echo "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)"

if [ -z "$command" ]; then
  # tool_input.command が取れない（jq 解析失敗含む）場合は fail-open
  exit 0
fi

case "$command" in
  *"git commit"*)
    ;;
  *)
    # git commit を含まないコマンドは対象外。大半の Bash 呼び出しはここで抜けるため、
    # git サブプロセスは git commit を含む場合にのみ起動する
    exit 0
    ;;
esac

repo_root="$(git -C "$CLAUDE_PROJECT_DIR" rev-parse --show-toplevel 2>/dev/null)"

if [ -z "$repo_root" ]; then
  # git リポジトリでない、または repo_root が解決できない場合は fail-open
  exit 0
fi

current_branch="$(git -C "$repo_root" rev-parse --abbrev-ref HEAD 2>/dev/null)"

if [ "$current_branch" = "main" ]; then
  {
    echo "エラー: main ブランチへの直接 commit はブロックされています。"
    echo "ブランチを切ってから再度コミットしてください（例: git checkout -b {issue番号}-{概要} && git commit ...）。"
    echo "緊急時など、どうしても main 上で commit が必要な場合は .claude/settings.json の"
    echo "PreToolUse フックエントリ（block-main-commit.sh）を一時的に無効化してください。"
  } >&2
  exit 2
fi

# main 以外のブランチ、またはブランチ判定に失敗した場合は fail-open
exit 0

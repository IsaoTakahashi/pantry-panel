## Why

過去のfeedbackメモリに、mainへの直接コミット（`feedback_branch_before_commit`）、archive順序ミス（`feedback_archive_before_merge`）、CI検証とローカルpassの混同（`feedback_ci_verification`）、デバッグ用一時コミット→revertパターン（git log上で複数回確認）といった、文章ルールとして既に明記されているにもかかわらず繰り返し発生してきた逸脱がある。これらは「ルールを増やす」だけでは防げない領域であり、仕組み（hook・CI）で機械的に防ぐ余地がある。

## What Changes

- `.claude/settings.json` にhookを追加し、mainブランチへの直接commitをローカルのClaude Codeセッション内でブロックする（既存の`.claude/hooks/lint-on-edit.sh`と同じPostToolUse/PreToolUseパターンに従う）
- `.claude/rules/general.md` のGit運用セクションに「調査用の一時コミット（`debug:`等）は本線に乗せず、原因特定後にまとめてコミットする」旨を追記する
- `.github/workflows/harness-check.yml` を新規追加し、PRのブランチ名が`{issue番号}-{概要}`形式か、PR本文に`Closes #N`があるかをチェックする。**advisory（警告のみ、マージブロックしない）として導入**し、既存のRepository Ruleset（id=16498487）は変更しない

## Capabilities

### New Capabilities

なし（新機能なし）

### Modified Capabilities

- `branch-pr-workflow`: ブランチ・PR運用ルールの遵守を、文章のみでなくローカルhookとCI adivsory checkでも支援する要件を追加する

## Impact

- `.claude/settings.json`（hook追加）
- `.claude/hooks/`配下に新規スクリプト追加（main直接commitブロック用）
- `.claude/rules/general.md`（デバッグコミット運用ルール追記）
- `.github/workflows/harness-check.yml`（新規、advisory）
- 既存のRepository Ruleset（id=16498487）・`bypass_actors`設定には触れない

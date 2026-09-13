## Context

`.claude/settings.json` には既に `PostToolUse` hook（`lint-on-edit.sh`、Write/Edit/MultiEditにマッチしlintを実行）が1つ存在する。今回追加する「main直接commit防止」は、commitが実行される**前**にブロックする必要があるため、`PreToolUse` hookとして`Bash`マッチャーに追加する。GitHub Actions側は、hookがバイパスされた場合（手動git操作、Claude Code外での操作）のセーフティネットとして、advisoryなブランチ名/`Closes #N`チェックを追加する。

## Goals / Non-Goals

**Goals:**
- Claude Codeセッション内でのmainへの直接commitを、hookで機械的にブロックする
- ブランチ名規則・`Closes #N`記載の逸脱を、CIで（ブロックせずに）検知しコメントで知らせる
- デバッグ用一時コミット→revertパターンを減らすための運用ルールを明文化する

**Non-Goals:**
- Repository Ruleset（id=16498487、`bypass_actors`）の変更は行わない
- Claude Codeセッション外（ユーザーが手元のgit CLIで直接操作するケース）でのローカルhookによる強制は範囲外（PreToolUse hookはClaude Codeのtool実行にしか効かない）
- 今回のCIチェックはadvisoryのため、違反があってもマージは妨げない

## Decisions

- **PreToolUse hookで`Bash`ツールをマッチし、`git commit`を含むコマンドかつ現在のブランチが`main`の場合にexit code 2でブロックする**: 既存の`lint-on-edit.sh`と同じ「stdinでtool_input.commandを受け取りcase文で判定する」パターンを踏襲する。exit 2はClaude Codeにエラーとして伝わり、コマンドは実行されない
- **hookはfail-openに設計する**: このhookは`Bash`ツール呼び出し全件にマッチするため、既存の`lint-on-edit.sh`（Write/Edit/MultiEditの一部拡張子のみ）よりブロック時の影響範囲が大きい。`set -e`のような「予期しないエラーで途中終了する」構成は避け、`jq`によるコマンド解析と`git rev-parse`によるブランチ判定の**両方が明確に「git commit」かつ「main」であると確認できた場合のみ**exit 2にし、それ以外（jqのパース失敗、gitリポジトリでない、ブランチ名取得失敗等）は必ずexit 0で通す
- **ブランチ判定は`git rev-parse --abbrev-ref HEAD`で行う**: `CLAUDE_PROJECT_DIR`から`git -C`で実行し、既存hookと同じrepo_root解決パターンに合わせる
- **GitHub ActionsのharnessチェックはPRイベントでのみ動作し、`exit 0`で常に成功させ、違反があれば`gh pr comment`相当（`github-script`かPR comment API）で警告コメントを残す**: advisory方針のため、job自体をfailさせない。将来requiredにする場合は、job自体をfailさせる形に切り替える
- **ブランチ名の正規表現は`^[0-9]+-[a-z0-9-]+$`とする**: general.mdの命名規則（`{issue番号}-{概要}`）に合わせる。`main`/`master`ブランチ自体（PRのheadにはならないため通常は該当しない）は対象外
- **デバッグコミット運用ルールはhook化せず文章ルールに留める**: 「調査用一時コミットか正式なコミットか」はコミット内容の意味論的判断が必要で、コミットメッセージのprefix（`debug:`等）だけでは機械的に防ぐと誤検知が多い。まずはgeneral.mdへの明記で様子を見る

## Risks / Trade-offs

- [リスク] PreToolUse hookが誤って正当なcommit（例: main上で緊急hotfixを許可された場合）までブロックする → [対策] hookのエラーメッセージに「ブランチを切ってください」という具体的な回避方法を明示し、正当な例外が必要な場合はhookを一時的に無効化する手順をコメントで示す
- [リスク] hookスクリプト自体のバグ（jqの解析エラー等）が、無関係な`Bash`コマンド全般を巻き添えでブロックする → [対策] fail-open設計（判定不能な場合は常にexit 0）を徹底し、実装後に`git`と無関係なコマンド（`ls`, `npm test`等）が影響を受けないことを確認する
- [リスク] 新設するCI workflowが`ci-hygiene` capability（全workflowに`permissions:`/PRトリガならconcurrency必須）に違反する → [対策] `harness-check.yml`にも`permissions: { contents: read, pull-requests: write }`（コメント投稿に必要な最小権限）と`concurrency: { group: ..., cancel-in-progress: true }`を明示する
- [リスク] 自分自身の作業ブランチが新設するブランチ名チェックに違反する可能性 → [対策] 実装時に自分のブランチ名を`harness-check.yml`のロジックで検証してから提出する

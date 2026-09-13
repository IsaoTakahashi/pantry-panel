## 1. main直接commit防止hook

- [x] 1.1 `.claude/hooks/block-main-commit.sh` を新規作成する。stdinから`tool_input.command`を受け取り、現在のブランチが`main`かつコマンドが`git commit`を含むと明確に確認できた場合のみexit code 2でブロックし、stderrに「ブランチを切ってください」というメッセージを出す。`set -e`は使わず、解析・判定に失敗した場合は必ずexit 0でfail-openする（`git commit`を含まないコマンド、jqのパース失敗、gitリポジトリ外実行を含む）
- [x] 1.2 `.claude/settings.json` の `hooks` に `PreToolUse`（matcher: `Bash`）エントリを追加し、上記スクリプトを登録する
- [x] 1.3 動作確認: (a) mainブランチ上で`git commit`を試行しブロックされること、(b) featureブランチ上では通常通りcommitできること、(c) `git commit`と無関係なコマンド（`ls`, `npm test`等）がmainブランチ上でも影響を受けずに実行できること、の3点を確認する（現在の作業ブランチを汚さないよう、`git worktree`で`main`を一時チェックアウトしてhookスクリプトを直接実行し検証した）

## 2. デバッグコミット運用ルールの追記

- [x] 2.1 `.claude/rules/general.md` の「ブランチ・Issue・PR の運用」セクションに、調査用一時コミットを本線に乗せない旨のルールを追記する

## 3. GitHub Actions advisory check

- [x] 3.1 `.github/workflows/harness-check.yml` を新規作成する。`pull_request`イベントで動作し、`permissions: { contents: read, pull-requests: write }`と`concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }`をtop-levelに明示する（ci-hygiene capability準拠）
- [x] 3.2 ブランチ名が`^[0-9]+-[a-z0-9-]+$`に一致するかをチェックするstepを追加する。不一致の場合はPRにコメントを投稿するが、job自体はexit 0で成功させる
- [x] 3.3 PR本文に`Closes #N`（`Closes #`に続く数字）が含まれるかをチェックするstepを追加する。含まれない場合はPRにコメントを投稿するが、job自体はexit 0で成功させる
- [x] 3.4 自分自身が本変更で使うブランチ名が、追加したチェックに違反していないか確認する（`291-git-guardrails`は`^[0-9]+-[a-z0-9-]+$`に一致することを確認済み）

## 4. 動作確認

- [ ] 4.1 意図的にブランチ名規則に違反するテストPR（または既存PRのdry-run）で警告コメントが投稿されることを確認する（PR作成・push後にCI上で確認が必要なため、このブランチのファイル変更のみでは未実施）
- [ ] 4.2 `gh pr checks`でharness-check jobがadvisory（fail扱いにならない）として表示されることを確認する（同上、PR作成・push後に確認が必要）

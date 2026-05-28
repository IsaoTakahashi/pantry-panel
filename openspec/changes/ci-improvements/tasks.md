## 1. permissions の明示 (最小権限化)

- [x] 1.1 `.github/workflows/ci.yml` の top-level に `permissions: { contents: read }` を追加する
- [x] 1.2 `.github/workflows/e2e.yml` の top-level に `permissions: { contents: read }` を追加する
- [x] 1.3 `.github/workflows/keep-warm.yml` の top-level に `permissions: {}` を追加する
- [x] 1.4 `.github/workflows/learning.yml` の top-level に `permissions: { contents: read }` を追加する
- [x] 1.5 deploy-backend.yml / preview-backend.yml / e2e-preview.yml は既に permissions が明示されているため変更なしを確認

## 2. concurrency ブロックの追加

- [x] 2.1 `.github/workflows/ci.yml` に `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }` を追加
- [x] 2.2 `.github/workflows/e2e.yml` に同様の concurrency を追加
- [x] 2.3 `.github/workflows/e2e-preview.yml` に同様の concurrency を追加
- [x] 2.4 `.github/workflows/learning.yml` に同様の concurrency を追加
- [x] 2.5 `.github/workflows/preview-backend.yml` に同様の concurrency を追加 (preview のみ、deploy-backend.yml は対象外)
- [x] 2.6 `.github/workflows/deploy-backend.yml` には concurrency を **付けない** ことを確認 (main の deploy を途中で止めないため)

## 3. ci.yml の Go module cache 有効化

- [x] 3.1 ci.yml の backend job の `actions/setup-go@v5` step に `cache: true` を追加する

## 4. ci.yml の paths-filter 導入

- [x] 4.1 `dorny/paths-filter@v3` を使う `changes` job を ci.yml の最初に追加する
  - `filters:` に `frontend: ['frontend/**', '.github/workflows/ci.yml']` と `backend: ['backend/**', '.github/workflows/ci.yml']` を定義
  - `outputs: { frontend, backend }` を expose
- [x] 4.2 `frontend` job に `needs: changes` と `if: needs.changes.outputs.frontend == 'true'` を追加する
- [x] 4.3 `backend` job に `needs: changes` と `if: needs.changes.outputs.backend == 'true'` を追加する
- [x] 4.4 (検証) main への push (`pull_request` ではない) 時も全 job が走るよう `if:` を `github.event_name == 'push' || needs.changes.outputs.<area> == 'true'` 形式にする

## 5. Docker buildx layer cache の追加

- [x] 5.1 (この時点では deploy-backend.yml と preview-backend.yml はまだ別ファイル) 暫定的に両方の `docker/build-push-action` に `cache-from: type=gha` / `cache-to: type=gha,mode=max` を追加する。**Section 7 で reusable workflow に統合した後、その reusable に集約**

## 6. dependabot.yml の作成

- [x] 6.1 `.github/dependabot.yml` を新規作成
- [x] 6.2 npm (`/frontend`), gomod (`/backend`), github-actions (`/`), docker (`/backend`) の 4 ecosystem を定義
- [x] 6.3 各 entry に `schedule: { interval: weekly, day: monday, time: "09:00", timezone: "Asia/Tokyo" }` を設定
- [x] 6.4 各 entry に `open-pull-requests-limit: 5` を設定
- [x] 6.5 各 entry に `groups: { minor-and-patch: { update-types: ["minor", "patch"] } }` を設定 (major は個別 PR になる)

## 7. reusable workflow `_deploy-backend.yml` への抽出

- [x] 7.1 `.github/workflows/_deploy-backend.yml` を新規作成
  - `on: workflow_call:` で起動
  - `inputs:` に `image-tag-suffix` (string, required), `lambda-function-name` (string, required), `lambda-function-url` (string, required), `git-ref` (string, optional, default '') を定義
  - `permissions: { id-token: write, contents: read }` を明示
- [x] 7.2 reusable workflow に既存の `build-and-push` / `deploy` / `smoke-test` ロジックを移植 (Section 5 の cache 設定もここに集約)
  - checkout: `inputs.git-ref` が空でなければ `ref:` で参照
  - image tag: `${{ inputs.image-tag-suffix }}` を活用
- [x] 7.3 `.github/workflows/deploy-backend.yml` を書き換え
  - 既存のジョブを削除し、`uses: ./.github/workflows/_deploy-backend.yml` の呼び出しに変更
  - `with: { image-tag-suffix: latest, lambda-function-name: ${{ vars.LAMBDA_FUNCTION_NAME }}, lambda-function-url: ${{ vars.LAMBDA_FUNCTION_URL }} }` を渡す
  - `permissions: { id-token: write, contents: read }` は呼び出し側にも残す (継承のため)
- [x] 7.4 `.github/workflows/preview-backend.yml` を書き換え
  - 既存のジョブを削除し、`uses: ./.github/workflows/_deploy-backend.yml` の呼び出しに変更
  - `with: { image-tag-suffix: pr-${{ github.event.pull_request.number }}, lambda-function-name: ${{ vars.PREVIEW_LAMBDA_FUNCTION_NAME }}, lambda-function-url: ${{ vars.PREVIEW_LAMBDA_FUNCTION_URL }}, git-ref: ${{ github.event.pull_request.head.sha }} }` を渡す
- [x] 7.5 PR の CI 上で reusable workflow がエラーなく解決されることを確認 (`gh workflow view`)

## 8. ドキュメント: Lambda resource policy 修正手順

- [ ] 8.1 `openspec/changes/ci-improvements/design.md` の Migration Plan セクションを再確認 (既に記載済み)
- [ ] 8.2 `.claude/rules/backend.md` (もしくは関連 doc) に「Lambda Function URL の resource policy は `lambda:InvokeFunctionUrl` のみで十分。`lambda:InvokeFunction` は不要」と追記する
- [ ] 8.3 マージ後の手動 apply 手順を README または design.md に明記 (`aws lambda remove-permission` コマンド例)

## 9. ローカル検証と E2E

- [ ] 9.1 `actionlint` (もしくは `act`) で全 workflow が YAML としてパース可能なことを確認 (ローカルに actionlint があれば)
- [ ] 9.2 reusable workflow の `uses: ./.github/workflows/_deploy-backend.yml` 参照が正しいことを `gh workflow list` / `gh workflow view _deploy-backend` で確認
- [ ] 9.3 PR の CI 上で ci.yml の paths-filter が期待どおりに動くことを `gh run view` で確認 (`frontend` 変更のみ / `backend` 変更のみ / workflow 変更を含む の 3 ケース)

## 10. CI 確認 (PR 上)

- [ ] 10.1 push 後、`gh pr checks --watch` で CI 結果を確認
- [ ] 10.2 CI が全て green になるまで修正を続ける
- [ ] 10.3 e2e.yml / e2e-preview.yml が引き続き走っていることを確認

## 11. アーカイブ

- [ ] 11.1 PR マージ前に `opsx:archive ci-improvements` を実行
- [ ] 11.2 archive のコミットも同じ feature ブランチに含める
- [ ] 11.3 PR をマージ
- [ ] 11.4 マージ後、ユーザーが Lambda resource policy の `lambda:InvokeFunction` を削除する手動 apply 作業を実施
- [ ] 11.5 削除後、`curl https://<function-url>/health` で 200 を確認

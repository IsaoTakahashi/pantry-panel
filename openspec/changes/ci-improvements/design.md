## Context

GitHub Actions の構成は action のバージョン (`actions/checkout@v6`, `setup-node@v6`, `setup-go@v5`, `golangci-lint-action@v7`, etc.) も OIDC 認証も最新で、メインの設計は健全。今回の改善は「運用ハイジーン」のレイヤで、以下の前提に立つ:

- frontend / backend のアプリケーションコードは触らない (CI 設定のみ)
- 既存の deploy/preview/ci の「機能」は変えない (キャッシュ・権限・concurrency の追加と、reusable workflow への分解は副作用ゼロを目指す)
- AWS の OIDC trust policy 自体は変更しない (audience 強化など別 scope)
- Lambda の resource policy 修正は AWS API 経由で実施し、検証 (smoke test) で 200 を確認する

主要な利害関係者は CI 実行時間を気にする開発者 (=ユーザー) と Lambda の権限を最小化したい運用視点。

## Goals / Non-Goals

**Goals:**
- CI 時間短縮: Go module cache を効かせて backend job を 30-60 秒短縮、Docker layer cache で deploy/preview の build を高速化
- セキュリティ強化: 全 workflow に最小 `permissions:` を明示、dependabot で脆弱性アップデートを自動化、Lambda の過剰な `InvokeFunction` 権限を削除
- 重複削減: deploy-backend / preview-backend の重複ロジックを reusable workflow へ抽出
- runner 効率化: concurrency で旧 run をキャンセル、paths-filter で不要な job をスキップ

**Non-Goals:**
- frontend / backend のアプリケーションコードの変更
- AWS の IAM Role trust policy 変更 (`audience` 強化, `subject` 制限の細分化)
- OpenTelemetry / structured logging / observability 系の追加 (Backend 改善 PR で扱う)
- 既存ジョブの並列度・matrix 戦略の変更
- E2E / Preview workflow の機能変更

## Decisions

### 1. permissions の明示はジョブ単位ではなく workflow 単位で行う

- **採用案**: workflow ファイル top-level に `permissions:` を書き、ジョブで上書きが必要な場合のみ override
- **理由**: 現状 ci.yml / e2e.yml / learning.yml は全 job が同じ権限で十分。workflow 単位の方が見通しが良い
- **代替案 (不採用)**: 各 job に細かく書く → DRY 違反、ミスが発生しやすい

### 2. ci.yml の paths-filter は `dorny/paths-filter` を使わず `paths:` トリガではなく **job-level の `if:` 判定 + dorny/paths-filter** で実装する

- **採用案**: `dorny/paths-filter@v3` を最初の job (`changes`) で実行し、後続の `frontend` / `backend` job が `if: needs.changes.outputs.frontend == 'true'` で起動判定
- **理由**: workflow level の `paths:` だと PR の status checks が不安定になる (skipped vs success の扱いがブランチ保護で問題)。job-level の skip にすれば status check は常に green/red で返る
- **代替案 (不採用)**: workflow 自体の `paths:` フィルタ → ブランチ保護の required check と相性が悪い

### 3. concurrency は全 PR トリガで `cancel-in-progress: true` にする

- **採用案**: `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }`
- **理由**: PR への push が連続した場合、新しい commit が古い run を完全置換するため旧 run の継続は無駄
- **例外**: `deploy-backend.yml` (main push) は cancel しない。途中 cancel すると ECR / Lambda の中間状態が残るリスク
- **代替案 (不採用)**: `cancel-in-progress: false` → resource 浪費継続

### 4. reusable workflow の interface 設計

- **採用案**: `.github/workflows/_deploy-backend.yml` (`_` prefix で reusable と明示) を作り、`workflow_call:` で以下を input
  ```yaml
  inputs:
    image-tag-suffix: { required: true, type: string }   # latest or pr-<n>
    lambda-function-name: { required: true, type: string }
    lambda-function-url: { required: true, type: string }
    git-ref: { required: false, type: string, default: '' }  # preview で PR head sha
  secrets:
    # OIDC を使うため secrets は不要だが、 vars を明示的に passthrough する場合に備える
  ```
- **理由**: vars (`AWS_ROLE_ARN`, `AWS_REGION`, `ECR_REGISTRY`, `ECR_REPOSITORY`) は呼び出し側が `secrets: inherit` で渡せる
- **代替案 (不採用)**: composite action → step 単位で再利用したいなら有効だが、今回は job 単位で再利用したいため reusable workflow が適切

### 5. Lambda IAM 変更の適用順序

- **採用案**: 
  1. PR で workflow 変更とドキュメント更新をマージ
  2. マージ後、ユーザーが AWS CLI / Console で resource policy を `lambda:InvokeFunctionUrl` のみに更新
  3. 既存の smoke test (deploy 時の `/health` 200 確認) が引き続き green なことで検証完了
- **理由**: IAM 変更は workflow 内で `aws lambda remove-permission` を毎回走らせると idempotency の管理が煩雑。「PR でドキュメント化 + 手動 apply」が確実
- **代替案 (不採用)**: workflow で IAM 自動修正 → 検出/適用ロジックが complex、誤適用リスクあり

### 6. dependabot の設定粒度

- **採用案**: 
  - npm (frontend), gomod (backend), github-actions (root), docker (backend) の 4 ecosystem
  - スケジュール: weekly (Monday 09:00 JST), `open-pull-requests-limit: 5`
  - `groups:` で minor/patch をまとめ、major は個別 PR
- **理由**: weekly + group で PR 過多を防ぐ。major は breaking 確認が必要なので個別

## Risks / Trade-offs

- **[Lambda resource policy 変更でアクセス不可リスク]** → smoke test で 200 確認後にマージ。失敗時は `lambda:InvokeFunction` を即座に復元する rollback 手順を design に記載
- **[reusable workflow 抽出での behavior 変化]** → 抽出前後で `gh workflow view` の差分と smoke test 結果を比較し、deploy 1 回分のログを目視確認する
- **[dependabot 大量 PR 発生]** → 初回有効化は PR マージの最後に実施 (archive 直前)。ユーザーに事前確認
- **[paths-filter で必要な job がスキップされるリスク]** → `paths:` の filter は `frontend/**` と `.github/workflows/ci.yml` の両方を含める (workflow 自体を編集した場合は必ず走るように)
- **[concurrency で running の deploy が cancel される]** → `deploy-backend.yml` には付けない。`preview-backend.yml` には付けるが group を PR-specific にして main の deploy には影響しない

## Migration Plan

1. **PR 作成と CI のみマージ前検証**: 全 workflow 変更を PR に乗せ、本 PR の CI 自体で新しい設定が動くことを確認
2. **smoke test**: PR が main にマージされ deploy-backend が走った後、`/health` が 200 で返ることを確認
3. **Lambda resource policy 変更**: マージ後、ユーザーが AWS Console で resource policy から `lambda:InvokeFunction` の Principal `*` を削除。直後に `curl https://<function-url>/health` で 200 確認
4. **dependabot 初回 PR の処理**: ユーザーが順次マージ判断

### 副作用に注意 (post-merge で個別対応)

- **GitHub branch protection の required status check 名が変化する**: reusable workflow への分解で deploy-backend / preview-backend の check 名が `build-and-push` / `deploy` / `smoke-test` から `deploy / build-and-push` / `deploy / deploy` / `deploy / smoke-test` (caller job 名 `deploy` を prefix) に変わる。現状 main の branch protection で当該 check を required にしていないため自動的な影響はないが、将来 required 化する際は新しい名前で登録する MUST。
- **Preview の ECR タグ命名が `pr-preview` → `pr-<PR番号>` に変わる**: 旧コードは全 PR が同じ `pr-preview` タグを上書きしていたが、新コードは PR ごとに `pr-<N>` タグを付与する。Lambda は SHA tag (`${{ github.sha }}`) で deploy するため Lambda 側の挙動には影響しないが、ECR 上の旧 `pr-preview` タグはガベージとして残る (定期 lifecycle policy で消すか手動削除)。

**Rollback**:
- workflow 変更: revert commit を main に push
- IAM 変更: `aws lambda add-permission --action lambda:InvokeFunction --principal '*' ...` で復元

### Post-merge manual apply: Lambda resource policy 修正

PR マージ後、ユーザーが以下の手順で本番 / preview Lambda の resource policy から `lambda:InvokeFunction` (Principal `*`) を削除する。詳細手順とロールバックは `.claude/rules/backend.md` 7 項を参照。

```bash
# 1. 現状確認
aws lambda get-policy --function-name pantry-panel-backend \
  --region ap-northeast-1 --query 'Policy' --output text | jq .

# 2. lambda:InvokeFunction の Principal=* の statement を削除
aws lambda remove-permission \
  --function-name pantry-panel-backend \
  --statement-id <該当 Sid> \
  --region ap-northeast-1

# 3. 200 確認 (失敗時は backend.md のロールバック手順)
curl -fsS "https://<function-url>/health"
```

preview Lambda (`pantry-panel-backend-preview`) も同様に処理する。

## Open Questions

- なし (Lambda resource policy 変更は本 PR ではドキュメント記載のみとし、実適用はマージ後の手動操作とする方針で合意済み)

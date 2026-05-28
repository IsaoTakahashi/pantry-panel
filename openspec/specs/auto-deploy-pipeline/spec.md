# auto-deploy-pipeline Specification

## Purpose
TBD - created by archiving change phase2-5d-auto-deploy. Update Purpose after archive.
## Requirements
### Requirement: Backend は main 自動デプロイを GitHub Actions で実行する
GitHub の `main` ブランチに push（merge）された時、Backend のコンテナイメージを ECR にビルド・push し、AWS Lambda に反映する SHALL。失敗時はワークフローが赤くなり、デプロイは中断する MUST。

#### Scenario: main への push で自動デプロイ
- **WHEN** PR が main にマージされる
- **THEN** GitHub Actions の `deploy-backend.yml` が実行される
- **AND** ECR に新しいイメージが push される（`linux/amd64` + `--provenance=false` で Lambda 互換 manifest）
- **AND** Lambda にデプロイが反映される（`update-function-code`）

#### Scenario: 手動実行も可能
- **WHEN** GitHub Actions の UI から `workflow_dispatch` でトリガーする
- **THEN** 同じデプロイフローが実行される

### Requirement: AWS 認証は OIDC を使用する
GitHub Actions が AWS にアクセスする際は **GitHub OIDC + IAM Role AssumeRoleWithWebIdentity** を MUST 使用する。長期有効なアクセスキーを GitHub Secrets に保存しない MUST。

#### Scenario: OIDC で認証
- **WHEN** ワークフローが AWS API を呼ぶ
- **THEN** `aws-actions/configure-aws-credentials@v4` で OIDC トークンから一時クレデンシャルを取得している

#### Scenario: アクセスキーが secrets に存在しない
- **WHEN** リポジトリの Secrets を確認する
- **THEN** `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` 等の長期クレデンシャルが存在しない

### Requirement: イメージタグは sha と latest の両方を付与する
ECR に push するイメージには `${{ github.sha }}` と `latest` の **両方** のタグを MUST 付与する。

#### Scenario: タグ付与
- **WHEN** ECR push が完了する
- **THEN** ECR コンソールでイメージに `latest` タグと `<commit-sha>` タグの両方が確認できる

### Requirement: Lambda 反映は update-function-code で行う
ECR push 後、`aws lambda update-function-code --function-name <name> --image-uri <uri>` コマンドで Lambda に反映する MUST。`LastUpdateStatus=Successful` を CLI で待ち合わせる SHALL。**deploy-backend.yml と preview-backend.yml の双方の Lambda 更新ロジックは reusable workflow `_deploy-backend.yml` に集約される MUST。**

#### Scenario: 明示的にコード更新
- **WHEN** ECR push が完了した直後
- **THEN** ワークフローが `aws lambda update-function-code` を実行する
- **AND** `aws lambda get-function` をポーリングして `LastUpdateStatus=Successful` を待つ (最大 5 分)

#### Scenario: reusable workflow に集約
- **WHEN** `deploy-backend.yml` と `preview-backend.yml` を確認する
- **THEN** `aws lambda update-function-code` を直接実行する step は存在せず、すべて `_deploy-backend.yml` の `uses:` 経由で呼び出されている

### Requirement: デプロイ後の smoke test
Lambda デプロイ完了後、Function URL に `/health` リクエストを送り 200 が返ることを SHALL 確認する。失敗時はワークフローを fail させる MUST。

#### Scenario: 正常時
- **WHEN** デプロイ完了直後に smoke test ステップが走る
- **THEN** `curl -fsS https://<function-url>/health` が 200 を返す
- **AND** ワークフローが緑で終了する

#### Scenario: 起動失敗時
- **WHEN** Backend が起動失敗で `/health` が 5 分以内に 200 を返さない
- **THEN** smoke test ステップが fail し、ワークフロー全体が赤になる

### Requirement: ワークフロー定義は `.github/workflows/deploy-backend.yml`
ファイルパスは `.github/workflows/deploy-backend.yml` MUST。**実際の build / deploy / smoke test ロジックは reusable workflow `.github/workflows/_deploy-backend.yml` に置き、`deploy-backend.yml` はトリガと inputs の specification のみを記述する。**

#### Scenario: ファイル存在
- **WHEN** リポジトリを確認する
- **THEN** `.github/workflows/deploy-backend.yml` が存在し、次の trigger を持つ:
  - `push.branches: [main]`
  - `workflow_dispatch:`

#### Scenario: reusable workflow ファイル存在
- **WHEN** リポジトリを確認する
- **THEN** `.github/workflows/_deploy-backend.yml` が存在し、`on: workflow_call:` を持つ

### Requirement: PR では本ワークフローは走らない
本ワークフローは PR では走らず main の push のみで走る MUST。PR の検証は既存 `ci.yml` / `e2e.yml` が担当する。

#### Scenario: PR では実行されない
- **WHEN** PR が作成・更新される
- **THEN** `deploy-backend.yml` は実行されない
- **AND** `ci.yml` と `e2e.yml` のみ走る

### Requirement: ECR build は GitHub Actions cache (gha) で layer cache を行う
`docker/build-push-action` を呼び出す全ての箇所で `cache-from: type=gha` と `cache-to: type=gha,mode=max` を MUST 指定する。

#### Scenario: deploy-backend (本番) の cache
- **WHEN** `.github/workflows/deploy-backend.yml` の `docker/build-push-action` ステップを確認する
- **THEN** `cache-from: type=gha` と `cache-to: type=gha,mode=max` が指定されている

#### Scenario: preview-backend の cache
- **WHEN** `.github/workflows/preview-backend.yml` の `docker/build-push-action` ステップを確認する
- **THEN** `cache-from: type=gha` と `cache-to: type=gha,mode=max` が指定されている

### Requirement: deploy-backend / preview-backend は reusable workflow を呼び出す
`.github/workflows/_deploy-backend.yml` (reusable workflow, `workflow_call:`) に ECR build/push・Lambda deploy・smoke test の共通ロジックを置き、`deploy-backend.yml` と `preview-backend.yml` は当該 reusable workflow を呼び出す形にする MUST。

#### Scenario: reusable workflow の存在
- **WHEN** `.github/workflows/_deploy-backend.yml` を確認する
- **THEN** `on: workflow_call:` で起動し、`inputs:` に少なくとも `lambda-function-name`, `lambda-function-url`, `image-tag-suffix` を持つ

#### Scenario: deploy-backend.yml は reusable を呼び出す
- **WHEN** `.github/workflows/deploy-backend.yml` を確認する
- **THEN** job が `uses: ./.github/workflows/_deploy-backend.yml` で reusable workflow を呼び出している
- **AND** `image-tag-suffix: latest` を inputs に渡す

#### Scenario: preview-backend.yml は reusable を呼び出す
- **WHEN** `.github/workflows/preview-backend.yml` を確認する
- **THEN** job が `uses: ./.github/workflows/_deploy-backend.yml` で reusable workflow を呼び出している
- **AND** `image-tag-suffix: pr-${{ github.event.pull_request.number }}` を inputs に渡す


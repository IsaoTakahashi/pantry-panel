## ADDED Requirements

### Requirement: Backend は main 自動デプロイを GitHub Actions で実行する
GitHub の `main` ブランチに push（merge）された時、Backend のコンテナイメージを ECR にビルド・push し、AWS App Runner に反映する SHALL。失敗時はワークフローが赤くなり、デプロイは中断する MUST。

#### Scenario: main への push で自動デプロイ
- **WHEN** PR が main にマージされる
- **THEN** GitHub Actions の `deploy-backend.yml` が実行される
- **AND** ECR に新しいイメージが push される
- **AND** App Runner にデプロイが反映される

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

### Requirement: App Runner 反映は StartDeployment で明示的に行う
ECR push 後、`aws apprunner start-deployment --service-arn ...` コマンドで App Runner に反映する MUST。完了を CLI で待ち合わせる SHALL。

#### Scenario: 明示的に Deployment 開始
- **WHEN** ECR push が完了した直後
- **THEN** ワークフローが `aws apprunner start-deployment` を実行する
- **AND** `aws apprunner wait` または同等のポーリングでデプロイ完了を待つ

### Requirement: デプロイ後の smoke test
App Runner デプロイ完了後、サービス URL に `/health` リクエストを送り 200 が返ることを SHALL 確認する。失敗時はワークフローを fail させる MUST。

#### Scenario: 正常時
- **WHEN** デプロイ完了直後に smoke test ステップが走る
- **THEN** `curl -fsS https://<service-url>/health` が 200 を返す
- **AND** ワークフローが緑で終了する

#### Scenario: 起動失敗時
- **WHEN** Backend が起動失敗で `/health` が 5 分以内に 200 を返さない
- **THEN** smoke test ステップが fail し、ワークフロー全体が赤になる

### Requirement: ワークフロー定義は `.github/workflows/deploy-backend.yml`
ファイルパスは `.github/workflows/deploy-backend.yml` MUST。

#### Scenario: ファイル存在
- **WHEN** リポジトリを確認する
- **THEN** `.github/workflows/deploy-backend.yml` が存在し、次の trigger を持つ:
  - `push.branches: [main]`
  - `workflow_dispatch:`

### Requirement: PR では本ワークフローは走らない
本ワークフローは PR では走らず main の push のみで走る MUST。PR の検証は既存 `ci.yml` / `e2e.yml` が担当する。

#### Scenario: PR では実行されない
- **WHEN** PR が作成・更新される
- **THEN** `deploy-backend.yml` は実行されない
- **AND** `ci.yml` と `e2e.yml` のみ走る

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Lambda 反映は update-function-code で行う
ECR push 後、`aws lambda update-function-code --function-name <name> --image-uri <uri>` コマンドで Lambda に反映する MUST。`LastUpdateStatus=Successful` を CLI で待ち合わせる SHALL。**deploy-backend.yml と preview-backend.yml の双方の Lambda 更新ロジックは reusable workflow `_deploy-backend.yml` に集約される MUST。**

#### Scenario: 明示的にコード更新
- **WHEN** ECR push が完了した直後
- **THEN** ワークフローが `aws lambda update-function-code` を実行する
- **AND** `aws lambda get-function` をポーリングして `LastUpdateStatus=Successful` を待つ (最大 5 分)

#### Scenario: reusable workflow に集約
- **WHEN** `deploy-backend.yml` と `preview-backend.yml` を確認する
- **THEN** `aws lambda update-function-code` を直接実行する step は存在せず、すべて `_deploy-backend.yml` の `uses:` 経由で呼び出されている

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

## Why

Phase 2.5b で Backend を Lambda に手動デプロイし、Phase 2.5c で Frontend が Vercel に自動デプロイされる状態にした。最後のステップとして、Backend も main へのマージで自動デプロイされる体制を作る。手動 ECR push を不要にし、デプロイの再現性とフィードバックループを向上させる。

## What Changes

- GitHub Actions ワークフロー `.github/workflows/deploy-backend.yml` を新規作成する
  - Trigger: `push` to `main`、`workflow_dispatch`（手動実行も可）
  - Job 1 `build-and-push`: backend の Docker image を build → ECR に push（タグ: `${{ github.sha }}` と `latest`）
  - Job 2 `deploy`: `aws lambda update-function-code` で新イメージを反映、`LastUpdateStatus=Successful` まで待つ
  - Job 3 `smoke-test`: デプロイ完了後 `curl https://<service-url>/health` で 200 を確認
- AWS 認証は **OIDC (GitHub OIDC Provider + IAM Role AssumeRoleWithWebIdentity)** を使用する（アクセスキーをリポジトリ Secrets に置かない方式）
- IAM Role 作成と GH Actions Secrets / Variables 登録（ユーザー作業）
- 既存 `ci.yml` の backend ジョブとは独立に動作する（PR では実行しない、main push のみ）
- README にデプロイフローと rollback 手順を記載する

## Capabilities

### New Capabilities

- `auto-deploy-pipeline`: main へのマージで Backend が自動的に ECR build → push → Lambda update-function-code → smoke test まで実行される CI/CD フロー

### Modified Capabilities

（なし）

## Impact

- 新規ファイル: `.github/workflows/deploy-backend.yml`
- 既存 ci.yml は変更なし
- AWS 側: GitHub OIDC Provider 登録、IAM Role（ECR push + `lambda:UpdateFunctionCode` / `lambda:GetFunction` 権限）
- GitHub Secrets / Variables: `AWS_REGION`、`AWS_ROLE_ARN`、`ECR_REPOSITORY`、`APP_RUNNER_SERVICE_ARN` を登録
- ドキュメント更新
- Vercel のデプロイは Phase 2.5c で既に自動化済み（追加作業なし）

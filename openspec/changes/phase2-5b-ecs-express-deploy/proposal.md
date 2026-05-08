## Why

Phase 2.5a で Supabase に DB を立ち上げた次のステップとして、Backend を **AWS ECS Express Mode** にデプロイし、外部から HTTPS で到達可能な API として常時稼働させる。Phase 3 で WebSocket + LISTEN/NOTIFY を本番検証する土台でもある（ECS Express は Fargate + ALB ベースで WebSocket をサポート、Supabase Direct Connection 可）。

> 当初は **AWS App Runner** を採用予定だったが、2026-04-30 を境に新規受付が停止されたため、AWS が公式に推奨する移行先である ECS Express Mode に切替えた。Dockerfile および `main.go` の env 駆動化はどちらの方式でもそのまま流用できるため、Phase 2.5b の Section 1〜3 の成果物に変更はない。

## What Changes

- Backend の **Dockerfile** を作成する（multi-stage build、Alpine ベース、static binary）
- `backend/main.go` の HTTP リッスンポートを `PORT` 環境変数駆動にする
- `backend/main.go` の CORS 設定を `CORS_ALLOWED_ORIGINS` 環境変数（カンマ区切り）駆動にする
- AWS ECR リポジトリを `ap-northeast-1` に作成する（ユーザー手作業）
- ローカルから ECR にイメージを **手動 push** して動作確認する（自動化は Phase 2.5d）
- AWS ECS Express Mode サービスを作成し、ECR からデプロイする（ユーザー手作業）
  - Region: `ap-northeast-1`
  - CPU/Memory: ECS Express の最小構成（目安 0.25 vCPU / 0.5 GB、許容最小値に合わせる）
  - 環境変数: `PORT`、`CORS_ALLOWED_ORIGINS`
  - 環境変数 (Secret): `DATABASE_URL`（AWS Secrets Manager 経由）
  - Health check path: `/health`
- 必要な IAM Role を準備する（Task execution role、Express 用 Infrastructure role）
- ECS Express が払い出す `*.ecs.ap-northeast-1.on.aws` URL から `/health` と `/api/stock-items` が応答することを確認する

## Capabilities

### New Capabilities

- `production-backend-runtime`: Backend が AWS ECS Express Mode（Fargate + 共有 ALB）で常時稼働し HTTPS で到達可能であること、コンテナ運用に必要な設定（Dockerfile・PORT・CORS 駆動）を定義する

### Modified Capabilities

（なし）

## Impact

- 新規ファイル: `backend/Dockerfile`、`backend/.dockerignore`
- 変更: `backend/main.go`（PORT・CORS の env 駆動化）、`backend/main_test.go`（追加）
- 新規 AWS リソース: ECR repository、ECS Express Mode service（IaC 化はせず、初回はコンソール / CLI 作業で記録のみ）
- 新規 IAM Role 2 つ: `ecsTaskExecutionRole`（既存があれば再利用）と Express 用 Infrastructure role
- AWS Secrets Manager: `DATABASE_URL` を保管
- AWS コスト目安: Fargate 0.25 vCPU / 0.5 GB 24h + ALB（~$16/月、他 Express サービスと共有可）+ CloudWatch logs ≈ 月 $20 程度（App Runner $5/月 より高め）
- ドキュメント: ECR push 手順、ECS Express 設定手順、Secrets Manager の利用方法

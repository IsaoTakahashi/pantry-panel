## Why

Phase 2.5a で Supabase に DB を立ち上げた次のステップとして、Backend を AWS App Runner にデプロイし、外部から HTTPS で到達可能な API として常時稼働させる。Phase 3 で WebSocket + LISTEN/NOTIFY を本番検証する土台でもある（App Runner は WebSocket をサポート、direct connection 可）。

## What Changes

- Backend の **Dockerfile** を作成する（multi-stage build、Alpine ベース、static binary）
- `backend/main.go` の HTTP リッスンポートを `PORT` 環境変数駆動にする（App Runner デフォルト 8080 互換）
- `backend/main.go` の CORS 設定を `CORS_ALLOWED_ORIGINS` 環境変数（カンマ区切り）駆動にする
- AWS ECR リポジトリを `ap-northeast-1` に作成する（ユーザー手作業）
- ローカルから ECR にイメージを **手動 push** して動作確認する（自動化は Phase 2.5d）
- AWS App Runner サービスを作成し、ECR からデプロイする（ユーザー手作業）
  - Region: `ap-northeast-1`
  - Instance: 0.25 vCPU / 0.5 GB
  - 環境変数: `DATABASE_URL`、`PORT`、`CORS_ALLOWED_ORIGINS`
  - Health check: `/health` を使用
- App Runner のサービス URL（`*.awsapprunner.com`）から `/health` と `/api/stock-items` が応答することを確認する

## Capabilities

### New Capabilities

- `production-backend-runtime`: Backend が AWS App Runner 上で常時稼働し HTTPS で到達可能であること、コンテナ運用に必要な設定（Dockerfile・PORT・CORS 駆動）を定義する

### Modified Capabilities

（なし — Phase 2.5a で導入する `production-database` の前提を引き継ぐが、要件追加は別 capability で扱う）

## Impact

- 新規ファイル: `backend/Dockerfile`、`.dockerignore`
- 変更: `backend/main.go`（PORT・CORS の env 駆動化）
- 新規 IaC リソース: ECR repository、App Runner service（IaC コード化はせず、初回はコンソール作業で記録のみ）
- AWS コスト: ~$5/月（0.25 vCPU / 0.5 GB / 24h 稼働）
- ドキュメント: ECR push 手順、App Runner 設定手順

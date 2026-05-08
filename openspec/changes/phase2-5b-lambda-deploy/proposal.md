## Why

Phase 2.5a で Supabase に DB を立ち上げた次のステップとして、Backend を **AWS Lambda + Lambda Web Adapter (LWA) + Function URL** にデプロイし、外部から HTTPS で到達可能な API として公開する。Free Tier に収まる構成のため、コスト目安は月 **\$0**（個人 / 家族用途）。

> 経緯: 当初は AWS App Runner、次に ECS Express Mode を試行したが、それぞれ「新規受付停止」「Fargate vCPU クォータブロック」「最小構成で月 ~\$30 と高コスト」の問題があり、最終的に **Phase 3 のリアルタイム同期を Supabase Realtime（frontend 直接購読）に再設計** することで Backend の WebSocket 要件を撤廃し、ステートレス HTTP 配信に振った。これにより Lambda が選択可能になった。

> 注意: この方針転換は **`specs/features.md` の Phase 3 / Phase 3.5** にも影響する。Phase 3（自前 WebSocket）は **学習目的のローカル実装専用** に格下げし、本番のリアルタイム機構は Phase 3.5（Supabase Realtime）に集約する。詳細は本 change の Migration Plan を参照。

## What Changes

- Backend の `backend/Dockerfile` に **Lambda Web Adapter レイヤ** を追加する（ECR 上に push されるイメージはそのまま Lambda container image として利用可能）
- Lambda Function (container image source) を ECR から作成する（ユーザー手作業、初回のみコンソール / CLI）
  - Region: `ap-northeast-1`
  - Memory: 512 MB（最小構成）
  - Timeout: 30 秒
  - 環境変数: `PORT=8080`、`CORS_ALLOWED_ORIGINS`、`AWS_LWA_PORT=8080`、`AWS_LWA_READINESS_CHECK_PATH=/health`
  - 環境変数 (Secret): `DATABASE_URL`（AWS Secrets Manager 経由）
- Lambda Function URL を有効化する（パブリック / 認可なし、Phase 2.5c で CORS と組合せ）
- Lambda 実行用 IAM Role を準備する（ECR pull / CloudWatch Logs / Secrets Manager 読取）
- 既存資源の整理:
  - ECR repository `pantry-panel-backend` は流用
  - Secrets Manager `pantry-panel/DATABASE_URL` は流用
  - 既存 IAM `ecsTaskExecutionRole` は **削除または流用**（Lambda execution role と権限がほぼ重複）
  - 既存 IAM `ecsInfrastructureRoleForExpressServices` は **削除**（Lambda 不要）
- `specs/features.md` の Phase 3 / 3.5 を再構成する（Phase 3 = 学習専用、Phase 3.5 = 本番のリアルタイム機構）
- 動作確認: ローカル Frontend を `NEXT_PUBLIC_API_URL=https://<function-url>` に切り替えて CRUD と wantToBuy トグルが動くこと

## Capabilities

### New Capabilities

- `production-backend-runtime`: Backend が AWS Lambda（container image source、Lambda Web Adapter 経由）で実行され、Function URL で HTTPS 到達可能な要件を定義する

### Modified Capabilities

（なし — 旧 `phase2-5b-app-runner-deploy` 提案では同名 capability の `New` を出していたが、実装前に廃棄したため衝突なし）

## Impact

- 変更: `backend/Dockerfile`（Lambda Web Adapter レイヤ追加）
- 変更: `backend/main.go`（PORT・CORS の env 駆動化、既に PR で実装済の内容を再利用）
- 変更: `backend/main_test.go`（既に実装済の内容を再利用）
- 新規 AWS リソース: Lambda Function（container image）、Function URL、Lambda execution role
- 削除予定 AWS リソース: `ecsInfrastructureRoleForExpressServices`（既存）、`ecsTaskExecutionRole`（任意）
- 流用 AWS リソース: ECR repository、Secrets Manager
- ドキュメント: ECR push 手順、Lambda Function 作成手順、Function URL の取得手順、IAM Role 設計、Phase 3/3.5 の再定義
- AWS コスト目安: **\$0/月**（Free Tier、リクエスト数 100 万/月以下、コンピュート 400,000 GB-秒/月以下）

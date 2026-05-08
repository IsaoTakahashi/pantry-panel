## 1. Issue・ブランチ準備

- [x] 1.1 GitHub Issue を作成する（タイトル: "Phase 2.5b: Backend を AWS ECS Express Mode にデプロイ"）
- [x] 1.2 Issue 番号ベースのブランチを作成する
- [x] 1.3 Draft PR を作成する

## 2. Backend のコード対応

- [x] 2.1 `backend/main.go` の `e.Start(":8080")` を `os.Getenv("PORT")` 駆動にする（未設定時 8080）
- [x] 2.2 `backend/main.go` の `AllowOrigins` を `CORS_ALLOWED_ORIGINS`（カンマ区切り、未設定時 `http://localhost:3000`）駆動にする
- [x] 2.3 既存の Go ユニットテストが通ることを確認する
- [x] 2.4 `backend/main.go` の env 解析部分に必要に応じてユニットテストを追加する（`strings.Split` の空文字ハンドリング等）

## 3. Dockerfile / .dockerignore 作成

- [x] 3.1 `backend/Dockerfile`（multi-stage、builder: golang:1.26-alpine、final: alpine:3、static binary）を作成する
- [x] 3.2 `backend/.dockerignore` を作成する（go test artifacts、`.git`、`.serena`、テストデータ等を除外）
- [x] 3.3 `docker build -t pantry-panel-backend:local backend/` でビルド成功することを確認する
- [x] 3.4 ローカル Postgres に接続して `docker run -p 8080:8080 -e DATABASE_URL=...` で起動し `/health` が 200 を返すことを確認する

## 4. AWS ECR 作成と push（ユーザー作業）

- [ ] 4.1 AWS ECR で `pantry-panel-backend` リポジトリを `ap-northeast-1` に作成する
- [ ] 4.2 ECR ログイン（`aws ecr get-login-password ... | docker login ...`）
- [ ] 4.3 Apple Silicon ホストでは `docker build --platform linux/amd64 -t pantry-panel-backend:local backend/` でリビルドする
- [ ] 4.4 イメージにタグを付けて push する（タグ: `v0.1.0` と `latest`）
- [ ] 4.5 ECR コンソールで push されたイメージ（`linux/amd64`）を確認する

## 5. AWS Secrets Manager に DATABASE_URL を登録（ユーザー作業）

- [ ] 5.1 Secrets Manager で `pantry-panel/DATABASE_URL` 等の名前で新規シークレットを作成する
- [ ] 5.2 値に Phase 2.5a の Supabase Direct Connection 接続文字列（`?sslmode=require` 込み）を保存する
- [ ] 5.3 シークレットの ARN を控える

## 6. IAM Role 準備（ユーザー作業）

- [ ] 6.1 `ecsTaskExecutionRole`（既存があれば再利用）が次の権限を持つことを確認する
  - `AmazonECSTaskExecutionRolePolicy`（マネージド、ECR pull + CloudWatch logs）
  - Secrets Manager の対象 ARN を `secretsmanager:GetSecretValue` できるインラインポリシー
- [ ] 6.2 `ecsInfrastructureRoleForExpressServices`（Express 初回作成時に AWS が提案、または手動作成）が次のサービスを管理できることを確認する
  - ALB / Target Group の作成・更新
  - VPC / Subnet / Security Group の作成
  - Auto Scaling の設定
- [ ] 6.3 両 Role の ARN を控える

## 7. ECS Express Mode サービス作成（ユーザー作業）

- [ ] 7.1 `aws ecs create-express-gateway-service` の help を確認し、`--primary-container` で `image` / `containerPort` / `environment` / `secrets` をどう指定するかを把握する
  - `aws ecs create-express-gateway-service help`
- [ ] 7.2 サービスを作成する（最小構成、CLI 推奨。コンソール作成も可）
  ```bash
  aws ecs create-express-gateway-service \
    --service-name pantry-panel-backend \
    --region ap-northeast-1 \
    --execution-role-arn <task-execution-role-arn> \
    --infrastructure-role-arn <infra-role-arn> \
    --primary-container '{
      "image": "<account-id>.dkr.ecr.ap-northeast-1.amazonaws.com/pantry-panel-backend:latest",
      "containerPort": 8080,
      "environment": [
        {"name": "PORT", "value": "8080"},
        {"name": "CORS_ALLOWED_ORIGINS", "value": "http://localhost:3000"}
      ],
      "secrets": [
        {"name": "DATABASE_URL", "valueFrom": "<secrets-manager-arn>"}
      ]
    }' \
    --health-check-path "/health" \
    --scaling-target '{"minTaskCount":1,"maxTaskCount":1}' \
    --monitor-resources
  ```
  - `--cpu` / `--memory` の単位は help で確認、最小構成（Fargate の minimum: 0.25 vCPU / 0.5 GB 相当）を狙う
- [ ] 7.3 `--monitor-resources` の出力でデプロイ進行を確認、稼働開始まで待つ
- [ ] 7.4 サービス URL（`*.ecs.ap-northeast-1.on.aws`）を控える

## 8. 動作確認

- [ ] 8.1 `curl -i https://<service-url>/health` が 200 を返すことを確認する
- [ ] 8.2 ローカル Frontend を `NEXT_PUBLIC_API_URL=https://<service-url>` で起動し、商品 CRUD と wantToBuy トグルが動作することを確認する
- [ ] 8.3 Supabase SQL Editor で実データが書き込まれていることを確認する
- [ ] 8.4 CloudWatch Logs でリクエストが処理されていることを確認する

## 9. ドキュメント更新

- [ ] 9.1 `README.md` または `.claude/rules/backend.md` に ECR push 手順と ECS Express 設定手順をまとめる
- [ ] 9.2 ロールバック手順（`update-express-gateway-service` で旧タグへ戻す）を記載する
- [ ] 9.3 `specs/features.md` の Phase 2.5 セクションを更新する（2.5b 完了マーク、ホスティングを App Runner → ECS Express に書き換え）

## 10. 仕上げ

- [ ] 10.1 CI（lint + tsc + vitest + go test）がすべてパスすることを確認する
- [ ] 10.2 PR を ready for review にして、Issue を `Closes #N` でリンクする
- [ ] 10.3 マージ後に `openspec archive phase2-5b-ecs-express-deploy` で archive する

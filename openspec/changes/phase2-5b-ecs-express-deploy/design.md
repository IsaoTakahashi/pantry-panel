## Context

Phase 2.5a で Supabase 上に DB が立ち上がっている。Backend をローカル稼働で本番 DB に接続できる状態だが、Frontend からは到達できない（localhost のみ）。

当初の計画では AWS App Runner を採用する予定だったが、AWS は 2026-04-30 を境に App Runner の **新規受付を停止** し、移行先として **Amazon ECS Express Mode** を公式推奨している（[announcement](https://aws.amazon.com/about-aws/whats-new/2025/11/announcing-amazon-ecs-express-mode/)）。

ECS Express Mode は ECS Fargate + ALB + Auto Scaling + CloudWatch を「3 つの入力（コンテナイメージ、Task execution role、Infrastructure role）」だけで自動構成する仕組みで、App Runner の代替として位置づけられている。Phase 3 で WebSocket を本番検証するための要件（常時稼働 + WebSocket 対応 + Tokyo リージョン）はすべて満たす。

## Goals / Non-Goals

**Goals:**
- Backend のコンテナイメージが ECR に存在する
- ECS Express Mode サービスが ECR イメージから稼働している
- 外部 HTTPS リクエストで `/health` と CRUD API が応答する
- 環境変数（`DATABASE_URL` / `PORT` / `CORS_ALLOWED_ORIGINS`）が正しく注入されている
- `DATABASE_URL` は Secrets Manager 経由で渡し、Task 定義に平文を残さない

**Non-Goals:**
- 自動デプロイ（Phase 2.5d）
- Frontend のデプロイ（Phase 2.5c）
- カスタムドメイン（Express が払い出す `*.ecs.ap-northeast-1.on.aws` で開始）
- IaC 化（Terraform / CDK）— 初回はコンソール / CLI、運用が安定してから検討
- Blue/Green デプロイ・カナリアリリース — Express Mode のローリング更新で十分
- 監視・アラート（CloudWatch アラーム）の整備 — 別 change で扱う

## Decisions

### コンテナ配信モード: ECR + ECS Express Mode

GH Actions（Phase 2.5d）または手動で ECR に push したイメージを、ECS Express が pull して Fargate タスクとして実行する。

- **採用理由**:
  - イメージタグで明示的にバージョン管理できる（rollback も `update-express-gateway-service --primary-container.image=...` で簡単）
  - GH Actions 側でビルド時間が見える
  - App Runner と同じ運用感（ECS Express は `aws ecs create-express-gateway-service` 単発コマンドで担保）
- **代替案**:
  - 通常の ECS Fargate + ALB + Target Group を全部手で組む → 学習量が多すぎる、Phase 2.5 のスコープを越える
  - Lambda + API Gateway WebSocket → サーバーレス化のリアーキが必要、Echo の常駐前提と合わない

### Dockerfile: multi-stage + alpine（Phase 2.5b 元プランから流用）

`golang:1.26-alpine` でビルドし、`alpine:3` に static binary をコピー。**`linux/amd64`** プラットフォームで Fargate と整合する（Apple Silicon ホストでビルドする場合 `--platform linux/amd64` が必要）。

- **採用理由**: イメージサイズ小、攻撃面小、`sh` 入りでデバッグ可
- **ARM64 (Graviton)**: ECS Express + Fargate Graviton は理論上可能だが、初回は `linux/amd64` で揃えることで踏み抜きリスクを最小化（ARM 化は別 change で評価）

### Express Mode の利用方法: AWS CLI

AWS CLI で `aws ecs create-express-gateway-service` を使う。コンソールでも作成可能だが、CLI のほうが手順を README に残しやすい。

- **採用理由**: コマンドが宣言的・再現性が高い、CI 化（Phase 2.5d）への移行が容易

### CPU/Memory: 最小構成

Fargate の最小値は 0.25 vCPU / 0.5 GB。ECS Express Mode が同等の最小値をサポートする想定（Open Question 参照）。

- **採用理由**: 個人 / 家族用途、トラフィックは1日数十リクエスト想定で十分

### Auto-scaling: 最小に固定 (min=max=1)

Phase 3 の LISTEN/NOTIFY を考えると、複数インスタンスにスケールアウトすると pub/sub の振り分けが追加で必要になる。

- **採用理由**: Phase 3 の自前 WebSocket 実装の前提を崩さない、コスト最小化、Direct Connection のコネクション枯渇回避

### Health check: `/health` を使用

ECS Express の `--health-check-path` パラメータで指定する。既存の Echo `/health` エンドポイントが DB ping を含むため、DB 切断にも気づける。

### `DATABASE_URL` は Secrets Manager 経由

ECS タスク定義の `secrets` 機構（`valueFrom`）で Secrets Manager の ARN を参照する。`environment` フィールドに平文では入れない。

- **採用理由**: コンソールの環境変数欄に平文で出ない、ローテーション可能、最小権限の Task execution role で参照可
- **代替案**:
  - SSM Parameter Store → 同等の機能でこちらの方が安価。将来評価
  - 平文 env → セキュリティ NG

### `PORT` / `CORS_ALLOWED_ORIGINS` は通常 env で注入

機密性が低いため平文 env で十分。`--primary-container '{"environment":[...]}' ` で渡す。

### URL: ECS Express のサービス標準ドメインを使用

`https://<service-id>.ecs.ap-northeast-1.on.aws` 形式の AWS が払い出す URL を使う。Phase 2.5c の Vercel の `CORS_ALLOWED_ORIGINS` 更新もこの URL を使う。

## Risks / Trade-offs

- **App Runner より高コスト** → ALB 部分（~$16/月）が独立で発生（Express サービスを複数立てる場合は ALB 共有でならせる）。個人運用では月 $20 程度。許容範囲内。
- **ECS Express Mode は新しめの機能（2025-11 GA）** → 知識・運用ノウハウが App Runner ほど成熟していない。トラブル時は AWS docs / re:Post に依存。
- **環境変数 / secrets の更新でタスク再起動が起きる** → 短い瞬断あり。個人利用では問題なし。
- **Infrastructure role の作成が初回のみ必要** → AWS が `ecsInfrastructureRoleForExpressServices` を準備手順で提案。手順書化が必須。
- **rollback はタグ指定 → 手順書化が必須** → README に手順を残す。

## Migration Plan

1. ローカルで Dockerfile を書き、`docker build && docker run` で動作確認 ✅ (済 — Section 3)
2. ECR リポジトリ作成（ユーザー、コンソールまたは AWS CLI）
3. ローカルから ECR に push（手動、`linux/amd64` でビルド）
4. AWS Secrets Manager に `DATABASE_URL` を登録（ユーザー）
5. IAM Role 準備（ユーザー）
   - `ecsTaskExecutionRole`（既存があれば再利用、Secrets Manager の Read 権限を追加）
   - `ecsInfrastructureRoleForExpressServices`（Express 初回作成時に AWS が提案、または手動作成）
6. `aws ecs create-express-gateway-service` でサービス作成（ユーザー）
   - `--primary-container` で image / port / env / secrets を指定
   - `--cpu` / `--memory` で最小構成
   - `--health-check-path /health`
   - `--scaling-target` で min=max=1
7. デプロイ完了後、サービス URL を取得（`*.ecs.ap-northeast-1.on.aws`）
8. ローカル Frontend で `NEXT_PUBLIC_API_URL=https://<express-url>` に切り替えて動作確認
9. 確認 OK なら Phase 2.5c に進む

ロールバック:
- 失敗時はサービス削除（`aws ecs delete-express-gateway-service`）で課金停止
- 後方デプロイは旧イメージタグで `update-express-gateway-service --primary-container.image=...:<old-sha>` を実行
- コードは branch なので merge しなければ影響なし

## Open Questions

これらは実装中に AWS docs / CLI help を確認しつつ決定する:

- ECS Express Mode の **CPU/Memory の最小値**（0.25 vCPU / 0.5 GB が許容されるか）
- `--cpu` / `--memory` の値の単位（vCPU 整数なのか、Fargate のような 256/512/1024 単位なのか、それとも 0.25 等の小数）
- ECS Express が Fargate **Graviton (ARM64)** をサポートするか
- Secrets Manager の `valueFrom` フォーマットが `aws ecs create-express-gateway-service` の `--primary-container` JSON でどう書かれるか
- ALB の **共有戦略**（同じネットワーク設定の他 Express サービスと自動共有される）に伴うコスト分配の挙動
- ECS Express の更新方式（rolling のみか、blue/green も選べるか）

## References

- [Amazon ECS Express Mode overview](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-overview.html)
- [Announcing Amazon ECS Express Mode (2025-11)](https://aws.amazon.com/about-aws/whats-new/2025/11/announcing-amazon-ecs-express-mode/)
- [Build production-ready applications with Amazon ECS Express Mode (AWS Blog)](https://aws.amazon.com/blogs/aws/build-production-ready-applications-without-infrastructure-complexity-using-amazon-ecs-express-mode/)
- [re:Invent 2025 - Launch web applications in seconds with Amazon ECS Express Mode (re:Post)](https://repost.aws/articles/ARDZrGhYT1SMCAeGbojOMbsg/re-invent-2025-launch-web-applications-in-seconds-with-amazon-ecs-express-mode)

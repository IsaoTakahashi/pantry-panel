---
paths:
  - "backend/**"
---
# Backend

## 技術スタック

- **Go** + **Echo** フレームワーク
- デプロイ先: **AWS Lambda + Lambda Web Adapter** (LWA)
  - container image (ECR、`linux/amd64`)
  - Function URL で HTTPS 公開
  - Free Tier 内でほぼ無料運用
  - 経緯: 当初 App Runner → ECS Express Mode と変遷したが、それぞれ廃止 / コスト過大の問題で Lambda に落ち着いた（archive 参照）

## API 設計

- **REST のみ** (Echo): stockItems の CRUD 操作。本番では Lambda + LWA で配信
- **画像検索プロキシ**: `GET /api/image-search?q=<query>&num=<1..10>` で Google Custom Search JSON API を中継。API key を frontend に露出させないため backend 経由とする。`GOOGLE_CSE_API_KEY` / `GOOGLE_CSE_ID` 未設定時は 503 を返す（CRUD など他機能は影響なし）
- **WebSocket**: 本番には載せない。Phase 3 で **学習目的のローカル実装** のみ（`backend/learning/websocket/`）
- **リアルタイム同期**: 本番は Phase 3.5 で **Supabase Realtime** を Frontend が直接購読。Backend は介在しない

## データベース

- **Supabase Postgres**（managed PostgreSQL、無料枠）
- 接続経路:
  - **本番 (Lambda)**: **Supavisor Session Pooler** (`aws-*-<region>.pooler.supabase.com:5432`、IPv4)
  - **ローカル開発**: Direct Connection / Pooler どちらでも可（IPv4 利用環境のため）
- Lambda が IPv6 outbound 非対応のため、Direct Connection (IPv6 only) は本番で使用不可

### ローカルから Supabase に接続する手順

1. Supabase Dashboard → Project Settings → Database → **Connection string** をコピー
   - **Direct connection**: `postgresql://postgres:[YOUR-PASSWORD]@db.<project-ref>.supabase.co:5432/postgres`（ローカル可、Lambda 不可）
   - **Session pooler**: `postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-*-<region>.pooler.supabase.com:5432/postgres`（**本番 Lambda 必須**、ローカル可）
2. 必要なら `?sslmode=require` を付与（Supabase は SSL 必須、Pooler は推奨設定済み）
3. `DATABASE_URL` 環境変数として渡して backend を起動

```bash
cd backend
export DATABASE_URL='postgresql://postgres.<ref>:<PASSWORD>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres'
go run .
```

- パスワードに `#` `?` `&` 等の特殊文字が含まれる場合は URL エンコードする
- パスワードは `.env.local` 等の git 管理外ファイル / パスワードマネージャで保管する。リポジトリにはコミットしない
- マイグレーションは Supabase Dashboard の **SQL Editor** で `backend/db/migrations/*.sql` を順に実行する（Phase 2.5 時点では手動運用、件数が増えたら自動化を検討）

### マイグレーション戦略

- 現状: SQL ファイルを手動で SQL Editor に貼り付けて実行
- 将来検討: `golang-migrate` を CI ジョブで実行 / 起動時に embed.FS で自動適用

#### Supabase 専用マイグレーション（002, 003）の注意点

`002_enable_realtime_stock_items.sql` と `003_stock_items_rls.sql` は Supabase 固有の機能（`supabase_realtime` publication / `anon` ロール）を使用する。local postgres や CI postgres には存在しないため、`DO $$ IF EXISTS ... END $$` ガードで安全に skip されるよう実装済み。Supabase 上では条件が真になり通常通り適用される。

## 本番デプロイ（Lambda + LWA）の概要

main への push で **`.github/workflows/deploy-backend.yml`** が自動実行され、ECR build/push → Lambda update-function-code → smoke test まで実施される（Phase 2.5d）。手動操作は通常不要。

要点:

1. **Dockerfile**: `backend/Dockerfile` で multi-stage build。最終ステージに LWA レイヤをコピー (`COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter`)。
   - **LWA のバージョン管理は手動**: Dependabot の `docker` ecosystem は `FROM` 命令のイメージは更新提案するが、`COPY --from=public.ecr.aws/...` で参照する ECR Public のイメージは現状サポート外。LWA の `v0.9.1` などのバージョンアップは定期的に [aws-lambda-adapter releases](https://github.com/awslabs/aws-lambda-web-adapter/releases) を確認して手動で bump する
2. **ビルド**: GH Actions が `docker buildx build --platform linux/amd64 --provenance=false --push ...` を実行（Lambda 互換 manifest のため `--provenance=false` 必須）
3. **ECR push**: `pantry-panel-backend` リポジトリ (`ap-northeast-1`)、タグは `${{ github.sha }}` と `latest`
4. **Lambda Function**: container image source、Memory 512 MB、Timeout 30s、`x86_64`、IAM Role: `pantry-panel-lambda-role`
5. **環境変数 (Lambda)**: `PORT=8080`、`AWS_LWA_PORT=8080`、`AWS_LWA_READINESS_CHECK_PATH=/health`、`CORS_ALLOWED_ORIGINS=...`、`DATABASE_URL=<pooler URL>`、`GOOGLE_CSE_API_KEY`、`GOOGLE_CSE_ID`（いずれも KMS で暗号化保存）。`CORS_ALLOWED_ORIGINS` は **wildcard `*` 対応**（`*` は `.` を跨がない）。Vercel preview URL は `https://pantry-panel-*-rictons-projects.vercel.app` のようにパターンで指定する。`GOOGLE_CSE_*` 未設定時は `/api/image-search` のみ 503 を返し、他の機能は動作する
6. **Function URL**: AuthType=NONE、CORS は **空 `{}`**（Echo の CORS middleware に一本化）
7. **resource policy**: 公開アクセスは **`lambda:InvokeFunctionUrl` のみで十分**。`lambda:InvokeFunction` (Principal `*`) は不要なので削除する。Function URL 経由のリクエストは `InvokeFunctionUrl` 権限で評価されるため、`InvokeFunction` を Principal `*` に許可すると過剰権限となる。

   旧 statement (`lambda:InvokeFunction` の Principal `*`) を削除する手順:

   ```bash
   # 1. 現在の policy を確認 (statement Sid を控える)
   aws lambda get-policy \
     --function-name pantry-panel-backend \
     --region ap-northeast-1 \
     --query 'Policy' --output text | jq .

   # 2. 該当 statement を Sid 指定で削除 (例: Sid="FunctionURLAllowPublicAccess")
   aws lambda remove-permission \
     --function-name pantry-panel-backend \
     --statement-id <該当 Sid> \
     --region ap-northeast-1

   # 3. 削除後、Function URL の /health が 200 を返すことを確認
   curl -fsS "$(aws lambda get-function-url-config \
     --function-name pantry-panel-backend \
     --region ap-northeast-1 --query FunctionUrl --output text)health"

   # 4. もし 403 になった場合 (rollback)
   aws lambda add-permission \
     --function-name pantry-panel-backend \
     --statement-id FunctionURLAllowPublicAccess \
     --action lambda:InvokeFunction \
     --principal '*' \
     --region ap-northeast-1
   ```

   preview Lambda (`pantry-panel-backend-preview`) も同じ手順で適用する。なお `InvokeFunctionUrl` の statement (AuthType=NONE 用) は残すこと。

### 手動デプロイ（trouble shoot 時）

```bash
docker build --platform linux/amd64 --provenance=false -t pantry-panel-backend:local backend/

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGISTRY=$ACCOUNT_ID.dkr.ecr.ap-northeast-1.amazonaws.com
aws ecr get-login-password --region ap-northeast-1 | docker login --username AWS --password-stdin $REGISTRY
docker tag pantry-panel-backend:local $REGISTRY/pantry-panel-backend:manual-$(date +%Y%m%d-%H%M%S)
docker push $REGISTRY/pantry-panel-backend --all-tags

aws lambda update-function-code \
  --function-name pantry-panel-backend \
  --image-uri $REGISTRY/pantry-panel-backend:<tag>
aws lambda wait function-updated --function-name pantry-panel-backend
```

### ロールバック手順

```bash
# 旧 sha タグで上書きデプロイ
aws lambda update-function-code \
  --function-name pantry-panel-backend \
  --image-uri <account>.dkr.ecr.ap-northeast-1.amazonaws.com/pantry-panel-backend:<old-sha>
aws lambda wait function-updated --function-name pantry-panel-backend
```

## テスト

| レイヤー | ツール | 対象 |
|---------|--------|------|
| Unit | **標準 testing パッケージ** | ビジネスロジック、ハンドラー |
| Integration | **testcontainers-go** + PostgreSQL | DB 操作、LISTEN/NOTIFY、API 結合 |
| Learning archive | `-tags=learning` で別 job 実行 | Phase 3 で隔離した自前 WebSocket 実装の retention |

## Lint

- **golangci-lint** — Go の標準的なリンターアグリゲータ。

## ドキュメント参照

| ツール | URL | 備考 |
|--------|-----|------|
| Echo | https://echo.labstack.com/docs | 公式ドキュメント（llms.txt 未提供） |
| pgx | https://pkg.go.dev/github.com/jackc/pgx/v5 | Go Packages API リファレンス |
| testcontainers-go | https://golang.testcontainers.org/ | 公式ドキュメント |
| golangci-lint | https://golangci-lint.run/docs/ | 公式ドキュメント |
| Supabase | https://supabase.com/docs | DB 接続・Realtime |
| AWS App Runner | https://docs.aws.amazon.com/apprunner/ | デプロイ先 |

## リアルタイム同期フロー

### Phase 3（学習実装）

1. REST API でデータ更新を受け付ける
2. DB 更新時に PostgreSQL NOTIFY を発行（トリガー）
3. Go サーバーが LISTEN で変更通知を受信
4. WebSocket 接続中のクライアントに変更内容を push

#### Phase 3 学習実装の起動方法（ローカル動作確認用）

```bash
# 1. compose Postgres を起動
docker compose up -d

# 2. learning migration を適用（trigger + function）
docker exec -i pantry-panel-db psql -U pantry -d pantry_panel \
  < backend/db/migrations/learning_001_stock_items_notify.sql

# 3. learning サーバーを起動
cd backend
go run -tags=learning ./learning/cmd/server
# → ws://localhost:8080/ws で接続待機
```

INSERT/UPDATE/DELETE で `stock_items.created/updated/deleted` イベントが配信される。WebSocket クライアントは `websocat ws://127.0.0.1:8080/ws` 等で接続できる。

### Phase 3.5 以降（本番）

- Frontend が Supabase Realtime に直接購読する
- Go バックエンドの責務は REST CRUD のみ。WebSocket と LISTEN は本番経路から外れる
- 詳細は `specs/features.md` Phase 3.5 を参照

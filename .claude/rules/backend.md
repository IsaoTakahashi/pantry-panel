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

## 本番デプロイ（Lambda + LWA）の概要

詳細手順は `openspec/changes/archive/2026-05-XX-phase2-5b-lambda-deploy/` を参照（archive 後）。要点:

1. **Dockerfile**: `backend/Dockerfile` で multi-stage build。最終ステージに LWA レイヤをコピー (`COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter`)
2. **ビルド**: `docker build --platform linux/amd64 --provenance=false -t pantry-panel-backend:local backend/`（Lambda 互換 manifest のため `--provenance=false` 必須）
3. **ECR push**: `pantry-panel-backend` リポジトリ (`ap-northeast-1`) に push
4. **Lambda Function**: container image source、Memory 512 MB、Timeout 30s、`x86_64`、IAM Role: `pantry-panel-lambda-role`
5. **環境変数 (Lambda)**: `PORT=8080`、`AWS_LWA_PORT=8080`、`AWS_LWA_READINESS_CHECK_PATH=/health`、`CORS_ALLOWED_ORIGINS=...`、`DATABASE_URL=<pooler URL>`（KMS で暗号化保存）
6. **Function URL**: AuthType=NONE、CORS は **空 `{}`**（Echo の CORS middleware に一本化）
7. **resource policy**: `lambda:InvokeFunctionUrl` + `lambda:InvokeFunction` の両方を Principal `*` に許可（過剰権限の TODO あり、後日強化予定）

### ロールバック手順

```bash
# 旧 sha タグで上書きデプロイ
aws lambda update-function-code \
  --function-name pantry-panel-backend \
  --image-uri <account>.dkr.ecr.ap-northeast-1.amazonaws.com/pantry-panel-backend:<old-sha>
```

## テスト

| レイヤー | ツール | 対象 |
|---------|--------|------|
| Unit | **標準 testing パッケージ** | ビジネスロジック、ハンドラー |
| Integration | **testcontainers-go** + PostgreSQL | DB 操作、LISTEN/NOTIFY、API 結合 |
| Learning archive | `-tags=learning` で別 job 実行 | Phase 3.5 で隔離した自前 WebSocket 実装の retention |

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

### Phase 3.5 以降（本番）

- Frontend が Supabase Realtime に直接購読する
- Go バックエンドの責務は REST CRUD のみ。WebSocket と LISTEN は本番経路から外れる
- 詳細は `specs/features.md` Phase 3.5 を参照

# Backend

## 技術スタック

- **Go** + **Echo** フレームワーク
- デプロイ先: **AWS App Runner**（コンテナ常駐、WebSocket 対応）

## API 設計

- **REST**: stockItems の CRUD 操作（本番で常時稼働）
- **WebSocket**: Phase 3 のみ自前で実装。Phase 3.5 以降は Supabase Realtime に置き換え、自前実装は学習ログ化（`backend/learning/websocket/`）

## データベース

- **Supabase Postgres**（managed PostgreSQL、無料枠）
- 接続: **direct connection (5432)** または **Supavisor session mode** を使用する
  - LISTEN/NOTIFY を行うため、transaction pooler (6543) は **不可**
- LISTEN/NOTIFY は Phase 3 の自前 WebSocket 実装で使用。Phase 3.5 以降は Supabase Realtime に移行

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

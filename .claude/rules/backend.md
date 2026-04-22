# Backend

## 技術スタック

- **Go** + **Echo** フレームワーク
- デプロイ先: AWS ECS Fargate または App Runner

## API 設計

- **REST**: stockItems の CRUD 操作
- **WebSocket**: クライアントへのリアルタイム変更通知

## データベース

- **Aurora PostgreSQL Serverless v2**
- **LISTEN/NOTIFY** を使用してデータ変更をGoサーバーに通知し、WebSocket経由でクライアントに配信する

## テスト

| レイヤー | ツール | 対象 |
|---------|--------|------|
| Unit | **標準 testing パッケージ** | ビジネスロジック、ハンドラー |
| Integration | **testcontainers-go** + PostgreSQL | DB 操作、LISTEN/NOTIFY、API 結合 |

## Lint

- **golangci-lint** — Go の標準的なリンターアグリゲータ。

## ドキュメント参照

| ツール | URL | 備考 |
|--------|-----|------|
| Echo | https://echo.labstack.com/docs | 公式ドキュメント（llms.txt 未提供） |
| pgx | https://pkg.go.dev/github.com/jackc/pgx/v5 | Go Packages API リファレンス |
| testcontainers-go | https://golang.testcontainers.org/ | 公式ドキュメント |
| golangci-lint | https://golangci-lint.run/docs/ | 公式ドキュメント |

## リアルタイム同期フロー

1. REST API でデータ更新を受け付ける
2. DB 更新時に PostgreSQL NOTIFY を発行（トリガー）
3. Go サーバーが LISTEN で変更通知を受信
4. WebSocket 接続中のクライアントに変更内容を push

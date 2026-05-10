# Learning: WebSocket + PostgreSQL LISTEN/NOTIFY

## 目的

WebSocket protocol、PostgreSQL LISTEN/NOTIFY、broadcast の挙動を学習するためのコード。

## 本番には載せない

- 全 .go ファイルに `//go:build learning` を MUST 付与
- 通常の `go build .` / `go test ./...` / Lambda の docker build からは **完全に除外**される
- Lambda の本番 binary には 1 バイトも含まれない

## 変更ルール

- **機能追加は禁止**。Phase 3.5（Supabase Realtime）を本番として採用したため、本実装は学習ログ
- **依存追従のみ許容**:
  - 脆弱性対応で `coder/websocket` をアップデートする
  - Go バージョンアップで build が壊れた場合の追随
  - testcontainers / pgx の API 破壊への追随
- 上記以外の変更は別 capability の change として扱う

## 動作確認

### ローカル

```bash
# Postgres を起動
docker compose up -d

# 学習用 migration を適用 (初回のみ)
psql 'postgres://pantry:pantry@localhost:5432/pantry_panel?sslmode=disable' \
  -f backend/db/migrations/learning_001_stock_items_notify.sql

# 学習サーバを起動
cd backend
go run -tags=learning ./learning/cmd/server

# 別端末で WebSocket 接続
wscat -c ws://localhost:8080/ws
```

### CI

`.github/workflows/learning.yml` で `go test -tags=learning ./backend/learning/...` が走る。testcontainers で Postgres を起動して integration テストを実行。

## ファイル構成

```
backend/learning/
├── websocket/
│   ├── README.md            (このファイル)
│   ├── hub.go               (broadcaster: subscribe/unsubscribe/broadcast)
│   ├── hub_test.go
│   ├── pg_listener.go       (PostgreSQL LISTEN + auto-reconnect)
│   ├── pg_listener_test.go
│   ├── handler.go           (Echo /ws handler)
│   ├── handler_test.go
│   └── integration_test.go  (testcontainers + Postgres + WS の end-to-end)
└── cmd/server/
    └── main.go              (起動 entrypoint、Echo + Hub + PgListener を組み立てる)
```

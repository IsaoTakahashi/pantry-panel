## Why

Phase 2 完了 + Phase 2.5 で本番デプロイ完了。Phase 3 は **学習目的** で WebSocket + PostgreSQL LISTEN/NOTIFY を自前実装し、リアルタイム同期の仕組みを実機で理解する。本番のリアルタイム同期は Phase 3.5 で **Supabase Realtime** に置き換えるため、本実装は production bundle から除外し、ローカル / CI でのみ動作確認する。

## What Changes

### Backend (`backend/learning/websocket/`)

- `//go:build learning` build tag で本番 binary から完全除外
- Echo WebSocket ハンドラ `/ws` を提供
- 接続中の全クライアントに JSON `{type, payload}` を broadcast
- PostgreSQL LISTEN connection（pgx）を 1 本張り、`stock_items_changed` チャネルを購読
- 切断時の **自動 reconnect**（exponential backoff）
- DB トリガ SQL を migrations に追加（`learning` タグでのみ適用、もしくは別 SQL ファイルとして手動適用）

### Frontend (`frontend/src/learning/websocket-client/`)

- `*.learning.test.ts` 命名で通常 vitest run から除外
- 別 vitest config (`vitest.learning.config.ts`) で `*.learning.test.ts` のみを対象に走らせる
- WebSocket クライアント フック `useStockItemsWebSocket(url): { connected, lastEvent }`
- 自動 reconnect 付き
- **UI 統合はしない**（学習スコープ外、本番は Supabase Realtime で実装する）

### CI (`.github/workflows/learning.yml`)

- 別ワークフロー（既存 ci.yml と独立、main push と PR 両方で走る）
- Backend job: `go test -tags=learning ./backend/learning/...`（testcontainers + Postgres で integration test）
- Frontend job: `npx vitest run --config vitest.learning.config.ts`

### ドキュメント

- 各 learning ディレクトリに `README.md` を置き、「学習目的」「本番には載せない」「変更は依存追従のみ」を明記
- Phase 3 完了時に `git tag learning-archive-v1` を打ってスナップショットを残す

## Capabilities

### New Capabilities

- `realtime-sync-learning`: 学習目的の WebSocket + LISTEN/NOTIFY 実装。ローカル / CI のみで動作確認、本番には載せない要件を定義する

### Modified Capabilities

（なし — 本番ルートに影響なし）

## Impact

- 新規ファイル:
  - `backend/learning/websocket/` 配下: WebSocket handler、PgListener、broadcaster、テスト群
  - `backend/learning/websocket/README.md`
  - `backend/db/migrations/learning_001_stock_items_notify.sql`（学習用、Supabase 本番には適用しない）
  - `frontend/src/learning/websocket-client/` 配下: フック + テスト
  - `frontend/src/learning/websocket-client/README.md`
  - `frontend/vitest.learning.config.ts`
  - `.github/workflows/learning.yml`
- 既存ファイル変更なし（本番コードへの影響なし）
- Backend `go.mod` に `github.com/coder/websocket` 等の依存追加（学習スコープのみで使用、`learning` タグ付きビルドで only）
- AWS 本番 / Vercel 本番への影響: **なし**（buildタグ / vitest config で除外）
- ローカル開発時の Backend 起動方法は変更なし（`go run .` で従来通り）

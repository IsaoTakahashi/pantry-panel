## ADDED Requirements

### Requirement: 学習用 WebSocket / LISTEN コードは本番 binary から除外される
学習用の WebSocket + LISTEN/NOTIFY 実装は **`//go:build learning`** build tag および別 vitest config で本番ルートから完全に除外する MUST。production bundle（Lambda 用 container image / Vercel 用 Next.js bundle）に **MUST NOT 含まれる**。

#### Scenario: 通常 build からの除外（Backend）
- **WHEN** `go build .` または `docker build backend/` を実行する
- **THEN** `backend/learning/websocket/` 配下のソースは binary に含まれない
- **AND** `import` も含まれない

#### Scenario: 通常 test からの除外（Backend）
- **WHEN** `go test ./...` を実行する
- **THEN** `backend/learning/...` のテストは実行されない（build tag によりファイルそのものが見えない）

#### Scenario: 通常 test からの除外（Frontend）
- **WHEN** `npx vitest run` を実行する（デフォルト config）
- **THEN** `*.learning.test.ts` のテストは実行されない

### Requirement: 学習用コードは別 CI ジョブで動作確認する
学習用 WebSocket 実装の動作確認は専用ワークフロー `.github/workflows/learning.yml` で MUST 実行する。push to main と PR の両方で走る MUST。

#### Scenario: Backend learning job
- **WHEN** push to main または PR が走る
- **THEN** `learning.yml` の backend job が `go test -tags=learning ./backend/learning/...` を実行し、testcontainers で Postgres を立てて結合テストが緑になる

#### Scenario: Frontend learning job
- **WHEN** push to main または PR が走る
- **THEN** `learning.yml` の frontend job が `npx vitest run --config vitest.learning.config.ts` を実行し、`*.learning.test.ts` が緑になる

### Requirement: WebSocket message format
WebSocket メッセージは JSON で `{"type": <string>, "payload": <object>}` 形式 MUST。`type` は `stock_items.created` / `stock_items.updated` / `stock_items.deleted` のいずれか SHALL。

#### Scenario: created イベント
- **WHEN** stock_items に INSERT が発生する
- **THEN** WebSocket 接続中のクライアントに `{"type": "stock_items.created", "payload": <inserted_row>}` が JSON で送られる

#### Scenario: updated イベント
- **WHEN** stock_items の行が UPDATE される
- **THEN** `{"type": "stock_items.updated", "payload": <updated_row>}` が送られる

#### Scenario: deleted イベント
- **WHEN** stock_items の行が DELETE される
- **THEN** `{"type": "stock_items.deleted", "payload": {"id": <deleted-id>}}` が送られる

### Requirement: Backend は接続中の全 WebSocket クライアントに broadcast する
接続中のすべての WebSocket クライアントに、NOTIFY 由来のメッセージを broadcast する SHALL。subscribe / unsubscribe の topic フィルタは MUST NOT 持つ（学習スコープ外）。

#### Scenario: 複数クライアント broadcast
- **WHEN** 2 台のクライアントが `/ws` に接続している
- **AND** 任意の `stock_items` 行が変更される
- **THEN** 2 台ともが同じメッセージを受け取る

### Requirement: Backend は LISTEN connection の自動 reconnect を行う
PostgreSQL LISTEN connection が切断された場合、Backend は exponential backoff で自動再接続を試みる MUST（500ms → 1s → 2s → 5s → 10s 上限）。再接続成功後に MUST 再度 `LISTEN stock_items_changed` を発行する。

#### Scenario: DB 切断後の自動復旧
- **WHEN** PostgreSQL connection が一時的に切れる
- **THEN** Backend は backoff で再接続を試み、最終的に LISTEN を再確立する
- **AND** 復旧後に発生した NOTIFY を WebSocket クライアントに配信する

### Requirement: DB トリガは学習用 migration として分離する
PostgreSQL の NOTIFY を発火するトリガ関数およびトリガは、本番 migration とは別の `backend/db/migrations/learning_001_stock_items_notify.sql` として MUST 分離する。Supabase 本番には MUST NOT 適用する。

#### Scenario: ファイル分離
- **WHEN** リポジトリ内の migration ファイルを確認する
- **THEN** `learning_*.sql` は学習スコープのファイルとして識別可能
- **AND** Supabase Dashboard の SQL Editor には `learning_*.sql` を適用していない

### Requirement: Frontend はフックのみ提供、UI 統合しない
学習用 Frontend は `useStockItemsWebSocket(url)` フックを `frontend/src/learning/websocket-client/` 配下に提供する SHALL。本番の `stock-items` ページへの組込みは MUST NOT 行う（本番リアルタイム機構は Phase 3.5 で Supabase Realtime を導入する）。

#### Scenario: フック単体動作確認
- **WHEN** `useStockItemsWebSocket("ws://localhost:8080/ws")` を呼ぶ
- **THEN** `{ connected: boolean, lastEvent: Event | null }` を返す
- **AND** WebSocket からメッセージを受信すると `lastEvent` が更新される

#### Scenario: 本番ページへの非統合
- **WHEN** `frontend/src/app/stock-items/page.tsx` を確認する
- **THEN** `useStockItemsWebSocket` の import は MUST NOT 含まれる

### Requirement: Frontend WebSocket クライアントは自動 reconnect する
WebSocket connection が切断された場合、Frontend のフックは exponential backoff で自動再接続を試みる MUST（500ms → 1s → 2s → 5s → 10s 上限）。

#### Scenario: 切断後の自動復旧
- **WHEN** WebSocket connection が切れる
- **THEN** フックは backoff で再接続を試み、`connected` を false にしている間 reconnect を継続する
- **AND** 接続復旧時に `connected` が true に戻る

### Requirement: 学習コードの README を必ず置く
`backend/learning/websocket/` および `frontend/src/learning/websocket-client/` の各ディレクトリには `README.md` を MUST 置き、以下を明記する MUST:
- 学習目的の隔離コードである
- 本番には載せない
- 変更は依存追従（脆弱性対応 / API 破壊への追随）に限定し、機能追加は MUST NOT
- 動作確認手順（local / CI）

#### Scenario: README の存在
- **WHEN** 各 learning ディレクトリを確認する
- **THEN** `README.md` が存在し、上記 4 点が記載されている

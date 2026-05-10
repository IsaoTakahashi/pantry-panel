## 1. Issue・ブランチ準備

- [x] 1.1 GitHub Issue を作成する（タイトル: "Phase 3: 学習目的の WebSocket + LISTEN/NOTIFY 実装"）
- [x] 1.2 Issue 番号ベースのブランチを作成する
- [x] 1.3 Draft PR を作成する

## 2. Backend スケルトン + 隔離設定

- [x] 2.1 `backend/learning/websocket/` ディレクトリを作る
- [x] 2.2 `README.md` を置き、学習目的・本番除外・動作確認手順を記載
- [x] 2.3 `coder/websocket` を `go.mod` に追加（`go get github.com/coder/websocket`） — 注: `go mod tidy` で未使用扱いとなり消える可能性あり、実装ファイル import 後に `go mod tidy` で復活する
- [x] 2.4 全 .go ファイルに `//go:build learning` build tag を付与する規則を README に明記
- [x] 2.5 `go build .` で learning コードが除外されることを確認（成功）
- [x] 2.6 `go build -tags=learning ./learning/...` で learning コードがビルドできることを確認（現状ファイル無しで warning のみ、ファイル追加後に再検証）

## 3. Backend 実装

### 3.1 構造設計

- [x] 3.1.1 `Hub` (broadcaster) の構造を決める：subscribe / unsubscribe / broadcast を持つ
- [x] 3.1.2 `PgListener` の構造を決める：LISTEN ループ + reconnect

### 3.2 テスト方針提示 → ユーザー実装 → Claude レビュー (TDD)

- [x] 3.2.1 Hub の unit test（subscribe / unsubscribe / broadcast / 複数接続）
- [ ] 3.2.2 メッセージ JSON encode の unit test — 省略（trigger SQL 側で JSON を組み立てるため、integration_test の end-to-end で十分カバー）
- [x] 3.2.3 PgListener reconnect の unit test（`computeBackoff` のテーブルテスト）
- [x] 3.2.4 Integration test (testcontainers): Postgres 起動 → migration 適用 → INSERT → WS 経由でメッセージ受信を assert

### 3.3 プロダクションコード

- [x] 3.3.1 `Hub` 実装
- [x] 3.3.2 `PgListener` 実装（reconnect 込み）
- [x] 3.3.3 Echo の `/ws` ハンドラ実装（learning タグ付き）
- [x] 3.3.4 `learning/cmd/server/main.go` で全部組み立て、`go run -tags=learning ./learning/cmd/server` で起動可能

## 4. DB トリガ

- [x] 4.1 `backend/db/migrations/learning_001_stock_items_notify.sql` を作成（design.md の SQL）
- [x] 4.2 README に「Supabase 本番には適用しない / compose Postgres にのみ手動適用」を明記
- [x] 4.3 ローカルの compose Postgres に手動適用して `psql` で `pg_notify` テストできることを確認

## 5. Frontend スケルトン + 隔離設定

- [x] 5.1 `frontend/src/learning/websocket-client/` を作る
- [x] 5.2 `README.md` を置き、学習目的・本番除外・動作確認手順を記載
- [x] 5.3 `frontend/vitest.learning.config.ts` を作成 + 既存 `vitest.config.ts` に `*.learning.test.{ts,tsx}` の exclude 追加
- [x] 5.4 `package.json` に `"test:learning": "vitest run --config vitest.learning.config.ts"` を追加

## 6. Frontend 実装

### 6.1 テスト方針提示 → ユーザー実装 → Claude レビュー (TDD)

- [x] 6.1.1 `useStockItemsWebSocket` の状態遷移テスト（mock WebSocket）
- [x] 6.1.2 reconnect ロジックのテスト（exponential backoff、境界値含む）+ `computeBackoff` のテーブルテスト
- [x] 6.1.3 メッセージ受信時の `lastEvent` 更新テスト

### 6.2 プロダクションコード

- [x] 6.2.1 `useStockItemsWebSocket(url)` フック実装（reconnect 込み）
- [x] 6.2.2 type 定義（`StockItemEvent`）+ `computeBackoff` 純粋関数

## 7. CI

- [x] 7.1 `.github/workflows/learning.yml` を作成（learning タグ build + test、frontend 別 vitest config）
- [x] 7.2 既存 ci.yml は変更なし（learning コードは除外されたままで build / test が通ること）

## 8. ローカル動作確認

- [x] 8.1 `docker compose up -d` で Postgres を起動
- [x] 8.2 学習 migration を `psql` で適用
- [x] 8.3 `go run -tags=learning ./learning/cmd/server` で起動
- [x] 8.4 別端末から `websocat ws://127.0.0.1:8080/ws` で 2 台接続（wscat の代わりに websocat を使用）
- [x] 8.5 別端末で `psql` 経由で INSERT/UPDATE/DELETE → 2 台ともメッセージ受信
- [x] 8.6 Frontend playground (`frontend/src/app/learning/websocket-playground/page.tsx`、gitignore 済) で動作確認、reconnect も実機検証

## 9. ドキュメント / Tagging

- [x] 9.1 `specs/features.md` の Phase 3 を完了マーク
- [x] 9.2 `.claude/rules/backend.md` の learning セクションを最新化（起動方法を追記）
- [x] 9.3 `.claude/rules/frontend.md` の learning セクションを最新化
- [x] 9.4 `git tag learning-archive-v1 && git push origin learning-archive-v1`（PR マージ前に実施済）

## 10. 仕上げ

- [ ] 10.1 CI（既存 ci.yml + 新 learning.yml）がすべてパスすることを確認
- [ ] 10.2 PR を ready for review にして、Issue を `Closes #N` でリンク
- [ ] 10.3 マージ後に `openspec archive phase3-realtime-sync-learning` で archive する

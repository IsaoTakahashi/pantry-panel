## 1. Issue・ブランチ準備

- [x] 1.1 GitHub Issue を作成する（タイトル: "Phase 3: 学習目的の WebSocket + LISTEN/NOTIFY 実装"）
- [x] 1.2 Issue 番号ベースのブランチを作成する
- [x] 1.3 Draft PR を作成する

## 2. Backend スケルトン + 隔離設定

- [ ] 2.1 `backend/learning/websocket/` ディレクトリを作る
- [ ] 2.2 `README.md` を置き、学習目的・本番除外・動作確認手順を記載
- [ ] 2.3 `coder/websocket` を `go.mod` に追加（`go get github.com/coder/websocket`）
- [ ] 2.4 全 .go ファイルに `//go:build learning` build tag を付与する規則を README に明記
- [ ] 2.5 `go build .` で learning コードが除外されることを確認（warning 等が出ない）
- [ ] 2.6 `go build -tags=learning ./backend/learning/...` で learning コードがビルドできることを確認

## 3. Backend 実装

### 3.1 構造設計

- [ ] 3.1.1 `Hub` (broadcaster) の構造を決める：subscribe / unsubscribe / broadcast を持つ
- [ ] 3.1.2 `PgListener` の構造を決める：LISTEN ループ + reconnect

### 3.2 テスト方針提示 → ユーザー実装 → Claude レビュー (TDD)

- [ ] 3.2.1 Hub の unit test（subscribe / unsubscribe / broadcast / 複数接続）
- [ ] 3.2.2 メッセージ JSON encode の unit test
- [ ] 3.2.3 PgListener reconnect の unit test（DB を mock）
- [ ] 3.2.4 Integration test (testcontainers): Postgres 起動 → migration 適用 → INSERT/UPDATE/DELETE → WS 経由でメッセージ受信を assert

### 3.3 プロダクションコード

- [ ] 3.3.1 `Hub` 実装
- [ ] 3.3.2 `PgListener` 実装（reconnect 込み）
- [ ] 3.3.3 Echo の `/ws` ハンドラ実装（learning タグ付き）
- [ ] 3.3.4 `learning_main.go`（or 同等）で全部組み立て、`go run -tags=learning ./backend/learning/cmd/server` 等で起動可能にする

## 4. DB トリガ

- [ ] 4.1 `backend/db/migrations/learning_001_stock_items_notify.sql` を作成（design.md の SQL）
- [ ] 4.2 README に「Supabase 本番には適用しない / compose Postgres にのみ手動適用」を明記
- [ ] 4.3 ローカルの compose Postgres に手動適用して `psql` で `pg_notify` テストできることを確認

## 5. Frontend スケルトン + 隔離設定

- [ ] 5.1 `frontend/src/learning/websocket-client/` を作る
- [ ] 5.2 `README.md` を置き、学習目的・本番除外・動作確認手順を記載
- [ ] 5.3 `frontend/vitest.learning.config.ts` を作成
  - `include: ["src/learning/**/*.learning.test.ts"]`
  - 既存の `vitest.config.ts` には `exclude: ["**/*.learning.test.ts"]` を追加
- [ ] 5.4 `package.json` に `"test:learning": "vitest run --config vitest.learning.config.ts"` を追加（任意）

## 6. Frontend 実装

### 6.1 テスト方針提示 → ユーザー実装 → Claude レビュー (TDD)

- [ ] 6.1.1 `useStockItemsWebSocket` の状態遷移テスト（mock WebSocket）
- [ ] 6.1.2 reconnect ロジックのテスト（exponential backoff）
- [ ] 6.1.3 メッセージ受信時の `lastEvent` 更新テスト

### 6.2 プロダクションコード

- [ ] 6.2.1 `useStockItemsWebSocket(url)` フック実装
- [ ] 6.2.2 type 定義（`StockItemEvent` 等）

## 7. CI

- [ ] 7.1 `.github/workflows/learning.yml` を作成
  - Trigger: push to main / pull_request
  - backend job: `go test -tags=learning ./backend/learning/...`
  - frontend job: `npx vitest run --config vitest.learning.config.ts`
- [ ] 7.2 既存 ci.yml は変更なし（learning コードは除外されたままで build / test が通ること）

## 8. ローカル動作確認

- [ ] 8.1 `docker compose up -d` で Postgres を起動
- [ ] 8.2 学習 migration を `psql` で適用
- [ ] 8.3 `go run -tags=learning ./backend/learning/cmd/server`（または同等）で起動
- [ ] 8.4 別端末から `wscat -c ws://localhost:8080/ws` で 2 台接続
- [ ] 8.5 別端末で `psql` 経由で `INSERT INTO stock_items ...` → 2 台ともメッセージ受信
- [ ] 8.6 Frontend のフックを Storybook 等の playground で動かす（任意、push しない）

## 9. ドキュメント / Tagging

- [ ] 9.1 `specs/features.md` の Phase 3 を完了マーク
- [ ] 9.2 `.claude/rules/backend.md` の learning セクションを最新化（実装が入った旨）
- [ ] 9.3 `.claude/rules/frontend.md` の learning セクションを最新化
- [ ] 9.4 PR マージ後 `git tag learning-archive-v1 && git push origin learning-archive-v1`

## 10. 仕上げ

- [ ] 10.1 CI（既存 ci.yml + 新 learning.yml）がすべてパスすることを確認
- [ ] 10.2 PR を ready for review にして、Issue を `Closes #N` でリンク
- [ ] 10.3 マージ後に `openspec archive phase3-realtime-sync-learning` で archive する

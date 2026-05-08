## Context

旧製品の Firebase Realtime Database に相当するリアルタイム同期を、新製品では Phase 3.5 で **Supabase Realtime** に集約する方針が確定済（Epic #43 の D8 / `specs/features.md` 参照）。本番 Backend は AWS Lambda で動作するため、ステートフルな WebSocket 接続を本番 backend に持たせることは技術的にも困難。

しかし「WebSocket + PostgreSQL LISTEN/NOTIFY を Go で書く」という経験そのものは学習価値が高く、捨てがたい。そこで Phase 3 は **学習目的の隔離実装** として残す。本実装は production bundle に含めず、ローカルの compose Postgres + ローカル Backend / Frontend でのみ動作確認する。

## Goals / Non-Goals

**Goals:**
- WebSocket protocol、LISTEN/NOTIFY、broadcast の実装と挙動を実機で理解する
- 本番コード（Lambda 配信される Go binary）に **一切影響しない** ように完全隔離する
- 依存ライブラリの脆弱性 / API 破壊で壊れないよう、CI で動作確認を継続する

**Non-Goals:**
- 本番化（Lambda へのデプロイ）— 不可能 + 不要
- UI への統合 — 本番は Phase 3.5 で Supabase Realtime に置き換え
- 認証・認可 — 旧仕様も認証なし、学習スコープでも省略
- スケーラビリティ（複数インスタンス間の broadcast）— 学習用は単一プロセスで十分
- 永続化 / メッセージ保証 — fire-and-forget で十分

## Decisions

### 隔離方法: Go build tag + Frontend 別 vitest config

- **Backend**: `//go:build learning` を `backend/learning/...` の全 .go ファイルに付与
  - 通常の `go build .`、`go test ./...` は learning コードを **完全に無視**
  - 学習コードを動かすには `go test -tags=learning ./backend/learning/...` を明示
- **Frontend**: `frontend/src/learning/websocket-client/*.learning.test.ts` 命名規則
  - 通常の `vitest.config.ts` は `**/*.test.ts` のみを include、`*.learning.test.ts` は exclude
  - 別 config `vitest.learning.config.ts` で `*.learning.test.ts` のみ対象

採用理由:
- 本番 binary に1バイトも learning コードが含まれない
- 通常開発では learning ディレクトリを意識せず作業可能
- CI で別 job として独立実行できる

代替案:
- 別リポジトリに分割 → 学習履歴とコードレビューが分散して非効率
- monorepo の workspace 化 → オーバーキル

### WebSocket メッセージ形式: 単純な JSON `{type, payload}`

```json
{"type": "stock_items.created", "payload": { ...row... }}
{"type": "stock_items.updated", "payload": { ...row... }}
{"type": "stock_items.deleted", "payload": { "id": "..." }}
```

採用理由:
- 学習スコープではシンプルさ優先
- protobuf / GraphQL Subscription は過剰

代替案:
- `{op, table, row}` 形式（PostgreSQL 用語に近い）→ 採用しない、フロント側の理解しやすさ優先
- バイナリ形式 → 学習目的なので人間可読性優先

### Broadcast 戦略: 全クライアントに全イベント

接続中の全クライアントに NOTIFY 受信時のメッセージを送る。subscribe / unsubscribe のフィルタ機構なし。

採用理由:
- 家族用途で同時接続クライアントは数台
- subscribe 設計は YAGNI、必要になったら追加

### LISTEN connection 管理: 1 本張りっぱなし + 自動 reconnect

- 起動時に pgx で `LISTEN stock_items_changed` を 1 本だけ張る
- 切断検知時は exponential backoff で再接続（500ms → 1s → 2s → 5s → 10s 上限）
- 再接続成功後に再度 LISTEN を発行

採用理由:
- LISTEN は単一 connection で十分（多重 listen はリソースの無駄）
- 再接続なしだと container restart や DB 一時切断で永続的に死ぬ

### Frontend 統合方式: フックのみ実装、UI 統合はしない

`useStockItemsWebSocket(url): { connected: boolean, lastEvent: Event | null }` を提供する。実際の `stock-items` ページへの組込みは行わない。

採用理由:
- 本番のリアルタイム機能は Phase 3.5 で Supabase Realtime に組込む。Phase 3 で UI 統合しても捨てる
- フックの単体動作確認まで（test 含む）が学習目的の到達点

### テスト範囲: Unit + Integration (testcontainers)

- **Backend**:
  - Unit: メッセージ整形、JSON encode、broadcaster の subscribe/unsubscribe
  - Integration: testcontainers で Postgres を立て、トリガ INSERT → LISTEN 受信 → WebSocket 配信の end-to-end
- **Frontend**:
  - Unit: フックの状態遷移、reconnect ロジック（mock WebSocket で）

採用理由:
- LISTEN/NOTIFY は単体テストでは動作保証できない
- testcontainers は Phase 1 から使用しているので追加学習コスト小

### DB トリガ: 別 migration ファイルで学習用と分離

`backend/db/migrations/learning_001_stock_items_notify.sql` として学習スコープの SQL を分離する。Supabase 本番にはこの migration を適用しない（学習用のみ）。

```sql
CREATE OR REPLACE FUNCTION notify_stock_items_change() RETURNS trigger AS $$
DECLARE
  payload jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    payload := jsonb_build_object('type', 'stock_items.deleted', 'payload', jsonb_build_object('id', OLD.id));
  ELSIF TG_OP = 'INSERT' THEN
    payload := jsonb_build_object('type', 'stock_items.created', 'payload', to_jsonb(NEW));
  ELSE
    payload := jsonb_build_object('type', 'stock_items.updated', 'payload', to_jsonb(NEW));
  END IF;
  PERFORM pg_notify('stock_items_changed', payload::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_items_notify
  AFTER INSERT OR UPDATE OR DELETE ON stock_items
  FOR EACH ROW EXECUTE FUNCTION notify_stock_items_change();
```

採用理由:
- compose Postgres にだけ手動適用する運用が明示的
- 本番（Supabase）に誤って適用するリスクなし

### WebSocket ライブラリ: `github.com/coder/websocket`

Go コミュニティで主流の WebSocket ライブラリ。`gorilla/websocket` は archive 状態のため非推奨。

採用理由:
- 活発にメンテされている
- `nhooyr.io/websocket` から rename した同じライブラリで実績あり

代替案:
- `github.com/gorilla/websocket` → archive、非推奨
- `golang.org/x/net/websocket` → 機能少
- 自前実装 → 学習スコープを越える

## Risks / Trade-offs

- **本番に LISTEN/NOTIFY が入り込むリスク** → Build tag + 別 migration ファイル + CI に separate job で完全隔離。Lambda コンテナビルドにも影響なし
- **依存ライブラリの脆弱性 / 破壊的変更** → CI で常に動作確認しているため気付ける
- **学習コードの保守コスト** → "依存追従のみ、機能追加禁止" を README で明示
- **`learning` build tag を付け忘れて本番 binary に混入** → CI ジョブとして本番 build (`go build .`) と learning build (`go build -tags=learning ./...`) を別個に走らせ、本番 build に learning code を含まないことを確認

## Migration Plan

1. Backend: build tag 付きスケルトン、テスト、production 実装、testcontainers 結合テストを順に実装
2. Frontend: `vitest.learning.config.ts` 追加、フックのスケルトン → unit test → 実装
3. DB migration `learning_001_stock_items_notify.sql` を compose Postgres に適用
4. ローカルで動作確認: `go test -tags=learning ./backend/learning/...` 緑、frontend `npx vitest run --config vitest.learning.config.ts` 緑、`docker compose up` + `go run -tags=learning .` で別端末から複数 ws connection 張って NOTIFY 受信確認
5. CI に `learning.yml` を追加して push / PR で動作確認継続
6. Phase 3 マージ後、`git tag learning-archive-v1` を打って固定ポイントを作る

ロールバック: 学習コードのみ追加なので、PR を revert すれば本番への影響なしで巻き戻せる。

## Open Questions

- 「main に居続ける」 vs 「専用の学習ブランチに退避」: main に居続ける方が CI で常時動作確認できて壊れにくいが、main がノイジーになる懸念あり → main に居続けるで進める
- WebSocket メッセージの version 付け: `{version: 1, type, payload}` を初版から入れるかは判断分かれる。学習スコープでは省略、必要になれば後付け

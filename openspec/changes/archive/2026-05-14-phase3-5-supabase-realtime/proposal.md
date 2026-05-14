## Why

Phase 2.5 までで Frontend → Lambda → Supabase Postgres の CRUD は動いているが、家族の誰かが端末 A で変更しても、端末 B では手動 reload しないと見えない。これを解消し、`features.md` の機能 G「リアルタイム同期」を本番で実現する。

Phase 3 で自前 WebSocket + LISTEN/NOTIFY を学習実装したが、Backend が Lambda + LWA に移った時点で常時稼働の WebSocket は保持不能となり、本番ルートからは外した（学習目的のローカル動作確認のみ）。Phase 3.5 では **Supabase Realtime** を採用し、Frontend が Postgres の変更を直接購読する構成にする。

## What Changes

- Frontend に `@supabase/supabase-js` を導入し、`stock_items` テーブルの postgres_changes を購読する hook を新設
- `stock-items/page.tsx` で hook を購読し、INSERT/UPDATE/DELETE のいずれかを受信したら REST API (`GET /api/stock-items`) で一覧を再取得して state に反映する（payload は直接適用しない）
- `stock_items` テーブルを Supabase Realtime publication に追加する migration (`002_enable_realtime_stock_items.sql`) を追加
- RLS を `stock_items` に対して有効化し、anon ロールに **SELECT のみ** 許可するポリシー migration (`003_stock_items_rls.sql`) を追加。INSERT/UPDATE/DELETE は anon 不許可（Lambda 経由のみ）
- 環境変数 `NEXT_PUBLIC_SUPABASE_URL` および `NEXT_PUBLIC_SUPABASE_ANON_KEY` を Frontend に追加（`.env.local.example`、Vercel Production/Preview/Development の全環境）
- E2E テスト（Playwright）を 1 本追加: 2 つの BrowserContext を起動し、片方で create / toggle wantToBuy / delete した変更が、もう片方の画面で（手動 reload なしに）反映されることを検証
- Backend は **変更なし**（CRUD REST のみ、Realtime 経路には介在しない）

## Capabilities

### New Capabilities
- `realtime-sync`: 本番のリアルタイム同期機構。Frontend が Supabase Realtime の postgres_changes を購読し、`stock_items` の変更を全端末に伝播する。REST 経由で再取得した結果を画面に反映する方式。RLS により anon は SELECT のみ可能。

### Modified Capabilities
- `stock-items-list`: 商品一覧ページの初期描画ロジックは変えないが、Realtime イベント受信時の挙動として「`fetchStockItems` を呼び直して再描画する」要件を追加する。既存の mutate→refetch のフローはそのまま維持。

## Impact

- **Code**:
  - `frontend/src/lib/supabaseClient.ts` (新規) — Supabase JS client の生成
  - `frontend/src/lib/useStockItemsRealtime.ts` (新規) — 購読 hook
  - `frontend/src/app/stock-items/page.tsx` — hook 組込み
  - `frontend/.env.local.example` — env 追加
  - `frontend/package.json` — `@supabase/supabase-js` 追加
  - `frontend/e2e/realtime-sync.spec.ts` (新規) — E2E
  - `backend/db/migrations/002_enable_realtime_stock_items.sql` (新規)
  - `backend/db/migrations/003_stock_items_rls.sql` (新規)
- **Infra**:
  - Supabase Dashboard SQL Editor で `002`/`003` migration を手動適用
  - Vercel に env 2 個を追加（Production/Preview/Development）
  - Supabase Dashboard で `stock_items` の Realtime トグルを ON（migration と等価だが UI 上も確認）
- **Dependencies**: `@supabase/supabase-js` を frontend に追加
- **Backend**: 変更なし。Lambda の `DATABASE_URL` は postgres ロール（RLS 素通り）なので、anon RLS の影響を受けない
- **Risk**:
  - Supabase 無料枠の Realtime 同時接続数（500）以内に収まるか — 家族用途では問題なし
  - 再接続時の取りこぼし — Supabase client が再接続時に SYSTEM event を発火するので、それを契機に `fetchStockItems` を呼べば修復可能

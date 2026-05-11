## Context

Phase 2.5 完了時点で、Frontend (Next.js on Vercel) は Lambda 経由で CRUD を行い、Lambda は Supavisor Session Pooler 経由で Supabase Postgres に接続している。Phase 3 で自前 WebSocket + LISTEN/NOTIFY を学習目的で実装したが、Backend が Lambda + LWA に乗っていて常時稼働できないため、本番ルートでは使えない。

本番のリアルタイム同期は Supabase Realtime（Postgres の logical replication を WebSocket 経由でブロードキャストする managed service）に集約する。Frontend が `@supabase/supabase-js` 経由で直接購読する。Backend は変更なし。

### 現状の制約・前提

- 認証なし・家族共用想定（Google 認証は wishlist）
- Supabase 無料枠（同時 Realtime 接続数 500、月間 200 万メッセージで足りる）
- Frontend は単一の stock-items ページのみ。複雑な state ライブラリは未導入（`useState` 直）
- 既存の mutation 経路は `mutate → fetchStockItems → setItems` で再取得型。Realtime 受信時もこれに合わせる

## Goals / Non-Goals

**Goals:**
- 端末 A で create / update / delete / toggle wantToBuy した変更が、端末 B で **手動 reload なし** に反映される
- 受信イベントは payload を直接 state にマージするのではなく、`fetchStockItems` を呼んで一覧を再取得する（並び順や整合性はサーバに従う）
- RLS を有効化し、anon ロールは `stock_items` の SELECT のみ可能とする。書込みは Lambda 経由のみ
- Realtime 接続が切れても自動再接続し、再接続時に取りこぼしを修復する
- 既存のテスト（unit, integration, E2E）を壊さない

**Non-Goals:**
- イベント payload を直接 state にマージする最適化（latency 削減）。将来の最適化として残す
- Optimistic UI（POST を投げる前に画面更新）。現在の「mutation → refetch」流儀のまま
- Backend の WebSocket / NOTIFY 経路を本番に載せる（Phase 3 で archived 済）
- Realtime の presence / broadcast 機能（postgres_changes のみ使う）
- 認証導入（wishlist 扱い）

## Decisions

### Decision 1: イベント受信時の反映方法 — REST 再取得

`postgres_changes` で INSERT/UPDATE/DELETE のいずれかを受信したら、payload は使わず `fetchStockItems()` を呼んで一覧全体を取得し直す。

**Why:**
- 既存の mutation 経路（mutate → refetch）と一貫する。実装が単純
- 並び順（`updated_at desc`）をクライアント側で再ソートする必要がない
- DELETE で row 内容が要らなくなるので `REPLICA IDENTITY FULL` 不要、`DEFAULT` のままで OK
- 規模が小さい（数十件レベル）ので、再取得のコストは無視できる

**Alternatives considered:**
- A. payload を直接 state にマージ — 即時反映できるが、ソート・重複適用・自己イベント無視のロジックが要る。複雑度に見合わない
- C. Realtime に統一して mutation 後の refetch を削除 — 自分の操作にラグが出る。UX 低下

**Trade-offs:**
- 受信ごとに +1 RTT（300ms 程度）。家族用途では許容範囲
- 同一端末で複数イベントが短時間に届くと連続して fetch する。debounce は当面入れない（必要が出てから）

### Decision 2: RLS ポリシー — anon は SELECT のみ

Supabase Realtime はクライアントが anon key で WebSocket 接続するため、anon key は `NEXT_PUBLIC_*` で公開される。RLS を有効化し、

- `stock_items` SELECT: anon, authenticated 共に許可
- `stock_items` INSERT/UPDATE/DELETE: anon 不許可。`service_role` および `postgres`（Lambda が使う）のみ

**Why:**
- anon key が漏れても、書込み経路は Lambda（postgres ロール）に限定できる
- Realtime は SELECT 権限を持つロールのみが配信を受けるため、anon の SELECT 許可が必要
- 現在の Lambda 接続は postgres ロールで RLS を素通りするため、Backend のコード変更が不要

**Alternatives considered:**
- A. RLS 無効のまま — anon key 経由の SELECT・書込みも素通り。書込みの安全性が落ちる
- C. anon を完全に拒否 — Realtime 配信が anon に届かない。Frontend の購読が成立しない

**Trade-offs:**
- anon key を持つ任意のクライアントが `stock_items` を SELECT できる。家庭外に URL が漏れた場合の情報露出は受容（旧仕様の「認証なし・家族共用」を維持）

### Decision 3: Realtime publication の有効化方法 — SQL migration

`backend/db/migrations/002_enable_realtime_stock_items.sql` を追加し、

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE stock_items;
```

Supabase Dashboard の SQL Editor で手動適用する（既存 migration の運用方針通り）。

**Why:**
- `learning_*.sql` ではなく本番 migration として扱う。番号は `001` の次の `002`
- Supabase Dashboard の UI トグルでも有効化できるが、SQL migration の方がリポジトリと実態の乖離が起きにくい
- `REPLICA IDENTITY` は `DEFAULT` のまま（Decision 1 により DELETE で row 内容が不要）

**Alternatives considered:**
- Dashboard UI のみで設定 — リポジトリと乖離する。CI / 別環境セットアップで再現性が落ちる

### Decision 4: Supabase client の配置と lifecycle

- `frontend/src/lib/supabaseClient.ts` で `createClient(url, anonKey)` を export。シングルトン
- `frontend/src/lib/useStockItemsRealtime.ts` で `useEffect` 内で `client.channel(...).on('postgres_changes', ...).subscribe()` を実行
- アンマウント時に `client.removeChannel(channel)` でクリーンアップ
- 再接続は `@supabase/supabase-js` の内部実装に委ねる（自前 backoff は書かない）
- 切断 → 再接続時にも `onChange` コールバックを 1 度呼ぶ（取りこぼし修復のため）

**Why:**
- Supabase JS client は自前で WebSocket 再接続を扱う（Phoenix Channel 由来）
- 学習用 hook（`useStockItemsWebSocket`）の二の舞は避ける（本番コードは外部ライブラリに依拠）

### Decision 5: Hook の interface

```ts
// frontend/src/lib/useStockItemsRealtime.ts
export function useStockItemsRealtime(onChange: () => void): void;
```

- 戻り値は `void`。`lastEvent` は提供しない（payload を使わない方針）
- `onChange` は INSERT/UPDATE/DELETE のいずれでも呼ばれる。受信側で `fetchStockItems` を呼ぶ
- 再接続成功時にも `onChange` が呼ばれる（取りこぼし修復）

**Why:**
- 機能要件が「変更があった」だけで足りる。種別やペイロードを露出しない方が呼出側がシンプル

### Decision 6: 環境変数

| 変数 | 内容 | 場所 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` | `.env.local.example` / Vercel (Prod/Preview/Dev) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon JWT | 同上 |

未設定時の動作: hook 内で env が空なら `console.warn` を出して購読しない（Realtime なし状態で動作継続）。これにより既存のローカル開発（Supabase 接続なし）も壊さない。

### Decision 7: E2E テスト戦略

- Playwright で 2 つの `BrowserContext` を起動（同一ブラウザ内の別セッション）
- Context1 で「商品を追加」、Context2 で対象商品が表示されることを `waitFor` で確認
- Context1 で wantToBuy をトグル、Context2 で `aria-pressed` の変化を確認
- Context1 で削除、Context2 でカードが消えることを確認
- 既存の `.github/workflows/e2e.yml` に乗せる。Realtime のためには Supabase Realtime に接続できる必要があるが、CI 環境では実 Supabase を使う前提（または local Supabase emulator は導入しない）

**Open question:** E2E を CI で実行する際の Supabase 接続情報をどう持たせるか。現状の E2E は backend + DB testcontainer + frontend で完結しており、Supabase に依存していない。
→ **解決案**: Realtime E2E は別 spec ファイル `realtime-sync.spec.ts` に置き、env (`PLAYWRIGHT_SUPABASE_URL`, `PLAYWRIGHT_SUPABASE_ANON_KEY`) が無ければ `test.skip()` する。CI 上では GitHub Secrets に dev 環境の Supabase キーを保存して投入する。ローカルでは `.env.local` 相当のファイルから読む。

## Risks / Trade-offs

- **anon key の公開** → RLS で書込みを禁止することでリスク範囲を「読み取り情報の漏洩」のみに限定。家族用途では受容
- **Realtime 接続上限（無料枠 500 同時接続）** → 家族用途で問題なし。将来の拡張時に有料プラン検討
- **再接続中の取りこぼし** → 再接続成功時に `onChange` を呼んで `fetchStockItems` で修復
- **イベントが届かないケース（Realtime が落ちる / publication 未設定）** → 既存の mutation→refetch で自端末は最新を保つ。他端末からの更新だけが遅延する → 受容
- **E2E の flakiness（Realtime 遅延で `waitFor` が timeout）** → デフォルト 5 秒の waitFor で十分なはず。flaky なら個別 retry を入れる
- **Vercel env を本番に投入し忘れる** → デプロイ後の手動確認ステップを tasks に明記

## Migration Plan

1. Supabase Dashboard で RLS migration（`003`）と publication migration（`002`）を SQL Editor で実行
2. Vercel に env 2 個を Production / Preview / Development 全環境で追加
3. main へマージ → Vercel auto deploy
4. 本番で 2 端末を開いて手動動作確認（E2E が走るが、念のため）
5. ロールバック: `003_stock_items_rls.sql` を rollback する SQL を逆順に実行（DROP POLICY → DISABLE RLS）。`002` も `ALTER PUBLICATION supabase_realtime DROP TABLE stock_items` で戻せる

## Open Questions

- **Q1**: E2E を CI で実行する Supabase 環境は専用プロジェクトを切るか、本番と共用か
  - 仮置き案: 当面は本番 Supabase で実行（test data prefix で衝突回避）。問題が出たら専用プロジェクトに分離
- **Q2**: hook の `onChange` を debounce すべきか
  - 仮置き案: 当面なし。連続イベントで refetch が走るが、それぞれの fetch は冪等。問題化したら 200ms debounce を追加

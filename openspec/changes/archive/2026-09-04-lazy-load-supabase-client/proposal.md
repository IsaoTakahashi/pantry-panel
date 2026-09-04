## Why

`frontend/src/lib/supabaseClient.ts` は `@supabase/supabase-js` を静的 import しており、`AuthContext.tsx`(ルートレイアウトで全ページを包む `AuthProvider`)がこれを静的 import しているため、`@supabase/supabase-js`(GoTrueClient + RealtimeClient を含む、raw 175KB)は Next.js の共有バンドルに含まれ、`/login` を含む**全ページ**の初回読み込みで同期的にパース・実行される。実測(2026-09-02、`next build --webpack` の生成 HTML 比較)で確認済み: `42-1c18ee16c6f310b4.js`(175KB)が `/login` と `/stock-items` の両方の `<script>` タグに含まれる。

このうち実際に使われるのは、`AuthContext`(GoTrueClient = 認証)と `useStockItemsRealtime`(RealtimeClient = `/stock-items` でのみ使用)。しかし SDK は認証とリアルタイムを1つの `SupabaseClient` インスタンスに統合しており、SDK レベルで両者を分離する手段は無い(`createClient()` が両方を内包)。そのため本変更では、SDK 全体を非同期チャンクとして分離する(認証とリアルタイムを分けて遅延ロードすることはしない)。

Issue #179 epic の初回起動高速化の残り follow-up(Issue #238 のもう一方の項目)。

## What Changes

- `frontend/src/lib/supabaseClient.ts`: `@supabase/supabase-js` の静的 import を動的 `import()` に変更する。`getSupabaseClient()` の戻り値を `SupabaseClient | null` から `Promise<SupabaseClient | null>` に変更する **BREAKING**(呼び出し元3ファイル全てを更新)
- モジュール評価時(`supabaseClient.ts` が最初に import された時点)に動的 import を即座に発火し、Promise をキャッシュする(呼び出し元の実際の呼び出しタイミングを待たない。ネットワーク取得開始を可能な限り早める)
- `frontend/src/contexts/AuthContext.tsx`: `getSupabaseClient()` の2箇所の呼び出し(`getSession` 取得の effect、`onAuthStateChange` 購読の effect)を非同期対応にする(cancel ガード + 遅延クリーンアップ)。`signInWithGoogle`/`signOut`(既に async 関数)は `await` に変更するのみ
- `frontend/src/lib/useStockItemsRealtime.ts`: 購読 effect を非同期対応にする(同様の cancel ガード + 遅延クリーンアップ)
- `frontend/src/components/AuthGuard.tsx`: `authEnabled` の判定を `getSupabaseClient() !== null`(同期呼び出し、レンダー中に使用)から `Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)`(ビルド時にインライン化される環境変数の同期チェック)に変更する

## Capabilities

### New Capabilities

(なし)

### Modified Capabilities

- `production-frontend-runtime`: `/login` を含む全ページの JS バンドルに関する要件を追加する(Supabase SDK を非同期チャンクとして分離する)

`auth-guard` の既存要件(`openspec/specs/auth-guard/spec.md`)は「Supabase 認証が有効な環境で」という挙動レベルの記述のみで、判定の内部実装(SDK ロード成否 vs 環境変数)には言及していない。挙動(`authEnabled` が真になる条件)自体は変えないため、delta spec は不要と判断した

## Impact

- `frontend/src/lib/supabaseClient.ts`(コア変更)
- `frontend/src/contexts/AuthContext.tsx`(#236 で並行フェッチ最適化済みの箇所を含む。回帰させないことが最重要)
- `frontend/src/lib/useStockItemsRealtime.ts`
- `frontend/src/components/AuthGuard.tsx`
- 関連テスト: `supabaseClient.test.ts`, `AuthContext.test.tsx`, `useStockItemsRealtime.test.tsx`, `AuthGuard.test.tsx`, `startupFetch.integration.test.tsx`(#236 の並行化保証テスト。async 化後も discriminator であり続けることを確認する)
- 影響なし: framer-motion 関連(Issue #238 のもう一方の follow-up。PR #244 で完了済み、本変更はスコープ外)

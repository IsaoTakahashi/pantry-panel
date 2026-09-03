## 1. 事前調査(実装前に確認)

- [x] 1.1 `frontend/src/contexts/AuthContext.tsx`・`frontend/src/components/AuthGuard.tsx`・`frontend/src/lib/useStockItemsRealtime.ts` の `getSupabaseClient()` 呼び出し箇所(計6箇所)を再確認する。あわせて `grep -rn "@supabase/supabase-js\|@supabase/" frontend/src/` を実行し、`@supabase/supabase-js` への import が `supabaseClient.ts` 内の動的 import 以外に無いことを確認する(`AuthContext.tsx` の `import type { Session, User } from "@supabase/supabase-js"` は型のみで消去されるため問題ない。他に value import が見つかった場合はそのファイルもチャンク分離の対象として設計を見直す)
- [x] 1.2 `frontend/src/lib/supabaseClient.test.ts`・`frontend/src/contexts/AuthContext.test.tsx`・`frontend/src/components/AuthGuard.test.tsx`・`frontend/src/lib/useStockItemsRealtime.test.tsx`・`frontend/src/app/stock-items/startupFetch.integration.test.tsx` の現状のモック方式(`getSupabaseClient` の同期戻り値を前提にしているか)を確認する

## 2. supabaseClient.ts: 動的 import 化

- [x] 2.1 `@supabase/supabase-js` の静的 import を動的 import に変更し、`getSupabaseClient()` の戻り値を `Promise<SupabaseClient | null>` にする(design.md Decision 1 のコードそのまま)
- [x] 2.2 モジュール評価時に `loadClient()` を即座に発火し `_clientPromise` にキャッシュする
- [x] 2.3 `supabaseClient.test.ts` の3テストを `await getSupabaseClient()` に変更する(env 設定 → import → await の順序は変えない)
- [x] 2.4 テストが green になることを確認する

## 3. AuthContext.tsx: 2つの useEffect の非同期化

- [x] 3.1 `getSession()` 取得の `useEffect`(97-113行目付近)を design.md Decision 2 のパターン(`cancelled` フラグ)で非同期化する。既存のロジック(`setSession`, `setUser`, `loadGroups` 呼び出し、`session` が無い場合の `setLoading(false)`)は変更しない
- [x] 3.2 `onAuthStateChange` 購読の `useEffect`(115-138行目付近)を design.md Decision 2 のパターン(`cancelled` フラグ + 遅延クリーンアップ)で非同期化する
- [x] 3.3 `signInWithGoogle`・`signOut`(既に async 関数)の `getSupabaseClient()` 呼び出しに `await` を追加する
- [x] 3.4 `AuthContext.test.tsx` を実行し、非同期化に伴うタイミング変化で壊れたテストが無いか確認・修正する
- [x] 3.5 `testing.md` 2026-09-01 の基準に従い、2つの到着順序(Promise resolve が先 / unmount が先)をそれぞれ検証するテストケースを、両方の effect(getSession・onAuthStateChange)について追加する(既存テストで既にカバーされていれば追加不要。無ければ追加する)
- [x] 3.6 StrictMode の2重マウントで `onAuthStateChange` の購読が重複しない(または重複しても実害が無い)ことを検証するテストケースを追加する
- [x] 3.7 テストが green になることを確認する

## 4. useStockItemsRealtime.ts: 購読 effect の非同期化

- [x] 4.1 design.md Decision 3 のパターンで購読 effect を非同期化する
- [x] 4.2 `useStockItemsRealtime.test.tsx` を実行し、非同期化に伴うタイミング変化で壊れたテストが無いか確認・修正する
- [x] 4.3 3.5 と同様、2つの到着順序(resolve が先 / unmount が先)を検証するテストケースを追加する(既存でカバー済みなら不要)
- [x] 4.4 テストが green になることを確認する

## 5. AuthGuard.tsx: authEnabled の同期化

- [x] 5.1 `authEnabled` を `getSupabaseClient() !== null` から `Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)` に変更する(design.md Decision 4)。render body での評価を維持する(モジュールスコープ定数にしない)
- [x] 5.2 `AuthGuard.test.tsx` の `@/lib/supabaseClient` モックを削除し、`vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ...)` / `vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ...)` ベースのテストに置き換える(`authEnabled` が true/false になる既存シナリオを維持する)
- [x] 5.3 テストが green になることを確認する

## 6. #236 並行化ガードの健全性確認

- [x] 6.1 `startupFetch.integration.test.tsx` の `supabaseClient` モックを Promise 返却に変更する
- [x] 6.2 変更後、意図的に `AuthContext.tsx` の該当 effect を直列実装(`await getSupabaseClient()` してから同期的に旧ロジックを実行するのではなく、groups 確定を待ってから items フェッチを開始する形)に戻し、該当テストが red になることを確認する(discriminator として機能しているかの確認)。確認後は変更を元に戻す
- [x] 6.3 テストが green になることを確認する(6.2 の確認作業後、正しい実装に戻した状態で)

## 7. ビルド確認・効果検証

- [x] 7.1 `cd frontend && npx next build --webpack` を実行し、`/login` と `/stock-items` の生成 HTML(`.next/server/app/login.html`, `.next/server/app/stock-items.html`)のどちらにも Supabase SDK 由来のチャンクへの同期 `<script>` 参照が無いことを確認する。**ベースライン(2026-09-02実測、PR #244 マージ後)では両ページに `42-*.js`(175KB、`GoTrueClient`+`RealtimeClient` を含む)と `44530001-*.js`(63KB、`GoTrueClient` を含む)の2チャンクが含まれていた。この2チャンク両方について変更後の扱いを明示的に確認・記録する**(両方消えているのが期待結果。`44530001-*` が実は無関係な偶然の文字列一致だった場合はその旨を記録した上でタスク完了として良い)
- [x] 7.2 (pre-merge gate、代替検証で完了扱い) 当初計画は この PR の Vercel Preview URL に対する Issue #236 実測ハーネスの実行だったが、Preview URL が Vercel Deployment Protection(SSO ウォール)で保護されており、ローカルセッションから `VERCEL_BYPASS_TOKEN`(CI 専用 secret)にアクセスできずブロックされた。ユーザーと協議の上、Task 6 の mutation testing による検証(`AuthContext.tsx` を意図的に直列化し `startupFetch.integration.test.tsx` が red になることを実証済み)を pre-merge の代替保証として採用し、本タスクはスキップとする(design.md Risks に判断根拠を記録済み)。post-merge のタスク9.5(本番実測、SSO 保護なし)で実ブラウザでの並行フェッチ構造を最終確認する

## 8. ローカルE2E確認

- [x] 8.1 `cd frontend && npm run dev` でローカルサーバーを起動する(バックエンドも `go run .` で起動する)
- [x] 8.2 `npx playwright test --project=mock` を実行し、ログイン・ログアウト・グループ切替・realtime-sync 系が引き続き pass することを確認する
- [x] 8.3 flakiness 確認のため `--repeat-each=2` で再実行する(`testing.md` の animation-layer 変更に準じた慎重確認。今回は非同期タイミング変更のため同様の基準を適用する)

## 9. CI確認・archive・merge

- [x] 9.1 commit のたびに push し、PR 上の CI が最新状態であることを確認する
- [x] 9.2 `gh pr checks --watch` で CI が green になることを確認する
- [ ] 9.3 マージ前に `opsx:archive` を実施し、specs 同期を feature ブランチ上のコミットに含める
- [ ] 9.4 PR 本文に `Closes #238` と明記してマージする(Issue #238 の残り follow-up はこれで完了)
- [ ] 9.5 (post-merge) 本番デプロイ後、Issue #236 と同様の手法(storageState + Playwright)で warm シナリオを再計測し、記録済みの本番実測値(`groups req@~110ms`, `stock req@~114ms`, `itemsRendered@~230ms`、Issue #236 コメント参照)と比較する。結果を Issue #238 にコメントで記録する

## 1. 事前調査(実装前に確認)

- [x] 1.1 `grep -rn "motion\." frontend/src/` を実行し、`motion.` の使用(コンポーネント使用箇所、import行だけでなく)が `BaseModal.tsx`・`StockItemsClient.tsx`・`MotionProvider.test.tsx` の3ファイル以外に無いことを確認する(`dynamic()` 化された4モーダルの内部実装も対象。`strict` は render 時に `motion.*` があると即クラッシュするため、import 文の grep だけでは不十分)
- [x] 1.2 `frontend/src/components/BaseModal.test.tsx`・`frontend/src/components/ConfirmDialog.test.tsx`・`frontend/src/app/stock-items/StockItemsClient` 関連テストの現状のパターン(アニメーション完了を前提にした同期アサートがあるか)を確認する

**確認済みの事実(実装前に把握済み):**
- 以下 6 ファイルに **バイト単位で同一の** `vi.mock("framer-motion", () => ({ AnimatePresence: ..., motion: { div: ... }, useDragControls: ... }))` ブロックが存在する: `frontend/src/components/BaseModal.test.tsx`, `frontend/src/components/ConfirmDialog.test.tsx`, `frontend/src/components/CreateItemModal.test.tsx`, `frontend/src/components/EditItemModal.test.tsx`, `frontend/src/components/UrlRegistrationModal.test.tsx`, `frontend/src/app/stock-items/page.test.tsx`。いずれも `motion: { div: (props) => <div {...rest}>{children}</div> }` の形で `motion.div` のみをスタブしており、`m` のスタブは無い。`BaseModal.tsx` が `motion` → `m` に変わると、これら6ファイル全てで `m` が `undefined` になり `m.div` の参照でテストが即エラーになる(タイミング起因の flaky ではなく、確実に落ちる)
- `frontend/src/components/MotionProvider.test.tsx` は上記と異なり **`vi.mock` していない実際の framer-motion** を使い、`reducedMotion="user"` 時の tween スキップ挙動を検証する非モックの統合的テスト。`motion.div` を `m.div` に置き換えた後も、`LazyMotion` の非同期 `features` ロードが `await waitFor(...)` のタイムアウト内に解決される前提で成立する(ローカルの動的 import なのでほぼ即時のはず)

**Task 3.3 はこの6ファイルへの機械的な一括修正として扱う:** 各ファイルの `motion: { div: ... }` キーを `m: { div: ... }`(同じ実装)にリネームする(`motion` キーはどのコンポーネントからも参照されなくなるため削除してよい)。6ファイル同一パターンのため1回のdispatchでまとめて行う

## 2. framerMotionFeatures モジュールと LazyMotion 導入

- [x] 2.1 `frontend/src/lib/framerMotionFeatures.ts` を新設し、`domMax` を default export する
- [x] 2.2 `frontend/src/components/MotionProvider.tsx` に `LazyMotion features={loadFeatures} strict` を追加する(`MotionConfig` の内側)
- [x] 2.3 `MotionProvider.test.tsx` の `motion` import・使用箇所を `m` に置き換える(`strict` 違反を避けるため)
- [x] 2.4 `MotionProvider` 関連テストが green になることを確認する

## 3. BaseModal: motion → m

- [x] 3.1 `BaseModal.tsx` の `import { AnimatePresence, motion, useDragControls } from "framer-motion"` を `import { AnimatePresence, m, useDragControls } from "framer-motion"` に変更する
- [x] 3.2 `motion.div` を全て `m.div` に置き換える(scrim・デスクトップダイアログ・モバイルシートの3箇所)
- [x] 3.3 上記「確認済みの事実」記載の6ファイル(`BaseModal.test.tsx`, `ConfirmDialog.test.tsx`, `CreateItemModal.test.tsx`, `EditItemModal.test.tsx`, `UrlRegistrationModal.test.tsx`, `page.test.tsx`)の `vi.mock("framer-motion", ...)` ブロックを `motion: { div: ... }` → `m: { div: ... }` に一括リネームする
- [x] 3.4 テストが green になることを確認する

## 4. StockItemsClient: motion → m、ConfirmDialog の dynamic 化

- [x] 4.1 `StockItemsClient.tsx` の `import { AnimatePresence, motion } from "framer-motion"` を `import { AnimatePresence, m } from "framer-motion"` に変更する
- [x] 4.2 リスト部分の `motion.div`(2箇所、`layout` prop 付き)を `m.div` に置き換える
- [x] 4.3 `import ConfirmDialog from "@/components/ConfirmDialog";` を他4モーダルと同じ `dynamic(() => import("@/components/ConfirmDialog"), { ssr: false })` に変更する
- [x] 4.4 `ConfirmDialog.test.tsx` 自体は `ConfirmDialog` を直接描画するため影響を受けないが、`StockItemsClient` を描画して `handleDelete` → 確認ダイアログ表示をアサートするテスト(`StockItemsClient` 関連テスト、`startupFetch.integration.test.tsx` 等)は `dynamic({ssr:false})` により初回描画が `null` になるため、`waitFor`/`findBy*` 等の非同期待機に置き換える必要がないか確認・修正する
- [x] 4.5 `StockItemsClient` 関連テストが green になることを確認する

## 5. ビルド確認・効果検証

- [x] 5.1 `cd frontend && npx next build --webpack` を実行し、`/login` の生成 HTML(`.next/server/app/login.html`)が framer-motion エンジンチャンクへの `<script>` 参照を含まないことを確認する(変更前と同じであることの確認。元々含んでいなかった。もし新たに含まれるようになっていたら Decision 1 の失敗 = `LazyMotion` の非同期チャンクが root 経由で全ページの共有グラフに hoist されている。design.md の Risks に記載したフォールバック(`LazyMotion` を `/stock-items` サブツリーのみに移す)を適用する)
- [x] 5.2 変更前ベースライン(2026-09-02実測): `/stock-items` の生成 HTML(`.next/server/app/stock-items.html`)は `<script src="/_next/static/chunks/58-99765ec70131c04c.js">`(raw 146KB、framer-motionエンジン本体)を含んでいた。変更後は **この `58-*.js` 相当のエンジンチャンクが `stock-items.html` の `<script>` タグ一覧に存在しないこと**を確認する(ファイル名はビルドごとにハッシュが変わるため、`grep -o` でチャンク一覧を変更前後で比較し、146KB相当のチャンクが `<script>` タグから消えていることを確認する)。まだ残っていればタスク未完了として扱う(「チャンク構成が変化した」という曖昧な確認では不可)

## 6. ローカルE2E確認

- [x] 6.1 `cd frontend && npm run dev` でローカルサーバーを起動する
- [x] 6.2 `npx playwright test` を実行し、modal・filter 系(`testing.md` 2026-06-18 で言及された `not.toBeAttached()` 待機を含むテスト)が引き続き pass することを確認する
- [x] 6.3 手動でモバイル幅・デスクトップ幅それぞれでモーダルの開閉アニメーション(スクリムフェード、スケールイン、下スワイプ閉じる)とフィルタ操作時のカードアニメーションを目視確認する

## 7. CI確認・archive・merge

- [x] 7.1 commit のたびに push し、PR 上の CI が最新状態であることを確認する
- [x] 7.2 `gh pr checks --watch` で CI が green になることを確認する
- [x] 7.3 マージ前に `opsx:archive` を実施し、specs 同期を feature ブランチ上のコミットに含める
- [ ] 7.4 PR 本文に "Part of #238"(Issue #238 は Supabase Realtime 遅延ロードの別 PR が完了するまでクローズしない)と明記してマージする

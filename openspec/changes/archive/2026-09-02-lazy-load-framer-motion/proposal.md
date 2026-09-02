## Why

`/stock-items`(ログイン後の主要ページ)は `ConfirmDialog` が `StockItemsClient.tsx` から静的 import されており、`ConfirmDialog` → `BaseModal` → framer-motion(`motion`/`AnimatePresence`/`useDragControls`)という依存チェーンがルートの同期バンドルに含まれる。`next build --webpack` の実測で `/stock-items` の HTML が読み込む framer-motion エンジンチャンク(`58-*.js`)は 146KB(raw)あり、`/login` など他ページの読み込みチャンクには含まれない(`/stock-items` 固有)。他の4つのモーダル(`CreateItemModal` 等)は既に `next/dynamic({ssr:false})` で遅延化済みだが `ConfirmDialog` だけ取り残されている。framer-motion 自体も `motion`/`AnimatePresence` をトップレベルで直接使っており、アニメーションエンジン本体を同期的にパースしてから初めて描画される状態になっている。

これにより `/stock-items` の初回表示に不要な JS パース時間が乗っている(Issue #179 epic の初回起動高速化の残 follow-up)。

## What Changes

- `ConfirmDialog` の import を他の4モーダルと同様に `next/dynamic({ssr:false})` に変更する
- `BaseModal.tsx` / `StockItemsClient.tsx` の `motion.*` コンポーネントを framer-motion の `LazyMotion` + `m` コンポーネントに置き換える
- `LazyMotion` の `features` にドラッグ(`BaseModal` の `drag`)とレイアウトアニメーション(`StockItemsClient` の `AnimatePresence mode="popLayout"`)の両方に対応する `domMax` バンドルを、`features` prop の非同期ロード形式(動的 import する別ファイルを渡す)で指定し、エンジン本体を非同期チャンクとして分離する
- 既存の `MotionProvider`(`MotionConfig reducedMotion="user"`)はそのまま維持し、`LazyMotion` はその内側(または同階層)に追加する

## Capabilities

### New Capabilities

(なし)

### Modified Capabilities

- `production-frontend-runtime`: `/stock-items` の JS バンドルに関する要件を追加する(framer-motion エンジンを非同期チャンクとして分離する)

## Impact

- `frontend/src/components/BaseModal.tsx`(`motion` → `m`、`LazyMotion` 導入)
- `frontend/src/components/ConfirmDialog.tsx` の呼び出し元 `frontend/src/app/stock-items/StockItemsClient.tsx`(dynamic import 化、`motion` → `m`)
- `frontend/src/components/MotionProvider.tsx`(`LazyMotion` 追加、または新規ファイルで併設)
- 新規: framer-motion features(`domMax`)を非同期 import するための小ファイル
- 関連テスト(`BaseModal` 系、`MotionProvider.test.tsx`、`StockItemsClient` 系)
- 影響なし: `frontend/src/lib/supabaseClient.ts` まわり(Supabase Realtime 遅延ロードは別 Issue/PR で対応。Issue #238 のうち本変更でカバーするのは framer-motion 部分のみ)

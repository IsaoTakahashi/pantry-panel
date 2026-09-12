import { getInitialStockItems } from "./getInitialStockItems";
import StockItemsClient from "./StockItemsClient";

// ここに `<Suspense fallback={<StockItemsSkeleton />}>` を置いてはならない。
// `getInitialStockItems()` は境界より手前で await 済みのため、子が suspend する
// ことは無く、境界は一見無害に見える。しかし実際には、サーバーが同時に複数の
// リクエストを処理して負荷がかかると、React の streaming SSR が
// 「初回フラッシュに間に合わなかった境界」として fallback（スケルトン）を
// その場に描画し、実データの markup を hidden な `<template>` として後追いで
// 送り、インラインスクリプトで差し替える挙動に切り替わる。
// この差し替えスクリプトは JS 無効下では走らないため、初期HTMLに実データが
// 含まれていても永久にスケルトンのままになり、本ブランチの設計目標
// （design.md D2/D3: JS実行前の初期HTMLに商品一覧が描画されていること）を
// 満たせなくなる。`e2e/ssr-stock-items.spec.ts` を並列実行すると再現する
// （境界ありでは 5/5 失敗、境界なしでは 5/5 成功）。
// 境界を置かないことで内容はシェルの一部となり、初回フラッシュに必ず含まれる。
// `layout.tsx` の `export const instant = false` は Cache Components の
// prerender エラーを解消する（ビルドを通す）が、この streaming 挙動までは
// 抑止しない。両方が揃って初めて設計目標が満たされる。
export default async function StockItemsPage() {
  const initialItems = await getInitialStockItems();
  return <StockItemsClient initialItems={initialItems} />;
}

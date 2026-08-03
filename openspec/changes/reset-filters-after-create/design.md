## Context

`StockItemsClient.tsx` は `filter`（`FilterCondition`: `searchText` / `wantToBuyOnly` / `category`）を `useState` で保持し、`CreateItemModal` に `onCreate={handleCreate}`（`useStockItems.ts` 由来）を渡している。`CreateItemModal` は自身の `onCreate(...).then(onClose)` で成功時のみ閉じ、失敗時は `.catch` でインラインエラーを表示して開いたままにする。この「成功したら閉じる」判定と同じシグナルを使えば、追加のフラグや API 変更なしにフィルターリセットを実現できる。

## Goals / Non-Goals

**Goals:**
- 商品作成が成功した直後に `searchText` / `wantToBuyOnly` / `category` を初期値に戻す
- 作成失敗時は既存の挙動（フィルター維持・モーダルは開いたまま）を変更しない
- 「商品を追加」ボタン・URL登録フローのどちらからの作成でも同じ挙動にする

**Non-Goals:**
- `viewMode`（表示密度切り替え）のリセットは対象外
- フィルター状態の永続化（URLクエリ化など）は対象外。引き続き `StockItemsClient` のローカル `useState`

## Decisions

**リセットのトリガー: `CreateItemModal` の `onClose` ではなく `onCreate` のラップで実装する**

- `onClose` は「モーダルを閉じる」汎用コールバックで、キャンセル時（背景クリック等）にも呼ばれる。キャンセル時にフィルターをリセットするのは不要かつ意図しない挙動になる
- `handleCreate` の resolve/reject を直接使うことで「作成成功」だけを正確に捕捉できる。代替案として `useStockItems` フック内で filter state を管理する案もあったが、filter は UI 表示専用の状態であり、フックが持つ責務（API呼び出し・items state管理）とは異なるため見送り、`StockItemsClient` 側でラップする方針にした

```tsx
const handleCreateAndResetFilter = async (
  name: string,
  category: string,
  wantToBuy: boolean,
  imageUrl: string | null,
  sourceUrl: string | null,
) => {
  await handleCreate(name, category, wantToBuy, imageUrl, sourceUrl);
  setFilter({ searchText: "", wantToBuyOnly: false, category: null });
};
```

`CreateItemModal` の `onCreate` prop をこの関数に差し替える。`handleCreate` が reject すれば `await` もそのまま reject し、`setFilter` は実行されない。

## Risks / Trade-offs

- [Risk] モーダルを開いたまま連続で別アイテムを作成するケースで、1件目成功時にフィルターがリセットされ、2件目のプリフィル（カテゴリ等）が変わる → [Mitigation] これは意図した挙動（絞り込み解除がまさに今回の要望）であり、モーダルは開いたままなので入力中の値自体は消えない。プリフィルは次回モーダルオープン時にのみ再評価されるため実害なし

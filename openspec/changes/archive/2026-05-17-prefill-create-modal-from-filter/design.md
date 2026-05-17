## Context

`CreateItemModal` はすでに `initialCategory` prop を受け取り、`useEffect` で `isOpen` 変化時に state を初期化している。同パターンで `initialName` / `initialWantToBuy` prop を追加する。

backend の `CreateStockItemRequest` struct と repository の `Create()` は現在 `name` / `category` のみ受け付けており、`wantToBuy` のサポートが必要。

## Goals / Non-Goals

**Goals:**
- `CreateItemModal` に `initialName` / `initialWantToBuy` prop を追加し、モーダルオープン時に各 state を初期化する
- `CreateItemModal` に `wantToBuy` トグル UI を追加し、作成リクエストに含める
- backend の `POST /api/stock-items` が `wantToBuy` を受け付けるよう拡張する
- `stock-items/page.tsx` で `filter.searchText` / `filter.wantToBuyOnly` を各 initial prop として渡す

**Non-Goals:**
- フィルタークリアの自動化
- カテゴリ以外のフィルター条件（wantToBuyOnly）を filter 表示 UI 側に反映させること

## Decisions

**`initialWantToBuy` の型は `boolean`（undefined なし）**
- `filter.wantToBuyOnly` は常に `boolean` であり undefined の考慮不要
- backend のデフォルト値（false）と合わせる

**既存の `useEffect` を拡張する**
- `isOpen` 変化時にまとめて state をリセットする既存の `useEffect` に `initialName` / `initialWantToBuy` の初期化を追加する

**backend `CreateStockItemRequest.WantToBuy` は `*bool`（ポインタ）**
- nil の場合は既存の DB デフォルト（`DEFAULT false`）に従う
- 既存の `UpdateStockItemRequest` と一貫したパターン

**`wantToBuy` トグルの UI は既存の ItemCard のトグルスタイルに合わせる**
- MdShoppingCart アイコン + teal/gray 背景で統一感を出す

## Risks / Trade-offs

**ユーザーが検索テキストを意図せず商品名に確定してしまうリスク**
→ モーダル内で name フィールドは自由編集可能なので問題なし。

**backend の `want_to_buy` DB カラムにデフォルト値がない場合 NOT NULL エラー**
→ `stock_items` テーブルは `want_to_buy` が `DEFAULT false NOT NULL` である（既存データから確認済み）ので、`WantToBuy` が nil の場合は DB デフォルトが使われ安全。

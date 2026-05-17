## Why

フィルターで検索テキストを入力しながら「商品を追加」ボタンを押す操作は、探している商品が見つからず新規追加する典型的なフローだが、現状では名前欄が空・wantToBuy が false で始まるため再入力が必要になる。searchText・category・wantToBuyOnly の 3 つをモーダルの初期値として引き継ぐことで、この余分な手順を省く。

## What Changes

- `CreateItemModal` に `initialName` / `initialWantToBuy` prop を追加し、モーダルを開いたときに各フィールドを初期化する
- `CreateItemModal` に `wantToBuy` トグル UI を追加し、`onCreate` の引数に含める
- `stock-items/page.tsx` で `initialName={filter.searchText}` / `initialWantToBuy={filter.wantToBuyOnly}` を渡し、`handleCreate` で `wantToBuy` を受け取る
- `CreateStockItemRequest`（frontend 型・backend struct）に `wantToBuy` を追加する
- backend の `Create` repository / handler を `wantToBuy` に対応させ、INSERT に `want_to_buy` を含める
- 各層のテストを更新・追加する

## Capabilities

### New Capabilities

なし（既存のモーダル動作の拡張のみ）

### Modified Capabilities

- `stock-items-list`: 商品追加モーダルを開くときにフィルター条件（searchText / wantToBuyOnly）を名前・wantToBuy フィールドの初期値として引き継ぐ要件を追加
- `stock-items-api`: `POST /api/stock-items` が `wantToBuy` を受け付ける要件を追加

## Impact

- `frontend/src/components/CreateItemModal.tsx`
- `frontend/src/app/stock-items/page.tsx`
- `frontend/src/components/CreateItemModal.test.tsx`
- `frontend/src/types/stockItem.ts`
- `backend/handler/stock_item.go`
- `backend/repository/stock_item_pg.go`（および interface）
- backend テストファイル

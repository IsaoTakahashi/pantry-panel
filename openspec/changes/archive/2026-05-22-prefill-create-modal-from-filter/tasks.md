## 1. Backend: Create API に wantToBuy を追加

- [x] 1.1 `backend/handler/stock_item.go` の `CreateStockItemRequest` struct に `WantToBuy *bool` フィールドを追加する
- [x] 1.2 `backend/repository/stock_item_pg.go` の `Create()` シグネチャに `wantToBuy *bool` 引数を追加し、INSERT クエリに `want_to_buy` を含める（nil の場合は DB デフォルト `false` を使用）
- [x] 1.3 repository interface が別ファイルにある場合、その `Create()` シグネチャも更新する
- [x] 1.4 `backend/handler/stock_item.go` の `Create` ハンドラで `req.WantToBuy` を repository の `Create()` に渡す

## 2. Frontend 型・API クライアント更新

- [x] 2.1 `frontend/src/types/stockItem.ts` の `CreateStockItemRequest` に `wantToBuy?: boolean` を追加する

## 3. CreateItemModal に initialName / initialWantToBuy を追加

- [x] 3.1 `CreateItemModalProps` に `initialName: string` と `initialWantToBuy: boolean` を追加する
- [x] 3.2 `wantToBuy` state と UI トグル（MdShoppingCart アイコン）を追加する
- [x] 3.3 `useEffect` 内で `setName(initialName)` / `setWantToBuy(initialWantToBuy)` を呼び、モーダルオープン時に各 state を初期化する
- [x] 3.4 `onCreate` コールバックの引数に `wantToBuy` を追加する（シグネチャ変更）

## 4. page.tsx の配線更新

- [x] 4.1 `<CreateItemModal>` に `initialName={filter.searchText}` と `initialWantToBuy={filter.wantToBuyOnly}` を追加する
- [x] 4.2 `handleCreate` の引数に `wantToBuy: boolean` を追加し、`createStockItem({ name, category, wantToBuy })` に渡す

## 5. テスト追加・更新

- [x] 5.1 `CreateItemModal.test.tsx` に `initialName` が名前フィールドに初期入力されるテストを追加する
- [x] 5.2 `CreateItemModal.test.tsx` に `initialWantToBuy=true` で買いたいトグルが ON になるテストを追加する
- [x] 5.3 `CreateItemModal.test.tsx` に「モーダルを閉じて再度開くと各 initial prop で再初期化される」テストを追加する
- [x] 5.4 backend の `Create` ハンドラ / repository テストに `wantToBuy=true` で作成するケースを追加する

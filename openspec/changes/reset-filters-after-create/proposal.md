## Why

商品追加は「買いたい物が既に登録済みか、検索文字列と買いたいだけトグルで確認 → 見つからなければそのまま新規作成」という流れで使われる。作成後は絞り込み条件が不要になるが、現状は残り続けるため、ユーザーは毎回手動でフィルターを解除する必要がある。

## What Changes

- 商品の新規作成が成功した時点で、`FilterCondition`（`searchText` / `wantToBuyOnly` / `category`）をすべて初期値にリセットする
- 作成が失敗した場合（例: 409 重複エラー）はフィルターを維持し、モーダルも開いたままにする（既存挙動を変更しない）
- リセットは「商品を追加」ボタン経由・URL登録フロー経由のどちらの作成でも同じ `CreateItemModal` インスタンスを通るため一律に適用される

## Capabilities

### New Capabilities

（なし）

### Modified Capabilities

- `stock-items-list`: 商品作成成功時にフィルター（検索文字列 / wantToBuyOnly / category）をリセットする要件を追加する。既存の「CreateItemModal は filter のカテゴリをデフォルト選択にする」（モーダルを開く時のプリフィル挙動）は変更しない

## Impact

- `frontend/src/app/stock-items/StockItemsClient.tsx`: `CreateItemModal` に渡す `onCreate` をラップし、作成成功後に `setFilter` で初期値に戻す
- `frontend/src/app/stock-items/page.test.tsx`: 作成成功後にフィルターがリセットされることを検証するテストケースを追加

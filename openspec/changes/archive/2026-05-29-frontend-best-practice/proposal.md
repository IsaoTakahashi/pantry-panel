## Why

`StockItemsClient.tsx` がロジック・状態・JSX を 373 行 1 ファイルに集約した God Component になっており、テストや変更の局所化が困難。また、全 CRUD ハンドラが catch を持たないため API エラーがサイレントに無視され、ユーザーに通知されない。`window.confirm` によるシステムダイアログも UI の一貫性を壊している。

## What Changes

- `useStockItems` カスタムフックを新設し、`StockItemsClient.tsx` から state（items / loading / error / modal 開閉）と全 CRUD ハンドラを分離する
- `handleCreate` / `handleSave` / `handleToggleWantToBuy` / `handleDelete` / `handleImageSelect` / `handleRenameGroup` / `handleCreateNewGroup` に try/catch を追加し、失敗時に `error` state をセットして既存の UI で表示する
- `handleDelete` の `window.confirm` を `BaseModal` ベースの `ConfirmDialog` コンポーネントに置き換える
- `StockItemsClient.tsx` は JSX の組み立てのみを担当するプレゼンテーション層に整理する

## Capabilities

### New Capabilities

- `stock-items-client-hook`: `useStockItems` フックの公開 API（state・ハンドラ）と、各ハンドラのエラー処理仕様
- `confirm-dialog`: `ConfirmDialog` コンポーネントの UI・動作仕様（window.confirm 代替）

### Modified Capabilities

- `stock-items-list`: `StockItemsClient` の責務変更（ロジック → フックに移動）と、エラー発生時のユーザー通知仕様の追加

## Impact

- `frontend/src/app/stock-items/StockItemsClient.tsx` — 大幅リファクタリング（ロジック分離）
- `frontend/src/app/stock-items/useStockItems.ts` — 新規作成
- `frontend/src/components/ConfirmDialog.tsx` — 新規作成
- 既存の `StockItemsClient` unit テストは hook テストと JSX テストに分割が必要
- 型定義・インターフェースの変更なし（API 型は `@/types/stockItem` をそのまま使用）

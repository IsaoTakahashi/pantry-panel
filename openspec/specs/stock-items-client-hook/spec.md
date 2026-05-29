# stock-items-client-hook Specification

## Purpose
TBD - created by syncing change frontend-best-practice. Update Purpose after archive.

## Requirements

### Requirement: useStockItems フックが state とハンドラを提供する
`useStockItems` フックは、認証情報（accessToken, activeGroupId）を受け取り、stock items の state 管理と全 CRUD ハンドラを返す SHALL。StockItemsClient の JSX 層はこのフックのみに依存し、API や state を直接参照しない MUST。

#### Scenario: フックが初期 state を返す
- **WHEN** `useStockItems` が初めてレンダリングされる
- **THEN** `items: []`, `loading: true`, `error: null`, 全モーダル開閉フラグ `false` で初期化される

#### Scenario: items が正常取得される
- **WHEN** accessToken と activeGroupId が揃っている状態で fetchStockItems が成功する
- **THEN** `items` が取得データで更新され `loading: false` になる

#### Scenario: items 取得が失敗する
- **WHEN** fetchStockItems が例外を投げる
- **THEN** `error` にエラーメッセージがセットされ `loading: false` になる

### Requirement: 全 CRUD ハンドラがエラーを error state に反映する
`handleCreate`, `handleSave`, `handleToggleWantToBuy`, `handleConfirmDelete`, `handleImageSelect`, `handleRenameGroup`, `handleCreateNewGroup` は、API 呼び出しが失敗したときに `error` state をセットする SHALL。成功時は `setError(null)` でエラーをクリアする MUST。

#### Scenario: handleCreate が API エラーで error をセットする
- **WHEN** `handleCreate` が呼ばれ、`createStockItem` が例外を投げる
- **THEN** `error` に "商品の追加に失敗しました" または例外メッセージがセットされる
- **AND** `items` は変化しない

#### Scenario: handleCreate が成功後に error をクリアする
- **WHEN** `handleCreate` が呼ばれ、`createStockItem` が成功する
- **THEN** `error` が `null` にリセットされる
- **AND** `items` が最新データに更新される

#### Scenario: handleToggleWantToBuy が API エラーで楽観的更新を戻す
- **WHEN** `handleToggleWantToBuy` が呼ばれ、`updateStockItem` が例外を投げる
- **THEN** 楽観的に変更した `items` が元の状態に戻される
- **AND** `error` にエラーメッセージがセットされる

#### Scenario: handleConfirmDelete が API エラーで error をセットする
- **WHEN** `handleConfirmDelete` が呼ばれ、`deleteStockItem` が例外を投げる
- **THEN** `error` にエラーメッセージがセットされる

### Requirement: 削除確認フローが confirmDeleteItem state で管理される
`window.confirm` の代わりに `confirmDeleteItem: StockItem | null` state を使用する SHALL。`handleDelete(item)` は state をセットするだけで削除を実行せず、`handleConfirmDelete()` が実際の削除を行う MUST。

#### Scenario: handleDelete を呼ぶと confirmDeleteItem がセットされる
- **WHEN** `handleDelete(item)` が呼ばれる
- **THEN** `confirmDeleteItem` に該当の item がセットされる
- **AND** 削除 API は呼ばれない

#### Scenario: handleConfirmDelete を呼ぶと削除が実行される
- **WHEN** `handleConfirmDelete()` が呼ばれる
- **THEN** `deleteStockItem` API が呼ばれる
- **AND** 成功後に `confirmDeleteItem` が `null` にリセットされる
- **AND** `items` が再取得で更新される

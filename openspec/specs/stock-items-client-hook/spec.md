# stock-items-client-hook Specification

## Purpose
TBD - created by syncing change frontend-best-practice. Update Purpose after archive.

## Requirements

### Requirement: useStockItems フックが state とハンドラを提供する
`useStockItems` フックは、認証情報(accessToken, effectiveGroupId)を受け取り、stock items の state 管理と全 CRUD ハンドラを返す SHALL。`effectiveGroupId` は確定 `activeGroupId` があればそれを、無ければ `speculativeGroupId`(未確定のキャッシュ値)を使う。StockItemsClient の JSX 層はこのフックのみに依存し、API や state を直接参照しない MUST。

#### Scenario: フックが初期 state を返す
- **WHEN** `useStockItems` が初めてレンダリングされる
- **THEN** `items: []`, `loading: true`, `error: null`, 全モーダル開閉フラグ `false` で初期化される

#### Scenario: items が正常取得される
- **WHEN** accessToken と effectiveGroupId(確定値または推測値)が揃っている状態で fetchStockItems が成功する
- **THEN** `items` が取得データで更新され `loading: false` になる

#### Scenario: 確定 groupId でのフェッチが失敗する
- **WHEN** `effectiveGroupId` が確定 `activeGroupId` である状態(推測フェーズを経ていない、または既に確定済み)で fetchStockItems が例外を投げる
- **THEN** `error` にエラーメッセージがセットされ `loading: false` になる

### Requirement: 推測 groupId による先行フェッチと確定後の整合
`useStockItems` は、`accessToken` があり、確定 `activeGroupId` が未確定でも `speculativeGroupId` があればそれを `effectiveGroupId` として先行フェッチを開始する SHALL(`accessToken` が無い間はフェッチしない MUST)。確定 `activeGroupId` が判明した際、`effectiveGroupId` の値が変化した場合のみ再フェッチする MUST。値が変化しない場合(推測値と確定値が一致)は再フェッチしない MUST。

#### Scenario: 推測groupIdでの先行フェッチが確定前に開始される
- **WHEN** accessToken があり `activeGroupId` は未確定だが `speculativeGroupId` が存在する
- **THEN** `speculativeGroupId` を使って fetchStockItems が呼ばれる

#### Scenario: accessTokenが無い間はフェッチしない
- **WHEN** `speculativeGroupId` はあるが `accessToken` がまだ無い(セッション未解決)
- **THEN** fetchStockItems は呼ばれない
- **AND** `accessToken` が判明した時点で(groups の確定を待たず)フェッチが開始される

#### Scenario: 確定値が推測値と一致する場合は再フェッチしない
- **WHEN** 推測groupIdでの先行フェッチが完了した後、groups 取得が完了し確定 `activeGroupId` が推測値と同じ値である
- **THEN** fetchStockItems は再度呼ばれない
- **AND** 先行フェッチで取得した `items` がそのまま表示される

#### Scenario: 確定値が推測値と異なる場合は確定値で再フェッチする
- **WHEN** 推測groupIdでの先行フェッチが完了した後、groups 取得が完了し確定 `activeGroupId` が推測値と異なる
- **THEN** 確定 `activeGroupId` を使って fetchStockItems が再度呼ばれる
- **AND** 最終的に `items` は確定 `activeGroupId` のデータで表示される

#### Scenario: 推測フェーズのフェッチ失敗はerrorに反映しない
- **WHEN** そのフェッチの失敗が処理される時点(応答到着時、ライブに判定)で `activeGroupId` がまだ未確定である(例: 403 で失敗)
- **THEN** `error` state はセットされない
- **AND** 確定 `activeGroupId` でのフェッチ結果を待つ

#### Scenario: 確定後に判明した推測フェーズの失敗はerrorに反映される
- **WHEN** フェッチ開始時点では未確定だったが、その失敗が処理される時点(応答到着時)には `activeGroupId` が既に同じ id で確定している
- **THEN** `error` state に反映される(確定フェッチの失敗と同様に扱う)

#### Scenario: 推測フェーズの失敗が確定後に同じidと判明したら一度だけ再試行する
- **WHEN** `speculativeGroupId` でのフェッチが未確定の間に失敗し(errorには反映されない)、その後 `activeGroupId` が同じ id で確定する
- **THEN** 確定を契機に同じ id で fetchStockItems が一度だけ再試行される
- **AND** 再試行も失敗した場合は(確定済みのため)`error` state にセットされる

#### Scenario: 確定フェッチより先行フェッチの応答が遅れて返っても確定結果が優先される
- **WHEN** 確定 `activeGroupId` でのフェッチが完了した後に、古い推測groupIdでのフェッチの応答が遅れて返る
- **THEN** 古い応答は `items`/`error` state に反映されない

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

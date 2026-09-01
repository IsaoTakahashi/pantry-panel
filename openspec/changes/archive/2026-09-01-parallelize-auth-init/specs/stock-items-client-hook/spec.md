## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: 推測 groupId による先行フェッチと確定後の整合
`useStockItems` は、確定 `activeGroupId` が未確定でも `speculativeGroupId` があればそれを `effectiveGroupId` として先行フェッチを開始する SHALL。確定 `activeGroupId` が判明した際、`effectiveGroupId` の値が変化した場合のみ再フェッチする MUST。値が変化しない場合(推測値と確定値が一致)は再フェッチしない MUST。

#### Scenario: 推測groupIdでの先行フェッチが確定前に開始される
- **WHEN** accessToken があり `activeGroupId` は未確定だが `speculativeGroupId` が存在する
- **THEN** `speculativeGroupId` を使って fetchStockItems が呼ばれる

#### Scenario: 確定値が推測値と一致する場合は再フェッチしない
- **WHEN** 推測groupIdでの先行フェッチが完了した後、groups 取得が完了し確定 `activeGroupId` が推測値と同じ値である
- **THEN** fetchStockItems は再度呼ばれない
- **AND** 先行フェッチで取得した `items` がそのまま表示される

#### Scenario: 確定値が推測値と異なる場合は確定値で再フェッチする
- **WHEN** 推測groupIdでの先行フェッチが完了した後、groups 取得が完了し確定 `activeGroupId` が推測値と異なる
- **THEN** 確定 `activeGroupId` を使って fetchStockItems が再度呼ばれる
- **AND** 最終的に `items` は確定 `activeGroupId` のデータで表示される

#### Scenario: 推測フェーズのフェッチ失敗はerrorに反映しない
- **WHEN** `activeGroupId` が未確定の間に `speculativeGroupId` での fetchStockItems が例外を投げる(例: 403)
- **THEN** `error` state はセットされない
- **AND** 確定 `activeGroupId` でのフェッチ結果を待つ

#### Scenario: 確定フェッチより先行フェッチの応答が遅れて返っても確定結果が優先される
- **WHEN** 確定 `activeGroupId` でのフェッチが完了した後に、古い推測groupIdでのフェッチの応答が遅れて返る
- **THEN** 古い応答は `items`/`error` state に反映されない

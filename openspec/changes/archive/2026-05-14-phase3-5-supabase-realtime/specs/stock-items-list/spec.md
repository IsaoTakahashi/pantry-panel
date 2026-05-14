## ADDED Requirements

### Requirement: 商品一覧ページは Realtime 受信時に一覧を再取得する
商品一覧ページ (`/stock-items`) は `useStockItemsRealtime` hook を購読し、変更通知を受信した時に `fetchStockItems()` を呼び直して `items` state を更新する MUST。受信ペイロードは MUST NOT 直接 state にマージしない。

#### Scenario: Realtime 通知で一覧が再取得される
- **WHEN** 商品一覧ページが開かれている
- **AND** Realtime が INSERT / UPDATE / DELETE のいずれかを通知する
- **THEN** ページが `fetchStockItems()` を呼ぶ
- **AND** 取得結果で `items` state が置き換えられる
- **AND** filter / viewMode などの UI state は維持される

#### Scenario: ローディング / エラー state は変更されない
- **WHEN** Realtime 通知で `fetchStockItems` を呼ぶ
- **THEN** 初回ロードの `loading` フラグは true に戻さない（無音で再取得する）
- **AND** 取得が失敗してもページ全体の `error` 表示には切り替えず、現在の一覧を維持する

## ADDED Requirements

### Requirement: 商品作成成功時にフィルターをリセットする
`CreateItemModal` からの商品作成が成功した時点で、`FilterCondition`（`searchText` / `wantToBuyOnly` / `category`）を SHALL すべて初期値（`""` / `false` / `null`）にリセットする。作成が失敗した場合はフィルターを SHALL NOT 変更しない。

#### Scenario: 検索文字列でフィルターした状態から作成すると検索文字列がリセットされる
- **WHEN** フィルタの `searchText` が `"醤油"` の状態で「商品を追加」ボタンから商品を作成し、作成が成功する
- **THEN** `searchText` は空文字にリセットされる

#### Scenario: 買いたいだけフィルターをONにした状態から作成するとリセットされる
- **WHEN** フィルタの `wantToBuyOnly` が `true` の状態で商品を作成し、作成が成功する
- **THEN** `wantToBuyOnly` は `false` にリセットされる

#### Scenario: カテゴリでフィルターした状態から作成するとリセットされる
- **WHEN** フィルタの `category` が `"調味料"` の状態で商品を作成し、作成が成功する
- **THEN** `category` は `null` にリセットされる

#### Scenario: 作成が失敗した場合はフィルターを維持する
- **WHEN** フィルタが `searchText: "醤油"` の状態で商品を作成し、API がエラー（例: 409 重複）を返す
- **THEN** フィルタの `searchText` は `"醤油"` のまま維持される
- **AND** モーダルは開いたままエラーメッセージを表示する

#### Scenario: URL登録フロー経由の作成でもフィルターがリセットされる
- **WHEN** フィルタが `wantToBuyOnly: true` の状態で URL 登録フローから `CreateItemModal` を開いて商品を作成し、作成が成功する
- **THEN** `wantToBuyOnly` は `false` にリセットされる

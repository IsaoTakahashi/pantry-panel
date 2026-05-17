## MODIFIED Requirements

### Requirement: CreateItemModal は filter のカテゴリをデフォルト選択にする
`CreateItemModal` を開いた時の各フィールドの初期値は、現在の `FilterCondition` に応じて決定する SHALL。

- `カテゴリ`: `category: null`（「全部」）→ `"★"` / `category: <値>` → 同じ値
- `名前`: `searchText: ""` → 空文字 / `searchText: <値>` → 同じ値
- `買いたい`: `wantToBuyOnly: false` → false / `wantToBuyOnly: true` → true

「選択してください」プレースホルダ option は MUST NOT 表示する（常に有効なカテゴリがデフォルト選択されるため）。

#### Scenario: フィルタ全部の場合
- **WHEN** フィルタが `category: null` の状態で「商品を追加」ボタンを押す
- **THEN** モーダルのカテゴリ select は `"★"` が選択された状態で開く

#### Scenario: フィルタが特定カテゴリの場合
- **WHEN** フィルタが `category: "調味料"` の状態で「商品を追加」ボタンを押す
- **THEN** モーダルのカテゴリ select は `"調味料"` が選択された状態で開く

#### Scenario: 「選択してください」option が存在しない
- **WHEN** モーダルが描画される
- **THEN** カテゴリ select の option に `value=""` のものは存在しない

#### Scenario: 検索テキストが名前フィールドに初期入力される
- **WHEN** フィルタの `searchText` が `"醤油"` の状態で「商品を追加」ボタンを押す
- **THEN** モーダルの名前 input は `"醤油"` が入力された状態で開く

#### Scenario: 検索テキストが空の場合は名前フィールドも空
- **WHEN** フィルタの `searchText` が `""` の状態で「商品を追加」ボタンを押す
- **THEN** モーダルの名前 input は空の状態で開く

#### Scenario: wantToBuyOnly ON のとき買いたいトグルが ON で開く
- **WHEN** フィルタの `wantToBuyOnly` が `true` の状態で「商品を追加」ボタンを押す
- **THEN** モーダルの買いたいトグルは ON（pressed）の状態で開く

#### Scenario: wantToBuyOnly OFF のとき買いたいトグルが OFF で開く
- **WHEN** フィルタの `wantToBuyOnly` が `false` の状態で「商品を追加」ボタンを押す
- **THEN** モーダルの買いたいトグルは OFF の状態で開く

#### Scenario: モーダルを閉じて再度開くとフィルタ条件が再反映される
- **WHEN** モーダルを一度閉じて、フィルタ条件が変わっていない状態で再度「商品を追加」ボタンを押す
- **THEN** 名前・買いたいトグルは再度フィルタ条件の値で初期化される

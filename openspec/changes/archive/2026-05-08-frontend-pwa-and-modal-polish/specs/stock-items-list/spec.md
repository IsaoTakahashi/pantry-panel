## ADDED Requirements

### Requirement: Root URL は /stock-items にリダイレクトする
`/` にアクセスすると `/stock-items` に SHALL リダイレクトする。Create Next App のボイラープレート画面は表示しない MUST。

#### Scenario: ルートアクセスでリダイレクト
- **WHEN** ブラウザで `/` を開く
- **THEN** HTTP 307 で `/stock-items` にリダイレクトされる
- **AND** 商品一覧が表示される

### Requirement: モーダルの背景はクリックを遮断する
`CreateItemModal` および `EditItemModal` を開いている間、モーダル外の UI 要素への操作（クリック / フォーカス）は MUST 不可となる。背景は半透明黒 (`bg-black/50`) で覆う SHALL。

#### Scenario: 背景クリックがモーダル外に届かない
- **WHEN** モーダルが開いている
- **AND** ユーザーがモーダル外（背景 / 表示モードトグル / FilterBar 等）をクリックする
- **THEN** 元 UI の onClick ハンドラが発火しない

#### Scenario: モーダルの aria-modal 属性
- **WHEN** モーダルが開いている
- **THEN** dialog 要素は `aria-modal="true"` を持つ

#### Scenario: モーダルの背景は半透明黒
- **WHEN** モーダルが開いている
- **THEN** 背景レイヤは Tailwind v4 構文 `bg-black/50` 相当のスタイルが適用される

### Requirement: モーダル input / select のテキスト色は濃い
`CreateItemModal` および `EditItemModal` の input / select の入力済み文字は `text-gray-900` 相当の濃い色で表示する MUST。プレースホルダは慣例どおり `text-gray-400` 相当。

#### Scenario: 入力済み文字が濃い
- **WHEN** ユーザーがモーダルの input / select に値を入れる / 選択する
- **THEN** その値は濃い色（`text-gray-900` 相当）で表示される

### Requirement: CreateItemModal は filter のカテゴリをデフォルト選択にする
`CreateItemModal` を開いた時の `カテゴリ` の初期選択は、現在の `FilterCondition.category` に応じて決定する SHALL。
- `category: null`（フィルタ「全部」）→ 初期値 `"★"`
- `category: <値>` → 初期値 同じ値

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

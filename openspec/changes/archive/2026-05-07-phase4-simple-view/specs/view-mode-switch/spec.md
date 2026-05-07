## ADDED Requirements

### Requirement: FilterBar 3段レイアウト
FilterBar は3段構成で UI 要素を配置する SHALL。

- 1段目: 検索 input（フル幅）
- 2段目: 🛒 wantToBuy トグルボタン と カテゴリ select
- 3段目: 表示モードトグル（通常 ⇄ シンプル）

#### Scenario: 1段目に検索 input
- **WHEN** FilterBar が描画される
- **THEN** 1段目に `aria-label="検索"` を持つ input が表示される

#### Scenario: 2段目に 🛒 トグルとカテゴリ select
- **WHEN** FilterBar が描画される
- **THEN** 2段目に `aria-label="買いたいものだけ"` を持つ 🛒 ボタンと、`aria-label="カテゴリ"` の select が表示される

#### Scenario: 3段目に表示モードトグル
- **WHEN** FilterBar が描画される
- **THEN** 3段目に `aria-label="表示モード"` を持つ表示モードトグルが表示される

### Requirement: 🛒 wantToBuy フィルタトグル
「買いたいものだけ」フィルタは 🛒 のアイコンボタンとして提供する SHALL。

#### Scenario: 初期状態は OFF
- **WHEN** ページが初めて描画される
- **THEN** 🛒 ボタンは `aria-pressed="false"` でグレー表示

#### Scenario: クリックで ON
- **WHEN** ユーザーが 🛒 ボタンをクリックする
- **THEN** `aria-pressed="true"` になり、ボタンは teal ベタ塗りになる
- **AND** filter の `wantToBuyOnly` が true に変わる

#### Scenario: 再クリックで OFF
- **WHEN** `aria-pressed="true"` の 🛒 ボタンをクリックする
- **THEN** `aria-pressed="false"` に戻り、グレーになる
- **AND** filter の `wantToBuyOnly` が false に変わる

### Requirement: 表示モードトグル
商品一覧ページに通常 / シンプルの2モードを切り替える `role="switch"` のトグル UI を表示する SHALL。FilterBar の3段目に配置する MUST。

#### Scenario: 初期表示は通常モード
- **WHEN** ページが初めて描画される
- **THEN** 表示モードスイッチは `aria-checked="false"`（=通常モード）
- **AND** 商品は `ItemCard` でレンダリングされる

#### Scenario: シンプルに切り替える
- **WHEN** ユーザーが表示モードスイッチをクリックする
- **THEN** スイッチは `aria-checked="true"` になる
- **AND** 商品は `ItemCardSimple` でレンダリングされる

#### Scenario: 通常に戻す
- **WHEN** シンプルモード中にユーザーが表示モードスイッチをクリックする
- **THEN** スイッチは `aria-checked="false"` になる
- **AND** 商品は `ItemCard` でレンダリングされる

#### Scenario: トグルのアクセシビリティ
- **WHEN** トグルが描画される
- **THEN** `role="switch"` および `aria-label="表示モード"` を持つ
- **AND** 「通常」「シンプル」両方のラベルが視覚的に常時表示される（アクティブ側のみ強調）

### Requirement: 入力系のテキスト色
FilterBar 内の input / select / option の入力済み・選択済みテキストは `text-gray-900` 相当の濃い色で表示する SHALL。プレースホルダーは慣例どおり薄い灰色を維持する。

#### Scenario: 検索 input のテキスト色
- **WHEN** ユーザーが検索 input に文字を入力する
- **THEN** 入力された文字は `text-gray-900` 相当で表示される

#### Scenario: カテゴリ select の選択値の色
- **WHEN** ユーザーがカテゴリを選択している
- **THEN** select の表示テキストは `text-gray-900` 相当で表示される

### Requirement: シンプルカード表示
シンプルモードの商品カードは `[🛒トグル][カテゴリバッジ][商品名]` を1行で表示する SHALL。削除ボタンは描画しない MUST。

#### Scenario: 1行レイアウト
- **WHEN** `ItemCardSimple` が描画される
- **THEN** 🛒 トグルボタン・カテゴリバッジ・商品名がこの順で横並びに表示される

#### Scenario: 削除ボタンが出ない
- **WHEN** `ItemCardSimple` が描画される
- **THEN** 削除ボタンは描画されない

#### Scenario: カードクリックで編集
- **WHEN** ユーザーが `ItemCardSimple` の本体（🛒以外）をクリックする
- **THEN** 編集モーダルが開く（`onEdit` が呼ばれる）

#### Scenario: 🛒 で wantToBuy をトグル
- **WHEN** ユーザーが `ItemCardSimple` の 🛒 ボタンをクリックする
- **THEN** `onToggleWantToBuy` が呼ばれる
- **AND** カードクリック (編集) は発火しない

#### Scenario: wantToBuy=true の視覚状態
- **WHEN** `item.wantToBuy === true`
- **THEN** 🛒 ボタンは teal ベタ塗りで `aria-pressed="true"`

#### Scenario: wantToBuy=false の視覚状態
- **WHEN** `item.wantToBuy === false`
- **THEN** 🛒 ボタンは控えめなグレーで `aria-pressed="false"`

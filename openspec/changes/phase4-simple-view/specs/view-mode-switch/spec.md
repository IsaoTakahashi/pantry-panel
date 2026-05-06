## ADDED Requirements

### Requirement: 表示モードトグル
商品一覧ページに通常 / シンプルの2モードを切り替えるトグル UI を表示する SHALL。FilterBar の3段目に配置する MUST。

#### Scenario: 初期表示は通常モード
- **WHEN** ページが初めて描画される
- **THEN** 「通常」ボタンが選択状態 (`aria-checked="true"`) で、商品は `ItemCard` でレンダリングされる

#### Scenario: シンプルに切り替える
- **WHEN** ユーザーが「シンプル」ボタンをクリックする
- **THEN** 「シンプル」ボタンが `aria-checked="true"` になる
- **AND** 商品は `ItemCardSimple` でレンダリングされる

#### Scenario: 通常に戻す
- **WHEN** シンプルモード中にユーザーが「通常」ボタンをクリックする
- **THEN** 「通常」ボタンが `aria-checked="true"` になる
- **AND** 商品は `ItemCard` でレンダリングされる

#### Scenario: トグルのアクセシビリティ
- **WHEN** トグルが描画される
- **THEN** 親要素は `role="radiogroup"` および `aria-label="表示モード"` を持つ
- **AND** 各ボタンは `role="radio"` と `aria-checked` 属性を持つ

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

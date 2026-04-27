# stock-items-list Specification

## Purpose
TBD - created by archiving change phase1-stock-items-crud. Update Purpose after archive.
## Requirements
### Requirement: Display stock items list
The system SHALL display all stock items on the main page, ordered by most recently updated first.

#### Scenario: No items exist
- **WHEN** the user opens the app and no stock items exist
- **THEN** an empty state message is displayed

#### Scenario: Items exist
- **WHEN** the user opens the app and stock items exist
- **THEN** all items are displayed as cards with name, category, and a wantToBuy toggle button reflecting the current state
- **AND** items are ordered by updated_at descending

#### Scenario: Loading state
- **WHEN** the app is fetching stock items from the API
- **THEN** a loading indicator is displayed

#### Scenario: API error
- **WHEN** the API request fails
- **THEN** an error message is displayed

### Requirement: Create stock item via modal
The system SHALL allow users to create a new stock item through a modal dialog.

#### Scenario: Open creation modal
- **WHEN** the user clicks the "商品を追加" button
- **THEN** a modal opens with name (text input) and category (select) fields

#### Scenario: Successful creation
- **WHEN** the user fills in name and category and submits
- **THEN** the modal closes
- **AND** the new item appears at the top of the list

#### Scenario: Duplicate name error
- **WHEN** the user submits a name that already exists
- **THEN** an error message "その商品は登録済みです" is displayed in the modal

#### Scenario: Validation
- **WHEN** the user tries to submit with an empty name or no category selected
- **THEN** the submit button is disabled

### Requirement: Delete stock item
The system SHALL allow users to delete a stock item that is not in the shopping list.

#### Scenario: Delete button visible
- **WHEN** an item has wantToBuy=false
- **THEN** a delete button is displayed on the card

#### Scenario: Delete button hidden
- **WHEN** an item has wantToBuy=true
- **THEN** the delete button is not displayed (or disabled)

#### Scenario: Confirm and delete
- **WHEN** the user clicks the delete button
- **THEN** a confirmation dialog is displayed
- **AND** upon confirmation, the item is removed from the list

### Requirement: Category options
The system SHALL provide a fixed list of categories for selection.

#### Scenario: Category list
- **WHEN** the user opens the category selector (in creation modal or elsewhere)
- **THEN** the following categories are available: ★, 洗面, 100均, KALDI, 調味料, 飲み物, 缶詰, おかず, おかずの素, おやつ, その他

### Requirement: カードクリックで編集モーダルを開く
ユーザーは商品カードをクリックすることで、その商品の編集モーダルを開くことができる SHALL。削除ボタンのクリックは編集モーダルを開かない MUST。

#### Scenario: カードクリックで編集モーダルが開く
- **WHEN** ユーザーが商品カードをクリックする (削除ボタン以外の領域)
- **THEN** その商品の編集モーダルが、現在の name と category を初期値として開く

#### Scenario: 削除ボタンのクリックは編集モーダルを開かない
- **WHEN** ユーザーが商品カード内の「削除」ボタンをクリックする
- **THEN** 削除確認ダイアログが表示される
- **AND** 編集モーダルは開かない

#### Scenario: キーボード操作
- **WHEN** ユーザーがキーボードでカードにフォーカスし Enter または Space を押す
- **THEN** 編集モーダルが開く

### Requirement: 買いたいリストへのトグル
ユーザーは商品カード上のトグルボタンで wantToBuy 状態を切り替えることができる SHALL。トグルは編集モーダルを開かない MUST。

#### Scenario: トグルボタンが常に表示される
- **WHEN** 商品カードが描画される (wantToBuy の値に関わらず)
- **THEN** カード内にトグルボタンが表示される
- **AND** ボタンの状態が `aria-pressed` 属性で示される (true/false)

#### Scenario: wantToBuy=false のときの視覚状態
- **WHEN** 商品の wantToBuy が false
- **THEN** トグルボタンは控えめな (灰色等) スタイルで表示される
- **AND** `aria-pressed="false"` が設定される

#### Scenario: wantToBuy=true のときの視覚状態
- **WHEN** 商品の wantToBuy が true
- **THEN** トグルボタンは強調 (teal の塗り) スタイルで表示される
- **AND** `aria-pressed="true"` が設定される

#### Scenario: トグルクリックで wantToBuy が反転し一覧が更新される
- **WHEN** ユーザーがトグルボタンをクリックする
- **THEN** `PATCH /api/stock-items/:id` が `{ wantToBuy: !current }` で呼ばれる
- **AND** 成功すると一覧が再取得され、対象商品は `updated_at DESC` の並びで先頭に来る

#### Scenario: トグルは編集モーダルを開かない
- **WHEN** ユーザーがトグルボタンをクリックする
- **THEN** 編集モーダルは開かない

#### Scenario: トグル成功で削除ボタンの有効/無効が切り替わる
- **WHEN** wantToBuy が false から true に切り替わる
- **THEN** 削除ボタンが disabled になる

- **WHEN** wantToBuy が true から false に切り替わる
- **THEN** 削除ボタンが enabled に戻る


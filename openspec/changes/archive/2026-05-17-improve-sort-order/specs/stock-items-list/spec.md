## MODIFIED Requirements

### Requirement: Display stock items list
The system SHALL display all stock items on the main page, ordered by sorted_at descending. Items MAY be filtered by user-controlled criteria (search text, wantToBuy, category).

#### Scenario: No items exist
- **WHEN** the user opens the app and no stock items exist
- **THEN** an empty state message "商品がありません" is displayed

#### Scenario: Items exist
- **WHEN** the user opens the app and stock items exist
- **THEN** all items matching the current filter are displayed as cards with name, category, and a wantToBuy toggle button reflecting the current state
- **AND** items are ordered by sorted_at descending

#### Scenario: Loading state
- **WHEN** the app is fetching stock items from the API
- **THEN** a loading indicator is displayed

#### Scenario: API error
- **WHEN** the API request fails
- **THEN** an error message is displayed

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

#### Scenario: wantToBuy を true にすると先頭に移動する
- **WHEN** ユーザーがトグルボタンをクリックして wantToBuy が false から true になる
- **THEN** `PATCH /api/stock-items/:id` が `{ wantToBuy: true }` で呼ばれる
- **AND** 成功すると一覧が再取得され、対象商品は sorted_at DESC の並びで先頭に来る

#### Scenario: wantToBuy を false にしても順序は変わらない
- **WHEN** ユーザーがトグルボタンをクリックして wantToBuy が true から false になる
- **THEN** `PATCH /api/stock-items/:id` が `{ wantToBuy: false }` で呼ばれる
- **AND** 成功すると一覧が再取得されるが、対象商品の位置は変わらない

#### Scenario: トグルは編集モーダルを開かない
- **WHEN** ユーザーがトグルボタンをクリックする
- **THEN** 編集モーダルは開かない

#### Scenario: トグル成功で削除ボタンの有効/無効が切り替わる
- **WHEN** wantToBuy が false から true に切り替わる
- **THEN** 削除ボタンが disabled になる

- **WHEN** wantToBuy が true から false に切り替わる
- **THEN** 削除ボタンが enabled に戻る

## ADDED Requirements

### Requirement: 一覧をフィルタリングできる
ユーザーは商品名検索・買いたいリストトグル・カテゴリ選択の 3 軸で一覧をフィルタリングできる SHALL。すべてのフィルタは AND で結合される MUST。

#### Scenario: 初期状態では全商品が表示される
- **WHEN** ユーザーがページを開く
- **THEN** フィルタは未指定 (検索テキスト空・買いたいだけ OFF・カテゴリ「全部」)
- **AND** 全商品が表示される

#### Scenario: 商品名で部分一致検索する
- **WHEN** ユーザーが検索ボックスに文字列を入力する
- **THEN** 商品名にその文字列を含む商品のみが表示される
- **AND** 入力するたびにリアルタイムで絞り込みが反映される

#### Scenario: 検索クリアボタンで検索を解除する
- **WHEN** 検索ボックスに文字が入っている状態でクリアボタンをクリックする
- **THEN** 検索ボックスが空になり、検索条件が解除される

#### Scenario: 検索ボックスが空のときクリアボタンは表示されない
- **WHEN** 検索ボックスが空である
- **THEN** クリアボタンは表示されない

#### Scenario: 「買いたいだけ」トグルで wantToBuy=true のみ表示する
- **WHEN** ユーザーが「買いたいだけ」トグルを ON にする
- **THEN** wantToBuy=true の商品のみが表示される

#### Scenario: 「買いたいだけ」トグル OFF で全件対象に戻る
- **WHEN** ユーザーが「買いたいだけ」トグルを OFF にする
- **THEN** wantToBuy の値による絞り込みが解除される

#### Scenario: カテゴリ select で特定カテゴリのみ表示する
- **WHEN** ユーザーがカテゴリ select で「調味料」を選ぶ
- **THEN** category が「調味料」の商品のみが表示される

#### Scenario: カテゴリ「全部」で全カテゴリ対象に戻る
- **WHEN** ユーザーがカテゴリ select で「全部」を選ぶ
- **THEN** カテゴリによる絞り込みが解除される

#### Scenario: 複数フィルタの AND 結合
- **WHEN** 検索テキスト「醤」、買いたいだけ ON、カテゴリ「調味料」を同時に指定する
- **THEN** 商品名に「醤」を含み、wantToBuy=true で、category=「調味料」の商品のみが表示される

#### Scenario: フィルタ適用後 0 件のとき該当なしメッセージを表示する
- **WHEN** フィルタ適用後の商品が 0 件である
- **AND** 元の商品データは 1 件以上ある
- **THEN** 「該当する商品がありません」メッセージが表示される

## MODIFIED Requirements

### Requirement: Display stock items list
The system SHALL display all stock items on the main page, ordered by most recently updated first. Items MAY be filtered by user-controlled criteria (search text, wantToBuy, category).

#### Scenario: No items exist
- **WHEN** the user opens the app and no stock items exist
- **THEN** an empty state message "商品がありません" is displayed

#### Scenario: Items exist
- **WHEN** the user opens the app and stock items exist
- **THEN** all items matching the current filter are displayed as cards with name, category, and a wantToBuy toggle button reflecting the current state
- **AND** items are ordered by updated_at descending

#### Scenario: Loading state
- **WHEN** the app is fetching stock items from the API
- **THEN** a loading indicator is displayed

#### Scenario: API error
- **WHEN** the API request fails
- **THEN** an error message is displayed

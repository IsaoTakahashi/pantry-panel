# stock-items-list Specification

## Purpose
TBD - created by archiving change phase1-stock-items-crud. Update Purpose after archive.
## Requirements
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

### Requirement: 商品一覧の表示密度
商品一覧は、より多くの商品を一画面に表示できるよう、フィルターエリアとグリッドの間の余白を最小限に抑える SHALL。

#### Scenario: フィルターエリア下の余白
- **WHEN** 商品一覧ページが描画される
- **THEN** フィルターバー・商品追加ボタンと商品グリッドの間のマージンは `mb-4` 以下である

### Requirement: API error on mutation shows user-facing message
When a CRUD mutation (create / update / delete / image select / group rename / group create) fails, the system SHALL display an error message to the user. Silent failures are NOT acceptable. The error message SHALL be shown in the existing inline error display area.

#### Scenario: Create item fails
- **WHEN** the user submits a new item and the API returns an error
- **THEN** the modal closes (or stays open based on implementation)
- **AND** an error message is displayed in the main page error area

#### Scenario: Toggle wantToBuy fails
- **WHEN** the user toggles wantToBuy and the API returns an error
- **THEN** the item's wantToBuy state is reverted to its original value
- **AND** an error message is displayed

#### Scenario: Delete item fails
- **WHEN** the user confirms deletion and the API returns an error
- **THEN** the item is NOT removed from the list
- **AND** an error message is displayed

### Requirement: Delete confirmation uses in-app dialog
The system SHALL use an in-app `ConfirmDialog` component for delete confirmation instead of `window.confirm`. The dialog MUST be dismissable and MUST require explicit confirmation before deletion proceeds.

#### Scenario: Delete button triggers ConfirmDialog
- **WHEN** the user clicks the delete button on an item
- **THEN** a `ConfirmDialog` appears showing the item name
- **AND** no deletion API call is made yet

#### Scenario: Cancel in ConfirmDialog aborts deletion
- **WHEN** the user clicks "キャンセル" in the ConfirmDialog
- **THEN** the dialog closes and the item is NOT deleted


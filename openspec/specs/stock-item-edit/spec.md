# stock-item-edit Specification

## Purpose
TBD - created by archiving change phase2-edit-item. Update Purpose after archive.
## Requirements
### Requirement: 商品情報編集モーダルの表示
ユーザーは編集モーダルから商品の name と category を 1 つの画面で同時に編集できる SHALL。モーダルは現在の値で初期化され、未変更でも送信できる MUST。

#### Scenario: 編集モーダルの初期値
- **WHEN** ユーザーが既存の商品の編集モーダルを開く
- **THEN** name 入力欄に現在の商品名が、category セレクトに現在のカテゴリが選択された状態で表示される

#### Scenario: 編集モーダルのフィールド
- **WHEN** 編集モーダルが描画される
- **THEN** name (text input)、category (select、固定リストから選択) の 2 項目が表示される
- **AND** 「保存」ボタンと「キャンセル」ボタンが表示される

#### Scenario: 必須項目のバリデーション
- **WHEN** name が空、または category が未選択の状態
- **THEN** 「保存」ボタンは disabled になる

### Requirement: 商品情報編集の送信
ユーザーが「保存」ボタンを押すと、システムは `PATCH /api/stock-items/:id` を呼び出し、結果を一覧に反映する SHALL。

#### Scenario: 編集の成功
- **WHEN** ユーザーが値を変更して「保存」を押し、API が成功レスポンスを返す
- **THEN** モーダルが閉じる
- **AND** 一覧が再取得され、編集内容と更新後の並び順 (`updated_at DESC`) が反映される

#### Scenario: 重複名のエラー
- **WHEN** ユーザーが既存の他商品と同じ名前に変更して送信し、API が 409 を返す
- **THEN** モーダル内に「その商品は登録済みです」のメッセージが表示される
- **AND** モーダルは閉じない

#### Scenario: その他のエラー
- **WHEN** API がネットワークエラーまたは 500 系を返す
- **THEN** モーダル内にエラーメッセージが表示される
- **AND** モーダルは閉じない

### Requirement: 編集モーダルのキャンセル
ユーザーは編集を中断し、変更を破棄できる SHALL。

#### Scenario: キャンセルボタンで閉じる
- **WHEN** ユーザーが「キャンセル」ボタンを押す
- **THEN** モーダルが閉じる
- **AND** API は呼び出されない
- **AND** 商品の値は変更されない


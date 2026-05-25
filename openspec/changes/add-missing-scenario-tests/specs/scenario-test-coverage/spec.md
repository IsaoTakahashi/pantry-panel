## ADDED Requirements

### Requirement: シナリオ B-4/B-5/B-6 のフィルタ→初期値連携がテストされること
フロントエンドのフィルタ状態（検索テキスト・カテゴリ・買い物リスト）が「商品を追加」モーダルの初期値に正しく連携されることを Unit テストで検証しなければならない（SHALL）。

#### Scenario: 検索テキストが商品名初期値にセットされる
- **WHEN** 検索テキスト「牛乳」が入力された状態で「商品を追加」を押す
- **THEN** CreateItemModal が `initialName="牛乳"` でレンダリングされる

#### Scenario: カテゴリフィルタがカテゴリ初期値にセットされる
- **WHEN** カテゴリフィルタ「飲み物」が選択された状態で「商品を追加」を押す
- **THEN** CreateItemModal が `initialCategory="飲み物"` でレンダリングされる

#### Scenario: 買い物リストフィルタ ON で wantToBuy=true
- **WHEN** 買い物リストフィルタが ON の状態で商品を作成
- **THEN** `createStockItem` に `wantToBuy: true` が渡される

---

### Requirement: シナリオ D-3/E-2 のソートキー不変性がテストされること
商品名編集・wantToBuy OFF 操作ではソートキー（sortedAt）が更新されないことを Unit テストで検証しなければならない（SHALL）。

#### Scenario: 商品名編集でソートキーが更新されない
- **WHEN** 商品名を変更して保存する
- **THEN** `updateStockItem` の引数に `sortedAt` が含まれない

#### Scenario: wantToBuy を OFF にしてもソートキーが更新されない
- **WHEN** wantToBuy=true の商品のカートアイコンをクリックして OFF にする
- **THEN** `updateStockItem` の引数に `sortedAt` が含まれない

---

### Requirement: シナリオ E-3 の視覚的強調がテストされること
wantToBuy=true の ItemCard でカートアイコンに強調スタイルが適用されることを Unit テストで検証しなければならない（SHALL）。

#### Scenario: wantToBuy=true でカートアイコンが強調される
- **WHEN** ItemCard が wantToBuy=true でレンダリングされる
- **THEN** カートアイコン要素が強調スタイル（CSS クラスまたは aria-pressed）を持つ

---

### Requirement: シナリオ I-6 の CSE エラー表示がテストされること
Google CSE が 503 を返したとき ImageSelectionModal にエラーメッセージが表示されることを Unit テストで検証しなければならない（SHALL）。

#### Scenario: CSE 未設定時のエラー表示
- **WHEN** 画像検索 API が 503 エラーを返す
- **THEN** ImageSelectionModal にエラーメッセージが表示される

---

### Requirement: シナリオ J-1-4 の外部リンクアイコン表示がテストされること
sourceUrl が非 null の ItemCard に外部リンクアイコンが表示されることを Unit テストで検証しなければならない（SHALL）。

#### Scenario: sourceUrl あり → 外部リンクアイコン表示
- **WHEN** ItemCard が sourceUrl 非 null でレンダリングされる
- **THEN** 外部リンクアイコンが表示される

#### Scenario: sourceUrl なし → 外部リンクアイコン非表示
- **WHEN** ItemCard が sourceUrl=null でレンダリングされる
- **THEN** 外部リンクアイコンが表示されない

---

### Requirement: シナリオ J-3-3 の SSE 完了後 UI 遷移がテストされること
SSE ストリーム完了後に進捗リストが消えて抽出結果が表示されることを Unit テストで検証しなければならない（SHALL）。

#### Scenario: SSE 完了後に進捗リストが消えて結果表示
- **WHEN** SSE ストリームが完了イベントと結果を返す
- **THEN** 進捗リストが消え、抽出された商品名・画像 URL が表示される

---

### Requirement: シナリオ K-4 のログアウト動作がテストされること
ヘッダーのログアウトボタンをクリックすると signOut が呼ばれてログイン画面にリダイレクトされることを Unit テストで検証しなければならない（SHALL）。

#### Scenario: ログアウトボタンクリックで signOut 呼出
- **WHEN** ヘッダーのログアウトボタンをクリック
- **THEN** `signOut` が呼ばれ、ログイン画面にリダイレクトされる

---

### Requirement: シナリオ L-6 の RLS グループ分離がテストされること
別グループのユーザーが他グループの stock_item にアクセス・変更できないことを Integration テスト（testcontainers）で検証しなければならない（SHALL）。

#### Scenario: 別グループの stock_item は取得されない
- **WHEN** ユーザー B（group_id=B）として stock_items を取得
- **THEN** ユーザー A（group_id=A）の stock_item は返ってこない

#### Scenario: 別グループの stock_item は更新できない
- **WHEN** ユーザー B として ユーザー A の stock_item を更新
- **THEN** 更新が失敗するか変更が反映されない

## Why

`specs/scenarios.md` に整理したユーザーシナリオ A〜L に対してテストカバレッジを分析した結果、10 件以上のシナリオがテストされていないことが判明した。特に「フィルタ状態からの商品登録初期値連携」「ソートキーの不変性」「グループ間 RLS 分離」など、正確なビジネスロジックに関わるシナリオが未検証のまま残っている。

## What Changes

- `frontend/src/app/stock-items/page.test.tsx` にシナリオ B-4/B-5/B-6/D-3/E-2/K-4 のテストを追加
- `frontend/src/components/ItemCard.test.tsx` にシナリオ E-3/J-1-4 のテストを追加
- `frontend/src/components/UrlRegistrationModal.test.tsx` にシナリオ J-3-3 のテストを追加
- `frontend/src/components/ImageSelectionModal.test.tsx` にシナリオ I-6 のテストを追加
- `backend/repository/stock_item_test.go` にシナリオ L-6（RLS 分離）のテストを追加

## Capabilities

### New Capabilities

なし（テスト追加のみ。プロダクトの振る舞いは変更しない）

### Modified Capabilities

なし

## Impact

- テストファイルのみ変更。プロダクションコードへの変更なし
- Backend: `testcontainers` を使用した既存の Integration テスト基盤を流用
- Frontend: 既存の `vitest` + `@testing-library/react` のモック構成を流用

## ユーザーシナリオとテスト設計

### サマリテーブル

| シナリオ ID | 内容 | テストスコープ | 環境 |
|------------|------|--------------|------|
| B-4 | 検索テキスト入力済み → 商品名の初期値にセット | Unit (page) | Mock |
| B-5 | カテゴリフィルタ選択済み → カテゴリの初期値にセット | Unit (page) | Mock |
| B-6 | 買い物リストフィルタ ON → wantToBuy=true で登録 | Unit (page) | Mock |
| D-3 | 商品名編集後ソートキー更新なし | Unit (page) | Mock |
| E-2 | wantToBuy OFF 後に一覧順変化なし | Unit (page) | Mock |
| E-3 | wantToBuy=true 時の視覚的強調 | Unit (ItemCard) | Mock |
| I-6 | CSE 未設定時の ImageSelectionModal エラー表示 | Unit (ImageSelectionModal) | Mock |
| J-1-4 | sourceUrl 非 null → ItemCard に外部リンクアイコン | Unit (ItemCard) | Mock |
| J-3-3 | SSE 完了後に進捗リストが消えて結果表示に切替 | Unit (UrlRegistrationModal) | Mock |
| K-4 | ログアウトボタンクリック → signOut 呼出 + リダイレクト | Unit (page) | Mock |
| L-6 | 他グループの stock_item に RLS で拒否されること | Integration (repository) | testcontainers |

### 各シナリオの詳細

#### B-4: 検索テキスト入力済み → 商品名の初期値
- **GIVEN** 検索テキスト「牛乳」が入力された状態
- **WHEN** 「商品を追加」ボタンをクリック
- **THEN** CreateItemModal が `initialName="牛乳"` で開く

#### B-5: カテゴリフィルタ選択済み → カテゴリの初期値
- **GIVEN** カテゴリフィルタ「飲み物」が選択された状態
- **WHEN** 「商品を追加」ボタンをクリック
- **THEN** CreateItemModal が `initialCategory="飲み物"` で開く

#### B-6: 買い物リストフィルタ ON → wantToBuy=true
- **GIVEN** 買い物リストフィルタが ON の状態
- **WHEN** 「商品を追加」から新しい商品を作成
- **THEN** `createStockItem` に `wantToBuy: true` が渡される

#### D-3: 商品名編集後ソートキー更新なし
- **GIVEN** 商品一覧が表示されている
- **WHEN** 商品名を変更して保存
- **THEN** `updateStockItem` の引数に `sortedAt` が含まれない

#### E-2: wantToBuy OFF 後に一覧順変化なし
- **GIVEN** wantToBuy=true の商品がある
- **WHEN** カートアイコンをクリックして wantToBuy を OFF にする
- **THEN** `updateStockItem` の引数に `sortedAt` が含まれない

#### E-3: wantToBuy=true 時の視覚的強調
- **GIVEN** ItemCard が wantToBuy=true でレンダリングされる
- **WHEN** コンポーネントを確認
- **THEN** カートアイコンが強調スタイル（active クラスまたは特定の色クラス）を持つ

#### I-6: CSE 未設定時のエラー表示
- **GIVEN** API モックが 503 を返すよう設定されている
- **WHEN** ImageSelectionModal が開く（自動検索が走る）
- **THEN** エラーメッセージが表示される

#### J-1-4: sourceUrl 非 null → 外部リンクアイコン
- **GIVEN** ItemCard が sourceUrl を持つ商品でレンダリングされる
- **WHEN** コンポーネントを確認
- **THEN** 外部リンクアイコン（MdOpenInNew など）が表示される
- **GIVEN** ItemCard が sourceUrl=null の商品でレンダリングされる
- **THEN** 外部リンクアイコンが表示されない

#### J-3-3: SSE 完了後に進捗リストが消えて結果表示へ切替
- **GIVEN** SSE ストリームが進捗イベントの後に完了イベントと結果を返す
- **WHEN** ストリームが完了する
- **THEN** 進捗ステップリストが消え、抽出された商品名・画像が表示される

#### K-4: ログアウトボタン
- **GIVEN** 認証済みユーザーがログインしている
- **WHEN** ヘッダーのログアウトボタンをクリック
- **THEN** `signOut` が呼ばれ、ログイン画面にリダイレクトされる

#### L-6: RLS によるグループ間データ分離
- **GIVEN** ユーザー A（group_id=A）の stock_item が存在する
- **WHEN** ユーザー B（group_id=B）として GET / PATCH / DELETE を実行
- **THEN** 取得結果が空 or 権限エラーになり、ユーザー A のデータは変更されない

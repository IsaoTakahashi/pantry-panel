# Wishlist（実装済み）

wishlist.md に記載していた機能のうち、実装が完了したもの。

## AI による商品登録

### Web ページからの商品登録

商品の紹介 Web ページの URL を入力すると、ページ内容から商品名・商品画像を AI で抽出し、商品として登録する。URLを商品データの `source_url` フィールドとして保存する。

実装: PR #94 / Issue #93

### URL 登録機能の改善1: エラー詳細の表示

取得・抽出失敗時にレスポンスの `detail` フィールドから技術的な情報を取得し、「詳細を表示」折り畳みセクションで表示する。バックエンドは `ErrorResponse` に `detail` フィールドを追加。

実装: PR #98 / Issue #109（openspec: `2026-05-23-url-extract-error-detail-and-source-url`）

### URL 登録機能の改善3: source_url の保存と ItemCard リンクアイコン

`stock_items` テーブルに `source_url TEXT` カラムを追加。URL 登録した商品に対して `ItemCard` に外部リンクアイコン（別タブで開く）を表示する。

実装: PR #98 / Issue #109（openspec: `2026-05-23-url-extract-error-detail-and-source-url`）

## Google 認証

Supabase Auth を使った Google ログインを導入。グループ単位でデータを分離し、JWT ミドルウェアで API を保護。フロントエンドに認証フロー・グループ管理 UI を追加。RLS ポリシーも整備。

実装: PR #80（認証基盤）/ PR #86（グループ名編集・複数グループ切り替え）/ PR #106（RLS 無限再帰修正）

## UX改善

### フィルター条件が入力されている状態で商品追加ボタンを押すと初期入力される

検索文字列やwant-to-buyトグルの内容を、商品追加ダイアログの初期値として利用することで、入力の手間を省く

実装: PR #69 / Issue #68

### 並び替えが変わる(トップに表示される)条件の改善

商品の新規追加、want-to-buyのOn変更については商品がトップに移動すようにするが、それ以外(商品名変更、want-to-buyのoff変更、画像変更)の場合には変更しないようにする。そのためにソートキーが別途必要なら追加する。

実装: PR #74 / Issue #73
## 1. DB Migration

- [x] 1.1 `backend/db/migrations/` に `005_add_source_url_to_stock_items.sql` を追加し、`ALTER TABLE stock_items ADD COLUMN source_url TEXT;` を記述する
- [x] 1.2 Supabase SQL Editor で migration を実行する

## 2. Backend: エラーレスポンスに detail フィールドを追加

- [x] 2.1 `backend/handler/stock_item.go` の `ErrorResponse` 構造体に `Detail string \`json:"detail,omitempty"\`` を追加する
- [x] 2.2 `backend/handler/url_extract.go` の各エラー分岐（`ErrFetchFailed`、`ErrExtractionFailed`）で、`urlextract` パッケージから返ってくる `err` の文字列を `Detail` に設定する
- [x] 2.3 `urlextract` パッケージ（`extractor.go`、`jina_fetcher.go` 等）のエラーが `detail` に使える情報（step 名 + 元のエラー文字列）を含むよう `fmt.Errorf("step1: %w", ...)` 形式でラップされていることを確認し、必要に応じて修正する
- [x] 2.4 `backend/handler/url_extract_test.go` を更新し、502・422 レスポンスの body に `detail` フィールドが含まれることをアサートするテストを追加する

## 3. Backend: source_url を CRUD に追加

- [x] 3.1 `backend/repository/stock_item_pg.go` の `StockItem` 構造体に `SourceURL *string \`db:"source_url" json:"sourceUrl"\`` を追加する
- [x] 3.2 `stockItemColumns` 定数に `source_url` を追加する
- [x] 3.3 `Create` メソッドのシグネチャに `sourceURL *string` を追加し、INSERT クエリに組み込む
- [x] 3.4 `UpdateParams` 構造体に `SourceURL` フィールドを追加し、`Update` メソッドの UPDATE クエリに組み込む（`imageUrl` と同様の `Optional` パターンで）
- [x] 3.5 `backend/handler/stock_item.go` の `CreateStockItemRequest` に `SourceURL *string` を追加し、ハンドラーから `repository.Create` に渡す
- [x] 3.6 `backend/handler/stock_item.go` の `UpdateStockItemRequest` に `SourceURL` を追加し、ハンドラーから `repository.Update` に渡す
- [x] 3.7 `backend/handler/stock_item_test.go` を更新し、`sourceUrl` フィールドの Create/Update/List 動作をテストするケースを追加する
- [x] 3.8 `backend/repository/stock_item_test.go` を更新し、`source_url` カラムの CRUD をカバーするテストを追加する

## 4. Frontend: 型・API クライアントを更新

- [x] 4.1 `frontend/src/types/stockItem.ts` の `StockItem` 型に `sourceUrl: string | null` を追加する
- [x] 4.2 `CreateStockItemRequest` 型に `sourceUrl?: string` を追加する
- [x] 4.3 `UpdateStockItemRequest` 型に `sourceUrl?: string | null` を追加する
- [x] 4.4 `frontend/src/lib/api.ts` の `ExtractFromUrlResult` 型に `detail?: string` を追加する
- [x] 4.5 `extractFromUrl` 関数を修正し、エラー時にレスポンス body を JSON でパースして `ExtractFromUrlError` に `detail` を保持させる（`ExtractFromUrlError` にフィールド追加が必要）

## 5. Frontend: UrlRegistrationModal を更新

- [x] 5.1 `UrlRegistrationModal` の `onExtracted` コールバック型を `(name: string, imageUrl: string | null, sourceUrl: string) => void` に変更する
- [x] 5.2 `submit` 関数内で `onExtracted(result.name, result.imageUrl, urlToSubmit)` のように `url` を渡す
- [x] 5.3 `errorMessage` 関数を修正し、`ExtractFromUrlError` から `detail` を取り出せるようにする
- [x] 5.4 エラー表示 UI に「詳細を表示」折り畳みセクションを追加する（`useState` で `showDetail` を管理し、`detail` が空でないときのみ表示）
- [x] 5.5 `frontend/src/components/UrlRegistrationModal.test.tsx` を更新し、`detail` 折り畳み表示のテストを追加する

## 6. Frontend: CreateItemModal を更新

- [x] 6.1 `CreateItemModal` の props に `initialSourceUrl?: string | null` を追加する
- [x] 6.2 `onCreate` コールバックの引数に `sourceUrl` を追加するか、または `CreateItemModal` 内部で `sourceUrl` を `createStockItem` に渡す形にする（`onExtracted` → `CreateItemModal` → `createStockItem` の流れを一貫させる）
- [x] 6.3 `frontend/src/components/CreateItemModal.test.tsx` を更新する

## 7. Frontend: ItemCard にリンクアイコンを追加

- [x] 7.1 `ItemCard` に `sourceUrl` がある場合のみ `MdOpenInNew` アイコンボタンを表示する（アクションボタン列、カートと削除の間に配置）
- [x] 7.2 アイコンボタンは `<a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">` でラップする
- [x] 7.3 `frontend/src/components/ItemCard.test.tsx` を更新し、`sourceUrl` あり/なしでのアイコン表示テストを追加する

## 8. 結合確認

- [x] 8.1 ローカルでバックエンドを起動し、URL から商品を登録してエラーケースで `detail` が返ってくることを確認する
- [x] 8.2 `source_url` を持つ商品が `ItemCard` にリンクアイコン付きで表示されることを確認する
- [x] 8.3 `frontend/src/components/ItemCardSimple.tsx` や `ItemCardSimple.test.tsx` に `sourceUrl` 関連の変更が必要か確認し、必要なら対応する

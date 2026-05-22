## Why

URL から商品を登録する機能において、エラー時の原因がユーザーに伝わらず、また登録元 URL が商品データに残らないため、デバッグと事後参照の両方で不便が生じている。

## What Changes

- `POST /api/extract-from-url` のエラーレスポンスに `detail` フィールドを追加し、失敗箇所の技術的な情報（HTTP ステータス、Jina エラー内容、Claude が空を返した理由など）を含める
- フロントエンドのエラー表示に「詳細を表示」折り畳みセクションを追加し、`detail` を表示する
- `stock_items` テーブルに `source_url TEXT` カラムを追加する（DB migration）
- `POST /api/stock-items`（Create）と `PATCH /api/stock-items/:id`（Update）が `sourceUrl` フィールドを受け取れるようにする
- `GET /api/stock-items` のレスポンスに `sourceUrl` を含める
- `ItemCard` に `sourceUrl` があるときのみ外部リンクアイコン（別タブで開く）を表示する
- `UrlRegistrationModal` が `onExtracted` コールバック経由で `sourceUrl` を渡すようにする

## Capabilities

### New Capabilities

（なし）

### Modified Capabilities

- `url-product-extraction`: エラーレスポンスに `detail` フィールドを追加。フロントエンドの `UrlRegistrationModal` がエラー詳細を折り畳み表示する
- `stock-items-api`: Create / Update / List で `sourceUrl` フィールドをサポートする

## Impact

- **Backend**: `handler/` の `ErrorResponse` 構造体、`url_extract.go`、`stock_item.go`、`repository/stock_item_pg.go`
- **DB**: `stock_items` テーブルへのカラム追加（migration）
- **Frontend**: `types/stockItem.ts`、`lib/api.ts`、`components/UrlRegistrationModal.tsx`、`components/ItemCard.tsx`、`components/CreateItemModal.tsx`
- **既存テスト**: `handler/url_extract_test.go`、`handler/stock_item_test.go`、`repository/stock_item_test.go`、`components/ItemCard.test.tsx`、`components/UrlRegistrationModal.test.tsx` の更新が必要

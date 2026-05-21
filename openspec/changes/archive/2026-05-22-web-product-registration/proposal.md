## Why

商品を手動で名前入力するのは手間がかかる。商品の Web ページ URL を渡すだけで商品名・画像を自動抽出して登録できれば、特に初回セットアップ時の登録コストを大幅に下げられる。

## What Changes

- 商品一覧ヘッダーにリンクアイコンボタンを追加（既存の「商品を追加」ボタンの隣）
- URL 入力モーダル（`UrlRegistrationModal`）を新規追加
- バックエンドに `POST /api/extract-from-url` エンドポイントを追加
- バックエンドに `urlextract` パッケージを新規追加（HTTP フェッチ・メタタグ解析・Claude Haiku フォールバック）
- `CreateItemModal` に `initialImageUrl` prop を追加し、抽出結果を受け取れるよう拡張
- Lambda 環境変数に `ANTHROPIC_API_KEY` を追加

## Capabilities

### New Capabilities

- `url-product-extraction`: Web ページ URL から商品名・画像 URL を抽出する機能。バックエンドが HTML を取得し、og:title / og:image → schema.org → Claude Haiku の優先順位で抽出する。

### Modified Capabilities

- `stock-items-api`: `POST /api/extract-from-url` エンドポイントを追加（既存エンドポイントへの変更はなし、API 拡張のみ）

## Impact

- **Backend**: `backend/urlextract/` パッケージ新設、`backend/handler/url_extract.go` 追加、`backend/main.go` にルート追加
- **Frontend**: `UrlRegistrationModal` コンポーネント新設、`StockItemsClient.tsx` / `CreateItemModal.tsx` / `lib/api.ts` 変更
- **環境変数**: `ANTHROPIC_API_KEY`（Lambda + ローカル `.env.local`）
- **依存追加**: Go — Anthropic Go SDK（または `net/http` で直接呼び出し）
- **スコープ外**: `stock_items` テーブルへの `source_url` フィールド追加、JS レンダリング対応

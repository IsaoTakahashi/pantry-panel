## 1. バックエンド: urlextract パッケージ

- [x] 1.1 `backend/urlextract/extractor.go` — `Extractor` インターフェースと `Result` 型を定義する
- [x] 1.2 `backend/urlextract/http_fetcher.go` — タイムアウト 10 秒の HTTP GET フェッチャーを実装する
- [x] 1.3 `backend/urlextract/meta_parser.go` — og:title / og:image / schema.org Product のパースを実装する（相対 URL を絶対 URL に変換する）
- [x] 1.4 `backend/urlextract/claude_extractor.go` — Anthropic Go SDK を使い Claude Haiku で商品名・画像 URL を抽出する（`ANTHROPIC_API_KEY` 未設定時は no-op）
- [x] 1.5 `backend/urlextract/extractor.go` に抽出優先順位ロジックを実装する（メタタグ → schema.org → Claude → 422 エラー）

## 2. バックエンド: urlextract ユニットテスト

- [x] 2.1 `meta_parser_test.go` — og:title / og:image / schema.org パースのユニットテストを書く（HTML 文字列を直接渡す）
- [x] 2.2 `claude_extractor_test.go` — モックを使い API レスポンスのパースをテストする
- [x] 2.3 `extractor_test.go` — 抽出優先順位とフォールバックのユニットテストを書く

## 3. バックエンド: ハンドラーと依存追加

- [x] 3.1 `go.mod` / `go.sum` に `github.com/anthropics/anthropic-sdk-go` を追加する
- [x] 3.2 `backend/handler/url_extract.go` — `UrlExtractHandler` と `POST /api/extract-from-url` ハンドラーを実装する（400 / 422 / 502 のエラーレスポンス含む）
- [x] 3.3 `backend/handler/url_extract_test.go` — `httptest` + fetcher/extractor モックで 200 / 400 / 422 / 502 のインテグレーションテストを書く
- [x] 3.4 `backend/main.go` に `POST /api/extract-from-url` ルートを登録する
- [x] 3.5 `specs/openapi.yml` に `POST /api/extract-from-url` エンドポイントを追記する

## 4. フロントエンド: API クライアント

- [x] 4.1 `frontend/src/lib/api.ts` に `extractFromUrl(url: string)` 関数を追加する
- [x] 4.2 `frontend/src/lib/api.test.ts` に `extractFromUrl` のユニットテストを追加する（fetch モックで 200 / 400 / 422 / 502）

## 5. フロントエンド: UrlRegistrationModal コンポーネント

- [x] 5.1 `frontend/src/components/UrlRegistrationModal.tsx` を新規作成する（idle / loading / error の 3 状態）
- [x] 5.2 `frontend/src/components/UrlRegistrationModal.test.tsx` を書く（状態遷移・onExtracted コールバック・各エラーメッセージ）

## 6. フロントエンド: CreateItemModal 拡張

- [x] 6.1 `CreateItemModal.tsx` に `initialImageUrl?: string | null` prop を追加する
- [x] 6.2 `onCreate` コールバックに `imageUrl` を渡すよう拡張する
- [x] 6.3 `CreateItemModal.test.tsx` に `initialImageUrl` を受け取るケースのテストを追加する

## 7. フロントエンド: StockItemsClient 統合

- [x] 7.1 `StockItemsClient.tsx` にリンクアイコンボタン（`MdLink`）と `urlModalOpen` 状態を追加する
- [x] 7.2 `handleExtracted` を実装し `UrlRegistrationModal` → `CreateItemModal` の遷移を繋ぐ

## 8. E2E テスト

- [x] 8.1 `ANTHROPIC_API_KEY` 未設定時に 422 となり「手動で入力してください」が表示されることを Playwright でテストする（常時実行）
- [x] 8.2 `PLAYWRIGHT_ANTHROPIC_ENABLED=1` 時のフルフロー（URL 入力 → 商品名が確認モーダルに表示）の Playwright テストを書く

## 9. 環境変数・ドキュメント

- [x] 9.1 `frontend/.env.local.example` に `ANTHROPIC_API_KEY` を追記する
- [x] 9.2 `specs/features.md` に本機能の実装状況を追記する

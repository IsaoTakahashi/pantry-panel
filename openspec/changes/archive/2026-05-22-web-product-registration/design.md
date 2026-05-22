## Context

現状、商品登録は「商品を追加」モーダルで名前・カテゴリを手動入力する方式のみ。商品点数が多い初回セットアップ時や、既製品の正式な商品名を調べながら登録する場面で手間がかかる。

バックエンドは Go (Echo) + AWS Lambda + LWA、フロントエンドは Next.js (Vercel)。すでに Google CSE 画像検索のプロキシ (`GET /api/image-search`) があり、同じパターンで新エンドポイントを追加できる。

## Goals / Non-Goals

**Goals:**
- URL を入力するだけで商品名・画像 URL を自動抽出し、確認・編集を経て登録できる
- バックエンドで抽出処理を完結させ、API キーをフロントエンドに露出させない
- `ANTHROPIC_API_KEY` 未設定でも他機能を壊さない degraded 動作を保証する

**Non-Goals:**
- JS レンダリングが必要なページへの対応（Amazon 等）
- `stock_items` テーブルへの `source_url` フィールド追加
- レシピからの材料一括登録（別 change）

## Decisions

### 1. シングルエンドポイント方式

`POST /api/extract-from-url` 1本でフェッチ→解析→フォールバックを一括処理する。

**代替案**: スクレイプ API と AI 抽出 API を分離する 2 エンドポイント方式。  
**却下理由**: フロントエンドに判定ロジックが漏れる。単一エンドポイントの方がテストしやすく、将来の抽出戦略変更もバックエンド内で完結する。

### 2. 抽出優先順位: メタタグ優先 → Claude Haiku フォールバック

1. `og:title` / `og:image`
2. `schema.org/Product` の `name` / `image`
3. Claude Haiku（HTML テキスト先頭 ~8000 文字）
4. name が取れなければ 422

**代替案**: 常に Claude API を使う。  
**却下理由**: メタタグが整備された EC サイトでは AI コストとレイテンシが無駄になる。メタタグで取れる場合は AI をスキップすることでコストを最小化できる。

### 3. シンプル HTTP フェッチ（ヘッドレスブラウザなし）

Go 標準の `net/http` で HTTP GET。タイムアウト 10 秒。

**代替案**: ヘッドレスブラウザ (Playwright/Chrome)、スクレイピング API サービス。  
**却下理由**: Lambda コンテナイメージサイズ制約・実行時間制限の問題。まずシンプルに始め、JS レンダリング対応が必要になった時点で外部サービスへ切り替える方針。

### 4. 2 ステップ UI（URL モーダル → 確認モーダル）

`UrlRegistrationModal`（URL 入力）で抽出後、既存の `CreateItemModal` に `initialName` / `initialImageUrl` を渡して開く。

**代替案**: URL 入力モーダル内でインライン展開して確認。  
**却下理由**: `CreateItemModal` の再利用が自然で、コンポーネントの責務が明確になる。422 時に空の `CreateItemModal` を開く経路も同じ仕組みで実現できる。

### 5. Claude Go SDK vs 直接 HTTP 呼び出し

`github.com/anthropics/anthropic-sdk-go` を使用する。

**代替案**: `net/http` で Anthropic API を直接呼び出す。  
**理由**: SDK が型安全で、モデル名・API バージョンの管理が容易。既存の `imagesearch` パッケージも外部 SDK（`google/google-api-go-client`）を使用する慣習に合わせる。

## Risks / Trade-offs

- **JS レンダリング必須サイト（Amazon 等）では取得できない** → ユーザーには 422 で「手動入力してください」を案内。将来的に外部スクレイピングサービスへ切り替え可能な設計にする。
- **Claude API レイテンシ**（フォールバック時 2〜5 秒程度） → フロントエンドでローディング UI を表示。Lambda タイムアウト 30 秒に対して HTTP フェッチ 10 秒 + AI 呼び出し ~5 秒で余裕あり。
- **`og:image` が相対 URL のページ** → `url.Parse` + `ResolveReference` で絶対 URL に変換する。

## Migration Plan

1. バックエンド: `urlextract` パッケージ追加 → `handler/url_extract.go` 追加 → `main.go` にルート追加 → CI 通過後デプロイ
2. フロントエンド: `UrlRegistrationModal` 追加 → `CreateItemModal` 拡張 → `StockItemsClient` に UI 追加
3. 環境変数: Lambda に `ANTHROPIC_API_KEY` を追加（未設定でも動作するため、フロントエンドデプロイと順序依存なし）
4. ロールバック: エンドポイント追加のみでフロント UI から触らなければ影響なし。UI ロールバックはコード差し戻しのみ

## Open Questions

- なし（設計確定済み）

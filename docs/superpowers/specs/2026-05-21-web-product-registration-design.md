# Web ページからの商品登録 — 設計ドキュメント

**作成日**: 2026-05-21  
**対象 Issue**: wishlist「Web ページからの商品登録」  
**想定工数**: L（1〜2週）

---

## 概要

商品の紹介 Web ページの URL を入力すると、ページ内容から商品名・商品画像を抽出し、確認モーダルを経て商品として登録する。URL はそのまま `stock_items.image_url` に保存するのではなく、抽出した画像 URL を保存する（既存の Google CSE 画像と同じ扱い）。URL 自体はフィールドとして保存しない（wishlist 記載の「URL をフィールドとして保存」は今回のスコープ外）。

---

## ユーザーフロー

1. 商品一覧ヘッダーのリンクアイコンボタン（`MdLink`）をタップ
2. `UrlRegistrationModal` が開く（URL 入力フォーム）
3. URL を入力して「抽出」ボタンを押す → ローディング状態
4. バックエンドが HTML 取得 → メタタグ解析 → Claude フォールバック
5. 抽出成功 → `UrlRegistrationModal` を閉じ、`CreateItemModal` が `initialName` / `initialImageUrl` 付きで開く
6. ユーザーが名前・カテゴリ・画像を確認・編集して「追加」
7. 抽出失敗（422） → 「商品情報を取得できませんでした」メッセージ + 空の `CreateItemModal` を開くボタン

---

## バックエンド設計

### エンドポイント

```
POST /api/extract-from-url
Content-Type: application/json
Body: { "url": "https://..." }

200: { "name": "牛乳 900ml", "imageUrl": "https://example.com/img/milk.jpg" }
400: URL が空または不正形式
422: ページ取得成功だが商品名を抽出できなかった
502: ページ取得失敗（接続タイムアウト・DNS エラー等）
```

`imageUrl` は null 許容（画像が取得できなくても name が取れれば 200 を返す）。

### 新パッケージ `backend/urlextract/`

```
urlextract/
  extractor.go        -- Extractor インターフェース
                          Extract(ctx, url) (Result, error)
                          Result: { Name string, ImageURL string }
  http_fetcher.go     -- HTTP GET、タイムアウト 10 秒、User-Agent 設定
  meta_parser.go      -- og:title / og:image / schema.org Product のパース
  claude_extractor.go -- Claude Haiku API 呼び出し（フォールバック）
                          HTML テキスト先頭 ~8000 文字を渡す
```

**抽出優先順位:**
1. `og:title` → name、`og:image` → imageUrl
2. `schema.org/Product` の `name` / `image`
3. 上記で name が空 → Claude Haiku にフォールバック
4. それでも name が空 → 422

### Claude API 設定

- 環境変数: `ANTHROPIC_API_KEY`
- 未設定時: Claude フォールバックをスキップし、メタタグのみで動作（他機能に影響なし）
- モデル: `claude-haiku-4-5-20251001`（低コスト・低レイテンシ）

### Lambda タイムアウト対策

HTTP フェッチは 10 秒でコンテキストキャンセル。Lambda タイムアウト（30 秒）の前に必ず応答を返す。

---

## フロントエンド設計

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `StockItemsClient.tsx` | リンクアイコンボタン追加、`UrlRegistrationModal` の開閉制御、抽出結果を `CreateItemModal` に渡す |
| `CreateItemModal.tsx` | `initialImageUrl?: string \| null` prop 追加、`onCreate` に `imageUrl` を渡すよう拡張 |
| `lib/api.ts` | `extractFromUrl(url)` 関数追加 |

### 新コンポーネント `UrlRegistrationModal`

```
状態:
  idle     -- URL 入力フォーム
  loading  -- 「解析中...」スピナー、ボタン無効
  error    -- エラーメッセージ表示、再試行可能
```

Props:
```ts
type UrlRegistrationModalProps = {
  isOpen: boolean
  onClose: () => void
  onExtracted: (name: string, imageUrl: string | null) => void
}
```

### StockItemsClient の状態変更

```ts
const [urlModalOpen, setUrlModalOpen] = useState(false)
// createModalOpen, prefill は既存 + initialImageUrl を追加

function handleExtracted(name: string, imageUrl: string | null) {
  setUrlModalOpen(false)
  setPrefill({ name, imageUrl })
  setCreateModalOpen(true)
}
```

---

## エラーハンドリング

| ケース | バックエンド | フロントエンド表示 |
|--------|------------|------------------|
| URL 形式が不正 | 400 | 「有効な URL を入力してください」 |
| ページ取得失敗 | 502 | 「ページを取得できませんでした」 |
| 抽出失敗（name が空） | 422 | 「商品情報を取得できませんでした。手動で入力してください」→ 空の CreateItemModal を開くボタン表示 |
| ANTHROPIC_API_KEY 未設定 | メタタグのみ、取れなければ 422 | 同上 |

---

## テスト方針

### バックエンド

| 対象 | 種別 | 内容 |
|------|------|------|
| `meta_parser.go` | Unit | og:title / og:image / schema.org のパース（HTML 文字列を直接渡す） |
| `claude_extractor.go` | Unit | インターフェース経由でモック、API レスポンスのパース |
| `handler/url_extract.go` | Integration | `httptest` + fetcher モックで 200 / 400 / 422 / 502 |

### フロントエンド

| 対象 | 種別 | 内容 |
|------|------|------|
| `UrlRegistrationModal` | Unit | idle → loading → error / onExtracted の状態遷移 |
| `api.ts#extractFromUrl` | Unit | fetch モックで各レスポンスコードの処理 |

### E2E (Playwright)

| ケース | 条件 | 内容 |
|--------|------|------|
| 422 時のフォールバック UI | 常時実行 | ANTHROPIC_API_KEY 未設定環境で「手動で入力してください」が表示される |
| フルフロー | `PLAYWRIGHT_ANTHROPIC_ENABLED=1` | URL 入力 → 商品名が確認モーダルに表示される |

---

## スコープ外（今回は含めない）

- URL フィールドの `stock_items` への追加（スキーマ変更が必要、別 change で検討）
- JS レンダリング対応（ヘッドレスブラウザ / スクレイピング API サービス）
- 複数 URL の一括登録
- レシピからの材料一括登録（wishlist の別項目、このインフラを前提とする）

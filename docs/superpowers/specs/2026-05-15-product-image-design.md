# 商品画像設定 (Phase 4 機能 I) — Design

## 目的

旧製品の「商品画像を Google 画像検索から選択して設定する」機能を新スタックで再現する。`specs/features.md` Phase 4 の最後の未実装機能。

## スコープ

- カードに商品画像を表示する（未設定時はプレースホルダー）
- カードの画像領域をクリックで画像選択モーダルを開く
- モーダル内で商品名検索（自動 + 手動再検索）、結果から 1 枚クリックで保存
- 「画像を解除」で画像を NULL に戻す
- 通常ビューとシンプルビューの両方で画像を表示・編集可能

スコープ外:

- 画像のアップロード機能（外部 URL のみ保存）
- 画像の自前ホスティング（Supabase Storage 等は使わない）
- リアルタイム伝播の追加実装（Phase 3.5 の `useStockItemsRealtime` で自動的に賄われる）

## アーキテクチャ

```
[Card 画像クリック]
       │
       ▼
[ImageSelectionModal] ──(検索)──► [Backend GET /image-search]
       │                              │
       │                              ▼
       │                       [Google Custom Search API]
       │                              │
       │◄────────(結果)───────────────┘
       │
[画像クリック] or [画像を解除]
       │
       ▼
[Backend PATCH /stock-items/:id  body: { imageUrl }]
       │
       ▼
[fetchStockItems → setItems] (既存パターン)
       │
       ▼
[Supabase Realtime 経由で他クライアントにも反映]
```

外部 API 呼び出しは backend 経由のプロキシ。frontend には API key を露出させない。

## Backend

### 新規エンドポイント: `GET /image-search`

| 項目 | 内容 |
|------|------|
| Query params | `q` (required, 商品名等), `num` (optional, default=10, max=10) |
| Response 200 | `{ "items": [{ "imageUrl": string, "thumbnailUrl": string, "title": string }] }` |
| 400 | `q` 欠落 |
| 429 | Google API quota 超過 |
| 502 | Google API failure / 不正レスポンス |
| 503 | 環境変数未設定（ローカル開発時、機能無効） |
| 500 | unexpected |

### 既存 `PATCH /stock-items/:id` の拡張

- 受付フィールドに `imageUrl: string | null` を追加
- `null` 明示送信時は `image_url` を NULL に更新（解除機能）
- 未指定時は `image_url` を変更しない（既存 partial update 流儀の維持）

### パッケージ構造

```
backend/
├── handler/
│   ├── stock_items.go         # 既存（PATCH に imageUrl 対応追加）
│   └── image_search.go        # NEW: GET /image-search ハンドラ
├── imagesearch/                # NEW: Google API クライアント
│   ├── client.go              # interface + Google 実装
│   └── client_test.go         # mock-based unit test
└── repository/
    └── stock_item_pg.go       # Update に image_url 列追加
```

`imagesearch.Client` interface(`Search(ctx, query, num) ([]Result, error)`) で DI 注入し、ハンドラのテストで mock を差し込む。Google API client 実装は `net/http` + `encoding/json` で素直に書く。

### 環境変数

| 名前 | 用途 | 保管 |
|------|------|------|
| `GOOGLE_CSE_API_KEY` | Google Custom Search API key | Lambda env (KMS 暗号化) / ローカルは `backend/.env.local` |
| `GOOGLE_CSE_ID` | Programmable Search Engine ID | 同上 |

未設定時の挙動: backend 起動時に warn を出力し、`/image-search` は 503 を返す。CRUD など他の機能は影響を受けない。

## Frontend

### コンポーネント変更

```
frontend/src/
├── components/
│   ├── ImageSelectionModal.tsx      # NEW
│   ├── ImageSelectionModal.test.tsx # NEW
│   ├── ItemCard.tsx                 # 画像領域追加
│   ├── ItemCard.test.tsx            # ケース追加
│   ├── ItemCardSimple.tsx           # 32px サムネイル追加
│   └── ItemCardSimple.test.tsx      # ケース追加
├── lib/
│   ├── api.ts                       # searchImages() 追加 & updateStockItem に imageUrl 対応
│   └── api.test.ts                  # ケース追加
└── app/stock-items/
    └── page.tsx                     # imageEditingItem state 追加
```

### `ImageSelectionModal` の責務

| 項目 | 仕様 |
|------|------|
| Props | `item: StockItem`, `isOpen: boolean`, `onClose()`, `onSelect(imageUrl: string \| null)` |
| 初期動作 | open 時に `item.name` を検索ボックスに初期セットし、自動検索を発火 |
| 検索ボックス | クエリ編集後、「検索」ボタン or Enter で再検索 |
| 結果表示 | レスポンシブグリッド（PC 3 列、スマホ 2 列）、`<img>` で thumbnailUrl を表示 |
| 画像クリック | `onSelect(imageUrl)` を呼び、モーダル閉じる |
| 画像を解除 | `item.imageUrl != null` のときのみ表示。`onSelect(null)` を呼び、モーダル閉じる |
| ローディング | 検索中: spinner |
| エラー | 0 件 / 一般 / quota(429) を区別したメッセージを表示 |
| キャンセル | 「キャンセル」ボタン、背景クリック、Escape キー |

### `ItemCard` / `ItemCardSimple` の変更

- 画像領域を追加
  - `imageUrl != null`: `<img src={imageUrl}>` を表示。`onError` で代替プレースホルダーアイコンに差し替え
  - `imageUrl == null`: Tailwind gray box + `lucide-react` の `ImageIcon`
- 画像領域を `<button type="button">` でラップ、クリックで `onImageEdit(item)` を呼ぶ
- 既存 props（`onDelete`, `onEdit`, `onToggleWantToBuy`）と並列に `onImageEdit` を追加
- ItemCardSimple では 32px × 32px の小サムネイル

### `page.tsx` 状態追加

```tsx
const [imageEditingItem, setImageEditingItem] = useState<StockItem | null>(null);

const handleImageSelect = async (imageUrl: string | null) => {
  if (!imageEditingItem) return;
  await updateStockItem(imageEditingItem.id, { imageUrl });
  const data = await fetchStockItems();
  setItems(data);
  setImageEditingItem(null);
};
```

`editingItem`（名前・カテゴリ編集モーダル用）とは独立管理。既存の "PATCH → refetch → setItems" パターンに揃える。

### `api.ts` 追加

```ts
export async function searchImages(query: string, num = 10): Promise<ImageSearchResult[]>;
```

429 / 502 / 500 を区別する独自エラー型を throw する。`updateStockItem` の引数型に `imageUrl?: string | null` を追加。

## データフロー

```
[ItemCard 画像クリック]
       │
       ▼
page.tsx: setImageEditingItem(item)
       │
       ▼
ImageSelectionModal mount (isOpen=true)
       │
       ▼
useEffect: searchImages(item.name) を自動発火
       │
       ▼
[結果グリッド表示]
       │
       ├──► [画像クリック] ──► onSelect(imageUrl)
       │                            │
       │                            ▼
       │                   updateStockItem(id, { imageUrl })
       │                            │
       │                            ▼
       │                   fetchStockItems → setItems
       │                            │
       │                            ▼
       │                   setImageEditingItem(null)
       │
       ├──► [画像を解除] ──► onSelect(null)  (同上、imageUrl=null で PATCH)
       │
       └──► [キャンセル] ──► setImageEditingItem(null)  (PATCH なし)
```

## エラーハンドリング

| 失敗箇所 | 表示 | リカバリ |
|---------|------|---------|
| 検索 0 件 | "画像が見つかりませんでした" | クエリ編集 → 再検索 |
| 検索 429 | "本日の検索上限に達しました" | 翌日まで待機 |
| 検索 502/500/ネットワーク | "画像検索に失敗しました" + 再試行ボタン | 再試行ボタンで同クエリ再 fetch |
| PATCH 失敗 | toast / alert で "画像を保存できませんでした" | モーダル維持、再選択可能 |
| `<img>` 読み込み失敗 | `onError` で代替プレースホルダーアイコン | 影響なし、再選択は可能 |

## 競合シナリオ

- 同じ item に対し A が画像変更 / B が名前変更 → 別フィールド更新のため両方が反映される（既存 PATCH の partial update セマンティクス）
- A が画像選択中に Realtime で同 item の他フィールドが更新 → モーダルが開いた瞬間の `item.name` は古いまま検索に使われる可能性あり。家庭用途・稀・影響軽微のため許容

## テスト戦略

### Backend Unit (`go test`)

| 対象 | ケース |
|------|--------|
| `imagesearch/client_test.go` | Google API 正常応答 → パース成功 / 429 → quota error / 502 / 不正 JSON |
| `handler/image_search_test.go` | `q` 欠落 → 400 / quota error → 429 / Google failure → 502 / 正常 → 200 with items |
| `handler/stock_items_test.go`（既存に追加） | PATCH `imageUrl: "https://..."` → 更新 / PATCH `imageUrl: null` → NULL 化 / PATCH に imageUrl 含まず → 既存値維持 |

### Backend Integration (testcontainers)

| 対象 | ケース |
|------|--------|
| `repository/stock_item_test.go`（既存に追加） | Update with imageUrl=string / imageUrl=null / imageUrl 未指定 を SQL レベルで検証 |

検索 API は外部依存のため integration 対象外。

### Frontend Unit (Vitest)

| 対象 | ケース |
|------|--------|
| `ImageSelectionModal.test.tsx` | open 時に商品名で自動検索発火 / 結果クリック → onSelect(url) / 「画像を解除」→ onSelect(null) / 0 件メッセージ / quota メッセージ / 一般エラー + 再試行 / Escape & 背景クリック |
| `ItemCard.test.tsx`（既存に追加） | imageUrl あり → `<img>` 描画 / null → プレースホルダー描画 / 画像クリック → onImageEdit 呼び出し |
| `ItemCardSimple.test.tsx`（既存に追加） | 同上のケース（サムネイルサイズ） |
| `api.test.ts`（既存に追加） | `searchImages()` 正常 / 429 → 専用エラー型 / 502 → 専用エラー型 / `updateStockItem({ imageUrl })` の request body 検証 |

### E2E (Playwright)

`e2e/image-selection.spec.ts` を 1 本追加:

```
1. 商品 "テスト商品" を新規登録
2. カードを確認 → プレースホルダー表示
3. 画像領域をクリック → モーダルが開く
4. (Playwright route で /image-search を stub、固定 3 件返却)
5. モーダルに 3 件表示されることを確認
6. 1 枚目をクリック → モーダル閉じる
7. カードに選択した画像 URL が反映されることを確認
8. 画像を再クリック → モーダル → 「画像を解除」をクリック
9. カードがプレースホルダーに戻ることを確認
```

Realtime 伝播の E2E は Phase 3.5 で網羅済みのため追加しない。

## 運用 / 事前準備

ユーザー側で以下が必要:

1. **Google Cloud Console**: Custom Search API を有効化、API key を発行
2. **Programmable Search Engine**: CSE を作成し、画像検索を有効化、ウェブ全体を検索する設定、CSE ID を取得
3. **ローカル**: `backend/.env.local` に `GOOGLE_CSE_API_KEY` / `GOOGLE_CSE_ID` を設定
4. **本番**: AWS Console から Lambda env vars に同 2 つを追加（`DATABASE_URL` と同様 KMS 暗号化）

旧製品時代の CSE が残っていれば再利用可能。新規取得時は無料枠 100 query/day から。

## ドキュメント更新範囲

| ファイル | 更新内容 |
|---------|---------|
| `.claude/rules/backend.md` | 環境変数セクションに `GOOGLE_CSE_API_KEY` / `GOOGLE_CSE_ID` 追記、画像検索エンドポイント概要 |
| `specs/openapi.yml` | `GET /image-search` 追加、`PATCH /stock-items/:id` の body schema に `imageUrl` 追加 |
| `specs/features.md` | Phase 4 の I を ✅ 完了に（実装完了後） |

## CI への影響

- backend unit / integration: 外部 API を叩かない設計なので API key 不要
- E2E: Playwright route stub で外部 API を叩かない設計なので API key 不要

→ **CI 側で新規シークレット追加なし**

# Pantry Panel 仕様書（旧製品）

## 概要

**Pantry Panel** は家庭の食品・日用品の在庫を管理するシングルページPWA。認証なし・家族共用の想定。

---

## 外部仕様（ユーザー視点）

### 解決する問題

1. 家に何がどれだけあるか把握できず、買い物が非効率
2. ストック（未使用）か使用中かわからず、買い足し判断ができない
3. 気づかないうちに賞味期限が切れる

---

### 画面構成

**単一ページ（SPA）** — 画面遷移なし、全操作はモーダル/ポップアップで完結

#### 固定ヘッダー（ナビバー）

| 要素 | 機能 |
|------|------|
| タイトル "Pantry Panel" | purple hero 装飾のみ |
| テキスト検索ボックス | 商品名の部分一致フィルタ。「クリア」ボタンで消去 |
| カートアイコン チェックボックス | `wantToBuy=true` のアイテムのみ表示 |
| ベルアイコン チェックボックス | 在庫切れ（`inventories` が空）のアイテムのみ表示 |
| カテゴリ ドロップダウン | 選択カテゴリでフィルタ。「全部」で全表示 |
| Simple スイッチ | 表示モード切替（通常カード ↔ シンプルリスト） |
| 「商品を追加」ボタン | 新規商品作成モーダルを開く |

---

### アイテムカード（通常ビュー）

```
┌────────────────────────────────────────┐
│ [画像]    [カテゴリバッジ] [商品名]      │
│           賞味期限: YYYY-MM-DD          │
│ [🛒]      残ストック数: N               │
│                                         │
│           [+追加] [-消費] [🗑削除]      │
└────────────────────────────────────────┘
```

| 操作 | 動作 |
|------|------|
| 画像クリック | Google画像検索結果を表示、選択で画像更新 |
| 🛒アイコンクリック | `wantToBuy` トグル。ONにすると更新時刻更新→一覧最上部へ |
| カテゴリバッジクリック | カテゴリ変更モーダル |
| 商品名クリック | 商品名変更モーダル |
| [+] ボタン | ストック追加モーダル（賞味期限・個数入力） |
| [-] ボタン | 最も期限の近いストック1個消費（在庫0なら無効） |
| [🗑] ボタン | 削除確認ダイアログ（在庫あり or wantToBuy=true なら無効） |

**期限切れ警告**: 最も近い賞味期限が7日以内 → カード背景が黄色（`#ffee99`）

---

### アイテムカード（シンプルビュー）

```
[画像] [🛒] [カテゴリ] [商品名]
```

コンパクトな1行表示。在庫操作なし。期限切れ警告の黄色は同様。

---

### 各モーダル

#### 新規商品作成
- カテゴリ（セレクト）
- 商品名（テキスト入力）— 重複チェックあり（同名があれば「その商品は登録済みです」）
- 賞味期限（date 入力）— 省略時 `2099-12-31`
- 個数（1〜10）
- **スマート初期値**: 開いた時に検索テキストを商品名に、フィルタ中のカテゴリをカテゴリにセット
- **スマート在庫**: toBuy or 在庫切れフィルタ中に作成 → `inventories=[]`, `wantToBuy=true`

#### ストック追加
- 賞味期限（date 入力）— 省略時 `2099-12-31`
- 個数（1〜10）
- 追加後: `wantToBuy` を `false` に変更、更新時刻をリフレッシュ→一覧最上部へ

#### 商品名変更 / カテゴリ変更
- 入力→ Update で即時反映

#### 画像選択
- Google Custom Search API で商品名検索
- 候補画像リストを表示、クリックで設定

---

### 一覧ソート順

**更新日時の降順**（最近更新したものが先頭）。`negateUpdatedTime = -Date.now()` を Firebase で昇順ソート。

---

### カテゴリ一覧（固定）

`★` / `洗面` / `100均` / `KALDI` / `調味料` / `飲み物` / `缶詰` / `おかず` / `おかずの素` / `おやつ` / `その他`

---

## 内部仕様（技術視点）

### スタック

| 役割 | 技術 |
|------|------|
| フレームワーク | Nuxt.js 2.8.1（Vue 2） |
| UI ライブラリ | Buefy 0.8.x + Bulma 0.7/0.8 + bulma-checkradio + bulma-switch + bulma-divider |
| 状態管理 | Vuex + vuexfire 2.x |
| バックエンド | Firebase Realtime Database（Firestore ではない） |
| 外部 API | Google Custom Search API（画像検索） |
| HTTP | axios |
| PWA | @nuxtjs/pwa（lang: ja, short_name: "Pantry Panel"） |
| テスト | Jest + @vue/test-utils + Storybook 4 |

---

### データモデル

#### `/stockItems/{id}` — StockItem

```js
{
  name: string,              // 商品名
  category: string,          // Categories enum の値
  imageUrl: string,          // URL | "/images/no-image.png"
  inventories: [             // 賞味期限昇順でソート済み
    { bestBy: "YYYY-MM-DD" }
  ],
  wantToBuy: boolean,        // 買い物リストフラグ
  negateCreatedTime: number, // -Date.now()
  negateUpdatedTime: number  // -Date.now()（ソートキー）
}
```

#### Inventory

```js
{ bestBy: "YYYY-MM-DD" }   // 省略時デフォルト: "2099-12-31"
```

---

### Vuex ストア構造

```
store/
├── index.js      — firebaseMutations をグローバルに展開
├── item.js       — stockItems[], isLoading, CRUD actions
├── filter.js     — searchText, filterCondition{toBuy, outOfStock, category}
└── view.js       — isSimpleView boolean
```

#### item モジュール アクション一覧

| アクション | 処理 |
|-----------|------|
| `initItems` | `/stockItems` を `negateUpdatedTime` 昇順でバインド |
| `createItem` | push |
| `deleteItem` | remove |
| `updateName` | `.name` のみ更新 |
| `updateCategory` | `.category` のみ更新 |
| `updateWantToBuy` | `.wantToBuy` のみ更新 |
| `updateStock` | `.inventories` を bestBy 昇順ソートして set |
| `updateImage` | `.imageUrl` のみ更新 |
| `refreshUpdatedTime` | `.negateUpdatedTime = -Date.now()` |

---

### コンポーネント階層

```
pages/index.vue
├── SearchBox
├── FilterOption
├── ItemCreationPopup
└── CardContainer
    ├── ItemCard（通常ビュー）
    │   ├── ImageSelectionPopup
    │   ├── CategoryEditPopup
    │   ├── NameEditPopup
    │   └── StockAdditionPopup
    └── SimpleItemCard（シンプルビュー）
        ├── CategoryEditPopup
        └── NameEditPopup
```

#### コンポーネント詳細

| コンポーネント | 役割 | 主要 Props |
|--------------|------|-----------|
| `SearchBox` | テキスト検索入力 | — |
| `FilterOption` | フィルタ・ビュー切替 | — |
| `ItemCreationPopup` | 新規商品作成モーダル | — |
| `CardContainer` | アイテム表示・フィルタ適用 | — |
| `ItemCard` | 通常カード表示 | itemId, category, name, imageUrl, inventories, wantToBuy |
| `SimpleItemCard` | シンプルカード表示 | itemId, category, name, imageUrl, inventories, wantToBuy |
| `NameEditPopup` | 商品名変更モーダル | item {itemId, name} |
| `CategoryEditPopup` | カテゴリ変更モーダル | item {itemId, category} |
| `StockAdditionPopup` | 在庫追加モーダル | item {itemId, name, inventories} |
| `ImageSelectionPopup` | 画像検索・選択モーダル | itemId, name, imageUrl |

#### Buefy 使用コンポーネント

`b-field`, `b-input`, `b-select`, `b-modal`, `b-loading`, `b-icon`, `b-toast`, `b-dialog`

---

### ビジネスロジック

| ルール | 詳細 |
|--------|------|
| 削除可能条件 | `wantToBuy === false` AND `inventories.length === 0` |
| 在庫消費 | `inventories[0]`（最も近い期限）を削除 |
| 期限警告 | 最近の `inventories[0].bestBy` が今日から7日以内 → カード黄色 |
| 在庫追加後 | `wantToBuy=false`、`negateUpdatedTime` をリフレッシュ |
| wantToBuy を ON にした場合 | `negateUpdatedTime` をリフレッシュ（一覧最上部へ） |
| 重複チェック | 同一 `name` が既存にある場合、作成ボタン無効 |
| フィルタ組み合わせ | AND 条件（すべて満たすものを表示） |
| 認証 | なし（単一家族想定） |

#### フィルタリングロジック

```js
filteredItems = stockItems
  .filter(item => !filterCondition.toBuy || item.wantToBuy)
  .filter(item => !filterCondition.outOfStock || !item.inventories)
  .filter(item => !filterCondition.category || item.category === filterCondition.category)
  .filter(item => item.name.includes(searchText))
```

#### 期限警告ロジック

```js
isCloseToExpiration(expirationDate, duration = 7):
  targetDate = today + duration days
  return expirationDate <= targetDate
```

#### タイムスタンプのエンコード

```js
negateUpdatedTime = -new Date().getTime()
// 負数化することで Firebase の昇順ソートを降順（新しい順）として利用
```

---

### プラグイン

| ファイル | 役割 |
|---------|------|
| `plugins/firebase.js` | Firebase シングルトンインスタンスの初期化 |
| `plugins/auth.js` | 認証状態の Promise ラッパー（ログイン状態チェック用） |

---

### 環境変数

```
APIKEY                 — Firebase & Google API Key
AUTHDOMAIN             — Firebase Auth ドメイン
DATABASEURL            — Firebase Realtime DB URL
PROJECTID              — Firebase プロジェクト ID
STORAGEBUCKET          — Firebase Storage バケット
MESSAGINGSENDERID      — Firebase Messaging Sender ID
CUSTOMSEARCHENGINEID   — Google Custom Search Engine ID
```

---

### テスト構造

```
tests/unit/
├── components/   — Vue コンポーネントのユニットテスト
├── store/        — Vuex ストアのユニットテスト
└── assets/       — DateUtil 等ユーティリティのテスト
```

- Jest + @vue/test-utils
- Storybook 4 によるコンポーネントカタログ・スナップショットテスト
- カバレッジ対象: `{assets,components,store}/**/*.{js,vue}`

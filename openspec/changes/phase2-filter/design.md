## Context

Phase 2 で CRUD と wantToBuy トグルが揃った。商品件数が増えると、特定カテゴリや「買いたいだけ」を見たい場面が頻出する。旧プロダクトでは Vuex の `filter` ストアに `searchText` と `filterCondition: { toBuy, outOfStock, category }` を持ち、`computed` で `filteredItems` を派生させていた。本 change では React の同等構造で再現する (`outOfStock` は本プロダクトでは在庫数を持たないため対象外)。

カテゴリ定数は現在 `frontend/src/components/CreateItemModal.tsx` 内に直書きされており、FilterBar 側でも同じものが必要になるため共通化する。

## Goals / Non-Goals

**Goals:**
- 商品名検索 (部分一致) で一覧を絞り込める
- 「買いたいだけ」トグルで wantToBuy=true のみ表示できる
- カテゴリ select で特定カテゴリのみ表示できる (「全部」で全カテゴリ)
- 全フィルタは AND 結合
- フィルタ適用後 0 件のとき「該当する商品がありません」を表示
- フィルタロジックは純関数として切り出し、ユニットテストで網羅

**Non-Goals:**
- スマート初期値 (フィルタ中の検索テキスト・カテゴリを CreateItemModal に引き継ぐ) — 旧プロダクトの機能だが別 change で扱う
- URL クエリへのフィルタ状態反映・ブラウザ履歴連携
- サーバーサイドフィルタ (現状 `GET /api/stock-items` は全件返す前提。家庭規模のデータでは十分)
- フィルタ条件のローカルストレージ永続化
- フィルタ条件の組み合わせを「OR」で結合するモード

## Decisions

### Decision 1: フィルタは純関数 `filterStockItems` に分離する

```ts
// frontend/src/lib/filterStockItems.ts
export type FilterCondition = {
  searchText: string;
  wantToBuyOnly: boolean;
  category: string | null; // null = 全部
};

export function filterStockItems(
  items: StockItem[],
  condition: FilterCondition,
): StockItem[] {
  return items
    .filter((item) => !condition.wantToBuyOnly || item.wantToBuy)
    .filter((item) => !condition.category || item.category === condition.category)
    .filter((item) => item.name.includes(condition.searchText));
}
```

**Alternatives considered:**
- ページコンポーネント内で `useMemo` 直書き — テストするとレンダリングを通す必要があり読みにくい
- カスタム hook `useFilteredItems(items, condition)` — 過剰。純関数で十分

**Rationale:** ロジックが React と独立するためテストが軽い (DOM 不要)。旧プロダクトの `filter.js` も純関数で、移植しやすい。

### Decision 2: フィルタ状態は `page.tsx` の `useState` 1 箇所に集約

```tsx
const [filter, setFilter] = useState<FilterCondition>({
  searchText: "",
  wantToBuyOnly: false,
  category: null,
});

const filteredItems = useMemo(
  () => filterStockItems(items, filter),
  [items, filter],
);
```

`FilterBar` は `value: FilterCondition` と `onChange: (next: FilterCondition) => void` を受ける制御コンポーネント。

**Alternatives considered:**
- 各フィールドを個別 state (`searchText`, `wantToBuyOnly`, `category`) — props が増える。1 オブジェクトで運ぶ方がシンプル
- Context / Zustand 等の状態ライブラリ — 過剰。1 ページ内の状態

**Rationale:** 単一の真実源。`filteredItems` は `useMemo` で派生。

### Decision 3: カテゴリ定数は `frontend/src/constants/categories.ts` に共通化

```ts
export const CATEGORIES = [
  "★", "洗面", "100均", "KALDI", "調味料", "飲み物",
  "缶詰", "おかず", "おかずの素", "おやつ", "その他",
] as const;

export type Category = (typeof CATEGORIES)[number];
```

`CreateItemModal` の直書き定数を import に置換。FilterBar の select も同じ定数 + 「全部」option を表示。

**Alternatives considered:**
- 定数を `FilterBar` 内に複製 — 同期漏れリスク
- DB から取得 — 旧仕様で固定リスト確定。サーバー往復不要

**Rationale:** Single source of truth。後でカテゴリ追加するときに 1 箇所変更で済む。

### Decision 4: 「全部」option の値は空文字 `""` で表現、内部状態では `null`

select の `<option value="">全部</option>` を選んだら state は `category: null`。`<option value="調味料">調味料</option>` なら `category: "調味料"`。

**Alternatives considered:**
- 「全部」も文字列 `"all"` で表現 — 「all」がカテゴリ名と衝突する将来リスク
- `category: undefined` — オブジェクト spread 時に扱いづらい

**Rationale:** TypeScript 的に `string | null` が読みやすい。フィルタ関数の判定 `!condition.category` で空文字も null も同じ扱い。

### Decision 5: 検索のクリアボタンは入力欄に文字があるときだけ表示

`searchText` が非空のときに「×」ボタンを右側に表示し、クリックで `searchText: ""` に。

**Alternatives considered:**
- 常時表示 — 空のときに無意味
- HTML5 `<input type="search">` のネイティブ `×` を使う — ブラウザによって表示が異なる

**Rationale:** UX 上の小さな配慮。コードコストも小さい。

### Decision 6: 空結果は「商品がない (raw 0 件)」と「該当なし (フィルタで 0 件)」を区別する

- `items.length === 0` → 「商品がありません」(既存)
- `items.length > 0 && filteredItems.length === 0` → 「該当する商品がありません」(新規)

**Rationale:** ユーザーの取るべき行動が違う (前者は商品追加、後者はフィルタ解除)。

### Decision 7: テスト戦略

- **`filterStockItems.test.ts`** — 純関数の網羅:
  - 空 condition で全件返す
  - searchText の部分一致 (大文字小文字は `includes` 既定通り = 区別する)
  - wantToBuyOnly=true で wantToBuy=true のみ
  - category 指定で該当カテゴリのみ
  - 3 軸 AND の組合せ 1-2 ケース
- **`FilterBar.test.tsx`** — 入力で `onChange` が正しい `FilterCondition` で呼ばれる (検索入力・トグル・select 変更・クリアボタン)
- **`page.test.tsx`** — 統合 1-2 ケース:
  - 検索入力 → 表示が絞られる、クリアで戻る
  - 「買いたいだけ」ON で wantToBuy=false が消える
  - フィルタで 0 件のとき「該当する商品がありません」が表示される

## Risks / Trade-offs

- **[件数が増えると毎入力で全件再フィルタする]** → 数千件レベルまでは問題なし (in-memory で millisec)。Phase 4 以降で API 側に検索パラメータを足す選択肢も残せる
- **[`includes` は大文字小文字を区別する]** → 旧プロダクトの挙動を踏襲。日本語商品名では実害なし。英語混在で困ったら `toLowerCase` 比較に変更
- **[フィルタ条件の組合せでユーザーが混乱]** → 「該当する商品がありません」表示と、検索クリアボタン / wantToBuy トグル / 「全部」の存在で逃げ道を確保

## Migration Plan

不要 (UI 機能追加のみ。データモデル / API 互換性の変更なし)。`CreateItemModal` のカテゴリ定数 import 切替は同 PR 内で完結。

## Open Questions

- フィルタ UI の見た目 (横並び 1 行 vs ラップ) — レスポンシブで調整。MVP では横並び、狭い画面で wrap
- カテゴリ select の「全部」option 表記は「全部」「すべて」「— 全カテゴリ —」のいずれか → 旧プロダクトの「全部」を踏襲
- 検索入力で `<input type="search">` を使うか `<input type="text">` か → `type="search"` (アクセシブルだがネイティブ × ボタンは抑制)。実装で確定

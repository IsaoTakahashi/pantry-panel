## Context

Phase 1 で `CreateItemModal` を実装済み。フォーム構造 (名前 input + カテゴリ select)、重複エラー (409 → 「その商品は登録済みです」)、submit 後の close と一覧再取得、cancel での state reset、フォーカスリングなど一連のパターンが確立されている。

編集モーダルは初期値が既存の値で埋まる点と PATCH エンドポイントを呼ぶ点以外、Create と挙動がほぼ同じ。バックエンドの `PATCH /api/stock-items/:id` は既に name/category/wantToBuy がすべて optional な COALESCE 実装。

## Goals / Non-Goals

**Goals:**
- 商品カードクリックで編集モーダルが開き、name と category を 1 画面で編集できる
- 編集成功時にモーダルが閉じて一覧が並び順込みで更新される
- 重複名は Create と同じメッセージで表示される
- 既存の Create モーダルとビジュアル・操作感が一貫している

**Non-Goals:**
- wantToBuy のトグル UI (E で扱う)
- フィルタ・検索 (F で扱う)
- 編集と作成のモーダルを 1 コンポーネントに統合 (将来の選択肢として残すが今は別コンポーネントで作る)
- 旧プロダクトのように「商品名クリック」「カテゴリクリック」で別モーダルを開く動線 (1 モーダルに統合する判断)

## Decisions

### Decision 1: 編集モーダルは Create とは別コンポーネント (`EditItemModal`)

`CreateItemModal` を流用せず、新規に `EditItemModal` を作る。差分は「初期値の有無」「呼ぶ API」の 2 点で、現時点ではコンポーネント数が増える代わりに各々のテストと責務が明確になる。

**Alternatives considered:**
- `ItemFormModal` に統合し、`mode: "create" | "edit"` で分岐 — 共通化は魅力的だが、現状 2 箇所しかなく、初期値の流入経路や 409 処理など条件分岐が増えてかえって読みにくい
- `CreateItemModal` を継承して差分だけ書く — React 流ではない (HOC/render props なら可だが過剰)

**Rationale:** 別コンポーネントが 3 箇所目で必要になった時点で抽象化を再検討する。Phase 2 のフィルタ・買い物リストの実装が落ち着いた後の方が共通化の境界が見えやすい。

### Decision 2: 編集トリガーは ItemCard 全体クリック

商品名・カテゴリバッジを個別クリック対象にせず、カード全体を `<button>` 風にして「クリック → 編集モーダルを開く」とする。削除ボタンは `onClick` 内で `event.stopPropagation()` でバブリングを止める。

**Alternatives considered:**
- 旧プロダクト同様、商品名クリックで名前変更モーダル / カテゴリバッジクリックでカテゴリ変更モーダル — モーダル数が増える、フィット感は悪くないが今回は単一モーダルに統合
- 編集アイコンボタンを追加 — 視覚的なボタン数が増える、削除ボタンとの近接で誤クリックが増える

**Rationale:** カード全体クリックは「カードという単位を編集する」というメンタルモデルに素直。削除だけ残してボタン汚染も最小。a11y は `<button>` ラッパー or `role="button" tabIndex={0}` で対応する。

### Decision 3: a11y — ItemCard を `<button>` でラップ

カード全体をクリック可能にするので、本来の `<article>` セマンティクスに加え、操作可能性を `<button>` で明示する。マウスでもキーボード (Enter/Space) でも開けるようにする。

```tsx
<article aria-label={item.name} className="...">
  <button
    type="button"
    onClick={() => onEdit(item)}
    className="text-left flex-1 ..."
  >
    {/* category badge + name */}
  </button>
  {/* delete button (separate, with stopPropagation) */}
</article>
```

E2E テストで使っている `getByRole("article", { name })` 構造は維持される。`getByRole("button")` は 1 カードに 2 つ存在することになるが、article 内で絞れば名前で区別可能 (編集ボタン: 商品名、削除ボタン: "削除")。

**Alternatives considered:**
- `<div role="button" tabIndex={0}>` — Enter/Space 対応を自前で書く必要がある
- カード全体を `<button>` にする — `<article>` 内に `<button>` を入れるのは OK だが、`<button>` の中に削除 `<button>` は不可 (button 入れ子禁止)

### Decision 4: API クライアントの形

`updateStockItem(id: string, params: UpdateStockItemRequest): Promise<StockItem>` を `lib/api.ts` に追加。`UpdateStockItemRequest` は既存の `types/stockItem.ts` にあるはず (Phase 1 で型定義済)。なければ追加する。

```ts
type UpdateStockItemRequest = {
  name?: string;
  category?: string;
  wantToBuy?: boolean;
};
```

### Decision 5: テスト戦略

- **EditItemModal.test.tsx** (Create と同じ粒度):
  - 初期値が反映される
  - 名前変更後 submit で API が正しい params で呼ばれる
  - カテゴリ変更後 submit で同上
  - 名前・カテゴリ未変更でも submit 可能 (差分検出はしない)
  - 409 → 「その商品は登録済みです」
  - その他エラー → エラーメッセージ表示
  - キャンセルで閉じる、submit 成功で閉じる
  - 名前空欄で submit 無効
- **ItemCard.test.tsx**: クリックで `onEdit` が呼ばれる、削除ボタンクリックで `onDelete` のみ呼ばれる (バブリング抑制) を追加
- **page.test.tsx**: 編集後に一覧が更新される (1 ケース追加)
- **E2E**: 本 change では追加しない。Phase 2 全体が落ち着いてから 1 シナリオで追記する (PR 分割を抑える)

## Risks / Trade-offs

- **[ItemCard クリック領域が広くなり誤操作のリスク]** → 削除ボタンは `stopPropagation` で防御。手動確認で削除→誤編集パスが起きないことを確認
- **[Create と Edit のコード重複]** → 3 箇所目で抽象化判断。今は重複を許容
- **[E2E に編集シナリオが入らない]** → ユニットテスト + 手動確認でカバー。後続 PR で追加する余地

## Migration Plan

不要 (UI 機能追加のみ。データモデル / API 互換性の変更なし)。

## Open Questions

- 編集途中で別カードをクリックした場合の挙動 (現行モーダルの破棄 → 新カードで開き直す) は実装で対応する。デザイン上の判断は不要
- 編集モーダル開いた状態でデータ更新 (将来のリアルタイム同期) があった場合の処理は Phase 3 で扱う

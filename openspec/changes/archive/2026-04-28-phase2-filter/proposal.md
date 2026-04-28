## Why

旧プロダクトでは「商品名検索」「買いたいリストだけ表示」「カテゴリ絞り込み」の 3 軸 AND フィルタが日常利用の中心だった (例: 醤油類だけ見る、買いたいものだけ見る、買い物前に "🛒+カテゴリ" で絞る)。Phase 2 で CRUD と wantToBuy トグルが揃った今、件数が増えても探しやすくするためにフィルタリングを揃える。

## What Changes

- **テキスト検索**: 商品名の部分一致フィルタ。クリアボタン付き
- **wantToBuy フィルタ**: チェックボックス的なトグル (全部 / 買いたいだけ の 2 状態)
- **カテゴリフィルタ**: 単一選択 `<select>`、「全部」option を含む
- **AND 結合**: 旧 `filter.js` と同じく全条件を AND で適用
- **空結果表示**: フィルタ後 0 件のとき「該当する商品がありません」を表示
- **新規コンポーネント `FilterBar`**: 検索 / トグル / select の合成
- **純関数 `filterStockItems`**: `frontend/src/lib/filterStockItems.ts` に分離 (テスト容易)
- **カテゴリ定数の共通化**: `frontend/src/constants/categories.ts` に切り出し、CreateItemModal と FilterBar が共有
- **クライアントサイドフィルタ**: 現状の `GET /api/stock-items` (全件) を前提に in-memory で絞り込む

## Capabilities

### New Capabilities
(なし)

### Modified Capabilities
- `stock-items-list`: フィルタ UI (検索・wantToBuy・カテゴリ) と AND 適用、空結果表示の挙動を仕様化

## Impact

- **影響ファイル**:
  - `frontend/src/app/stock-items/page.tsx` (filter state + 派生 `filteredItems`、FilterBar 結線)
  - `frontend/src/app/stock-items/page.test.tsx` (フィルタ結合テスト追加)
  - `frontend/src/components/FilterBar.tsx` (新規)
  - `frontend/src/components/FilterBar.test.tsx` (新規)
  - `frontend/src/lib/filterStockItems.ts` (新規・純関数)
  - `frontend/src/lib/filterStockItems.test.ts` (新規)
  - `frontend/src/constants/categories.ts` (新規・共通化)
  - `frontend/src/components/CreateItemModal.tsx` (カテゴリ定数を import に置換)
- **依存関係**: 追加なし
- **データモデル / API**: 変更なし

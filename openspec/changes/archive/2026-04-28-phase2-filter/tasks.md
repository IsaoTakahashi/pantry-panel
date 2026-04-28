## 1. カテゴリ定数の共通化

- [x] 1.1 `frontend/src/constants/categories.ts` を新規作成し `CATEGORIES`/`Category` を export
- [x] 1.2 `CreateItemModal.tsx` の直書きカテゴリ配列を `CATEGORIES` import に置換
- [x] 1.3 `CreateItemModal.test.tsx` が pass することを確認

## 2. フィルタ純関数

- [x] 2.1 `frontend/src/lib/filterStockItems.ts` を新規作成 (`FilterCondition` 型 + `filterStockItems` 関数)
- [x] 2.2 `frontend/src/lib/filterStockItems.test.ts` を新規作成 (Claude 提案 → user 実装):
  - 空 condition で全件返る
  - searchText 部分一致 (1 件マッチ / 0 件マッチ)
  - wantToBuyOnly=true で wantToBuy=true のみ
  - category 指定で該当カテゴリのみ
  - category=null で全カテゴリ
  - 3 軸 AND 結合 1 ケース

## 3. FilterBar コンポーネント

- [x] 3.1 `frontend/src/components/FilterBar.tsx` を新規作成 (props: `value: FilterCondition`, `onChange: (next) => void`)
- [x] 3.2 検索 input (`type="search"`) + クリアボタン (searchText 非空時のみ表示) を実装
- [x] 3.3 「買いたいだけ」トグル (チェックボックス) を実装
- [x] 3.4 カテゴリ select (「全部」option + `CATEGORIES`) を実装
- [x] 3.5 `frontend/src/components/FilterBar.test.tsx` を新規作成 (Claude 提案 → user 実装):
  - 検索入力で `onChange` が `searchText` 更新で呼ばれる
  - クリアボタンクリックで `searchText: ""` 更新で呼ばれる
  - 検索が空のときクリアボタンが表示されない
  - 「買いたいだけ」トグル変更で `wantToBuyOnly` 更新で呼ばれる
  - カテゴリ select 変更で `category` 更新で呼ばれる
  - カテゴリ「全部」選択で `category: null` 更新で呼ばれる

## 4. ページ結線

- [x] 4.1 `page.tsx` に `filter` state + `useMemo` で `filteredItems` を派生
- [x] 4.2 `FilterBar` を一覧の上に配置し `value={filter}` `onChange={setFilter}` を渡す
- [x] 4.3 `items.map` を `filteredItems.map` に変更
- [x] 4.4 `items.length > 0 && filteredItems.length === 0` のとき「該当する商品がありません」を表示
- [x] 4.5 `page.test.tsx` にフィルタ統合テストを追加 (Claude 提案 → user 実装):
  - 検索入力で表示が絞られ、クリアで戻る
  - 「買いたいだけ」ON で wantToBuy=false が消える
  - フィルタで 0 件のとき「該当する商品がありません」が表示される

## 5. 動作確認

- [x] 5.1 `npm run dev` + backend 起動でブラウザ目視確認
- [x] 5.2 検索: 商品名一部入力で絞り込まれる、クリアで戻る
- [x] 5.3 「買いたいだけ」: トグル ON で wantToBuy=true のみ、OFF で全件
- [x] 5.4 カテゴリ: 特定カテゴリ選択で絞り込まれる、「全部」で戻る
- [x] 5.5 AND 結合: 3 軸全部適用しても期待通り絞れる
- [x] 5.6 該当なし: 全件除外される条件で「該当する商品がありません」が表示される

## 6. クリーンアップ・PR

- [x] 6.1 `npx vitest run` で全テスト pass
- [x] 6.2 `npx biome check` でクリーン
- [x] 6.3 `npx tsc --noEmit` で型エラーなし
- [x] 6.4 ブランチを切って commit、PR を作成

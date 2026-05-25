## Context

`specs/scenarios.md` のユーザーシナリオ一覧（A〜L）に対してテストカバレッジ分析を実施した結果、11 件のシナリオがテストされていないことが判明した。フロントエンドは Vitest + @testing-library/react、バックエンドは testcontainers を使った Integration テストの基盤がすでに整っている。

## Goals / Non-Goals

**Goals:**
- 11 件の未カバーシナリオについて、既存のテスト基盤を使ってテストを追加する
- 各テストは 1 つのシナリオ ID に 1:1 で対応させ、traceability を持たせる

**Non-Goals:**
- プロダクションコードの変更
- E2E テスト（G-2/G-3 Realtime 複数端末、K-2 OAuth フロー）は範囲外
- テスト基盤・設定ファイルの変更

## Decisions

### フロントエンドテストの追加方針

既存の `page.test.tsx` / `ItemCard.test.tsx` / `UrlRegistrationModal.test.tsx` / `ImageSelectionModal.test.tsx` にテストを追記する。新ファイルは作成しない。

各テストには `// Scenario: <ID>` コメントを付けてシナリオとのトレーサビリティを確保する。

**B-4/B-5/B-6: フィルタ→初期値連携**

`page.test.tsx` のモック構成を確認し、`FilterBar` の `onSearchChange` / `onCategoryChange` / `onWantToBuyChange` を呼び出してから CreateItemModal の `initialName` / `initialCategory` / `wantToBuy` props を検証する。

**D-3/E-2: ソートキーの不変性**

`updateStockItem` モックのコール引数を `expect(updateStockItem).toHaveBeenCalledWith(expect.objectContaining({...}))` で検証する。`sortedAt` が含まれないことは `expect.not.objectContaining` を使う。

**E-3: 視覚的強調**

`ItemCard.test.tsx` で wantToBuy=true の場合にカートアイコン要素が特定の CSS クラスを持つことを `toHaveClass` で検証する。実際のクラス名は既存の ItemCard コンポーネントを読んで確認してから実装する。

**J-1-4: sourceUrl → リンクアイコン**

`ItemCard.test.tsx` で sourceUrl が非 null の場合に `role="link"` または `a[href]` が存在することを確認する。

**J-3-3: SSE 完了後の UI 遷移**

既存の `UrlRegistrationModal.test.tsx` のモック構成（ReadableStream シミュレーション）を参考に、最終 `done` イベント後に進捗リストが消えて抽出結果が表示されることを確認する。

**K-4: ログアウト**

`page.test.tsx` でヘッダーの「ログアウト」ボタンを特定（コンポーネント実装を読んで要素を特定）し、クリック後に `signOut` モックが呼ばれることを検証する。

**I-6: CSE 503 エラー**

`ImageSelectionModal.test.tsx` で `fetchImageSearchResults` モックが `{ error: "...", status: 503 }` を返す場合のエラーメッセージを確認する。

### バックエンドテストの追加方針

**L-6: RLS 分離**

`backend/repository/stock_item_test.go` に新しい Integration テスト関数を追加する。testcontainers の Postgres コンテナを使い、2 つの異なる `group_id` でデータを作成し、一方から他方のデータが取得・変更できないことを確認する。

既存の `TestListStockItems` / `TestUpdateStockItem` のセットアップ（`setupTestDB`）を流用し、RLS ポリシーがテスト環境でも有効になっていることを前提とする。ただし、testcontainers の DB に RLS が設定されているか確認してから実装する。

## Risks / Trade-offs

- **E-3 の CSS クラス名** → 実装を読んで正確なクラス名を使う必要がある。スタイルが変わるとテストが壊れる。クラスより aria-pressed など semantic な属性で検証できる場合はそちらを優先する
- **K-4 のログアウトボタン** → ヘッダーコンポーネントの実装によっては page.test.tsx から直接テストできない可能性がある。その場合はヘッダーコンポーネントのテストファイルを特定して追加する
- **L-6 の RLS** → testcontainers の DB に RLS マイグレーションが適用されているかどうかが前提条件。未適用の場合は L-6 は「RLS なしでも group_id によるフィルタが機能する」レベルで検証する

## 1. Setup

- [x] 1.1 GitHub Issue を作成し、ブランチ `{issue番号}-reset-filters-after-create` を作成する

## 2. Implementation (TDD)

- [x] 2.1 `page.test.tsx` に失敗するテストを追加する: フィルター（searchText / wantToBuyOnly / category）をセットした状態で商品作成に成功すると、すべて初期値にリセットされることを検証する
- [x] 2.2 `page.test.tsx` に失敗するテストを追加する: 商品作成が失敗（409など）した場合はフィルターが維持されることを検証する
- [x] 2.3 `StockItemsClient.tsx` に `handleCreateAndResetFilter` を実装し、`CreateItemModal` の `onCreate` に差し替える（design.md 参照）
- [x] 2.4 追加したテストが green になることを確認する
- [x] 2.5 コードレビューで指摘された S-5（URL登録フロー経由の作成でもフィルターがリセットされる）のテストを追加する
- [x] 2.6 コードレビューで指摘された `FilterCondition` 初期値の重複を `INITIAL_FILTER` 定数に切り出す
- [x] 2.7 コードレビューで指摘された新規テストの `waitFor` 分割を既存ファイルの慣習に合わせて統合する

## 3. Verification

- [x] 3.1 `cd frontend && npx vitest run` で既存テストに regression がないことを確認する
- [x] 3.2 commit のたびに push し、PR 上の CI を最新状態に保つ

## 4. Review

- [x] 4.1 コードレビュー sub-agent で差分をレビューする
- [x] 4.2 `gh pr checks --watch` で CI の結果を確認する

## 5. Archive

- [x] 5.1 PR マージ前に `opsx:archive` を実行し、proposal.md のシナリオを `openspec/specs/stock-items-list/spec.md` へ昇格する

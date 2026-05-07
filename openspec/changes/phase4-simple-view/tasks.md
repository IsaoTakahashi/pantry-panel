## 1. Issue・ブランチ準備

- [x] 1.1 GitHub Issue を作成する（タイトル: "Phase 4 機能H: シンプル表示モード"）
- [x] 1.2 Issue 番号ベースのブランチを作成する
- [x] 1.3 Draft PR を作成する

## 2. 型・コンポーネントのテスト実装

- [x] 2.1 `ItemCardSimple.test.tsx` を新規作成（表示・🛒トグル・カードクリック編集・削除ボタン非表示の各テスト）
- [x] 2.2 `FilterBar.test.tsx` に表示モードトグルのテストを追加（通常/シンプル切替、aria-checked 反映）
- [x] 2.3 `page.test.tsx` に統合テストを追加（初期は ItemCard、切替後は ItemCardSimple）

## 3. プロダクションコード実装

- [x] 3.1 `ItemCardSimple.tsx` を新規作成（1行レイアウト、削除ボタンなし、🛒・カテゴリバッジ・商品名）
- [x] 3.2 `FilterBar.tsx` に `viewMode` / `onViewModeChange` props を追加し、3段目にトグルを実装
- [x] 3.3 `StockItemsPage` に `viewMode` state を追加し、`FilterBar` への props 渡し・カードコンポーネントの分岐を実装

## 4. 動作確認・仕上げ

- [ ] 4.1 dev サーバーで通常 ↔ シンプル切替・編集・🛒トグルを手動確認
- [ ] 4.2 CI（lint + tsc + vitest）がすべてパスすることを確認
- [ ] 4.3 PR を ready for review にして、Issue を `Closes #N` でリンクする

## 1. GitHub Issue とブランチを作成する

- [x] 1.1 GitHub Issue を作成する（タイトル: "refactor: extract useStockItems hook, fix silent errors, replace window.confirm"）
- [x] 1.2 Issue 番号を使ってブランチを作成する（例: `{N}-frontend-best-practice`）

## 2. ConfirmDialog コンポーネントを作成する

- [x] 2.1 `frontend/src/components/ConfirmDialog.tsx` を新規作成する（BaseModal ベース、props: isOpen / message / onConfirm / onCancel）
- [x] 2.2 `frontend/src/components/ConfirmDialog.test.tsx` を新規作成する（表示・キャンセル・確認の3シナリオ）
- [x] 2.3 Biome lint と TypeScript 型チェックを通す

## 3. useStockItems フックを作成する

- [x] 3.1 `frontend/src/app/stock-items/useStockItems.ts` を新規作成する
- [x] 3.2 `StockItemsClient.tsx` から state（items / loading / error / isModalOpen / urlModalOpen / prefill / editingItem / imageEditingItem / confirmDeleteItem）を移動する
- [x] 3.3 全 CRUD ハンドラを移動する（handleCreate / handleSave / handleToggleWantToBuy / handleDelete / handleConfirmDelete / handleCloseEdit / handleOpenEdit / handleOpenImageEdit / handleImageSelect / handleRenameGroup / handleCreateNewGroup / handleExtracted）
- [x] 3.4 各ハンドラに try/catch を追加し、失敗時に `setError(...)`, 成功時に `setError(null)` をセットする
- [x] 3.5 `handleDelete` を「confirmDeleteItem state をセットするだけ」に変更し、`handleConfirmDelete` を追加する
- [x] 3.6 `handleToggleWantToBuy` に楽観的更新のロールバック処理を追加する（失敗時に元の state に戻す）
- [x] 3.7 `frontend/src/app/stock-items/useStockItems.test.ts` を新規作成する（renderHook で各ハンドラのエラーケースを含む）

## 4. StockItemsClient.tsx をリファクタリングする

- [x] 4.1 `useStockItems` フックを呼び出すように `StockItemsClient.tsx` を書き換える（state・ハンドラは全てフックから取得）
- [x] 4.2 `window.confirm` 呼び出しを削除し、`ConfirmDialog` コンポーネントを JSX に追加する
- [x] 4.3 Biome lint と TypeScript 型チェックを通す
- [x] 4.4 既存の `StockItemsClient` テストを修正する（フックは vi.mock でモック化）

## 5. テスト・品質チェック

- [x] 5.1 `npm test` で全 unit テストが pass することを確認する
- [x] 5.2 dev サーバーを起動して `npx playwright test` でローカル E2E テストが pass することを確認する（ConfirmDialog の `not.toBeAttached()` 待機が必要な箇所を確認する）
- [x] 5.3 `npm run build` が成功することを確認する

## 6. PR を作成して CI を確認する

- [x] 6.1 変更をコミット・push して PR を作成する（`Closes #N` を本文に含める）
- [x] 6.2 `gh pr checks --watch` で CI が pass することを確認する

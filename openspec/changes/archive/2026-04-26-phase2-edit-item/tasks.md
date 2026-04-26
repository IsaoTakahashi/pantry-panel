## 1. API クライアント

- [x] 1.1 `types/stockItem.ts` に `UpdateStockItemRequest` 型がなければ追加 (`name?`, `category?`, `wantToBuy?`)
- [x] 1.2 `lib/api.ts` に `updateStockItem(id, params)` を追加 (PATCH 呼び出し、409 を含むエラーを `Error` で投げる)
- [x] 1.3 `lib/api.test.ts` のテストケースを設計 (Claude 提案 → user 実装)
- [x] 1.4 テストが pass することを確認

## 2. EditItemModal

- [x] 2.1 `EditItemModal.tsx` のインターフェース (props 型) を確定 (`item`, `isOpen`, `onClose`, `onSave`)
- [x] 2.2 `EditItemModal.test.tsx` のテストケースを設計 (初期値、保存、409、キャンセル、バリデーション)
- [x] 2.3 `EditItemModal.tsx` を実装 (Create と同じ Tailwind 配色、ボタンラベルは「保存」「キャンセル」)
- [x] 2.4 テストが pass することを確認

## 3. ItemCard クリック動線

- [x] 3.1 `ItemCard.tsx` を `<article>` 内 `<button>` 構造に変更し、`onEdit(item)` prop を追加
- [x] 3.2 削除ボタンの onClick で `event.stopPropagation()` を呼び出し、編集トリガーが発火しないようにする (兄弟構造のため不要と判断 — 削除と編集 button は article 直下の兄弟)
- [x] 3.3 `ItemCard.test.tsx` にクリック動線のテストを追加 (編集発火、削除のみ呼ばれること、キーボード操作)
- [x] 3.4 既存テストが pass することを確認

## 4. ページ結線

- [x] 4.1 `page.tsx` に `editingItem` state とハンドラ (`handleOpenEdit`, `handleSave`) を追加
- [x] 4.2 ItemCard に `onEdit` を渡し、EditItemModal をレンダリング
- [x] 4.3 `page.test.tsx` に編集フローのテストを追加 (1 ケース: クリック→保存→一覧更新)
- [x] 4.4 既存テストが pass することを確認

## 5. 動作確認

- [x] 5.1 `npm run dev` + backend 起動でブラウザ目視確認
- [x] 5.2 編集成功フロー (カードクリック → 名前/カテゴリ変更 → 保存 → 一覧反映)
- [x] 5.3 重複名エラー時のメッセージ表示
- [x] 5.4 削除ボタンが編集を発火させないこと

## 6. クリーンアップ・PR

- [x] 6.1 `npx vitest run` で全テスト pass
- [x] 6.2 `npx biome check` でクリーン
- [ ] 6.3 ブランチを切って commit、PR を作成

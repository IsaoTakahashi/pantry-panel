## 1. ページレイアウトの余白削減

- [x] 1.1 `stock-items/page.tsx` のヘッダー padding を `py-4 px-6` → `py-2 px-4` に変更
- [x] 1.2 `stock-items/page.tsx` の `<main>` padding を `py-6` → `py-4` に変更
- [x] 1.3 `stock-items/page.tsx` のフィルター＋ボタン領域のマージンを `mb-6` → `mb-4` に変更
- [x] 1.4 `stock-items/page.tsx` のグリッド gap を `gap-4` → `gap-3` に変更

## 2. ItemCard の余白削減

- [x] 2.1 `ItemCard.tsx` の `<article>` padding を `p-4` → `px-3 py-2` に変更
- [x] 2.2 `ItemCard.tsx` の `<article>` gap を `gap-4` → `gap-3` に変更

## 3. 動作確認

- [x] 3.1 ローカル dev server を起動し、通常モード・シンプルモードそれぞれで余白が縮小されていることを目視確認
- [x] 3.2 既存テスト（`npm run test`）がすべて通過することを確認

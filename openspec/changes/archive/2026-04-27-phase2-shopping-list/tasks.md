## 1. ItemCard トグルボタン

- [x] 1.1 `ItemCard.tsx` の props に `onToggleWantToBuy: (item: StockItem) => void` を追加
- [x] 1.2 編集 button と削除 button の間に トグル button を追加 (`<button>` 兄弟、aria-label と aria-pressed 設定)
- [x] 1.3 wantToBuy=true / false でスタイル切替 (teal 塗り vs 灰色)
- [x] 1.4 `ItemCard.test.tsx` の既存テストすべてに `onToggleWantToBuy={vi.fn()}` を追加
- [x] 1.5 `ItemCard.test.tsx` にトグル動線のテストを追加 (Claude 提案 → user 実装):
  - wantToBuy=false で aria-pressed=false
  - wantToBuy=true で aria-pressed=true、削除ボタンは表示されない
  - トグルクリックで `onToggleWantToBuy(item)` が呼ばれ、`onEdit` は呼ばれない
- [x] 1.6 既存テストが pass することを確認

## 2. ページ結線

- [x] 2.1 `page.tsx` に `handleToggleWantToBuy` ハンドラを追加 (`updateStockItem(id, { wantToBuy: !item.wantToBuy })` → `fetchStockItems` 再取得)
- [x] 2.2 ItemCard に `onToggleWantToBuy={handleToggleWantToBuy}` を渡す
- [x] 2.3 `page.test.tsx` にトグルフローのテストを追加 (1 ケース: クリック→API 呼出→一覧更新)
- [x] 2.4 既存テストが pass することを確認

## 3. 動作確認

- [x] 3.1 `npm run dev` + backend 起動でブラウザ目視確認
- [x] 3.2 wantToBuy=false の商品をトグル → teal 塗りに変化、削除ボタンが disabled、カードが先頭に
- [x] 3.3 wantToBuy=true の商品をトグル → 灰色アウトラインに戻り、削除ボタンが enabled
- [x] 3.4 トグルクリックで編集モーダルが開かないこと

## 4. クリーンアップ・PR

- [x] 4.1 `npx vitest run` で全テスト pass
- [x] 4.2 `npx biome check` でクリーン
- [x] 4.3 `npx tsc --noEmit` で型エラーなし
- [ ] 4.4 ブランチを切って commit、PR を作成

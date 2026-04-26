## 1. ヘッダーとページレイアウト

- [x] 1.1 `app/stock-items/page.tsx` 最上部に teal グラデーションヘッダーを追加 (`bg-gradient-to-br from-[#009e6c] via-[#00d1b2] to-[#00e7eb]`, `text-white`, タイトル "Pantry Panel")
- [x] 1.2 メインコンテンツを `max-w-6xl mx-auto px-4 py-6` で囲い、空状態・エラー状態にも適用
- [x] 1.3 空状態 ("商品がありません") とエラー状態 ("商品を取得できませんでした") を中央寄せ・余白付きで表示
- [x] 1.4 エラー文字色を `text-red-600` 系に変更

## 2. ItemCard

- [x] 2.1 商品名を `text-lg font-bold` に
- [x] 2.2 カテゴリをバッジ風 (`inline-block bg-[#ebfffc] text-[#00947e] text-xs px-2 py-0.5 rounded-full`) に変更
- [x] 2.3 カードに `shadow-sm hover:shadow-md` を追加し、`transition-shadow` を付与
- [x] 2.4 削除ボタンの色 (`bg-[#ff3860] hover:bg-[#ff2b56] text-white`) と余白 (`px-3 py-1.5`) を整える
- [x] 2.5 既存のテストが pass することを確認

## 3. CreateItemModal

- [x] 3.1 タイトル "商品を追加" を `text-lg font-semibold mb-6` に変更
- [x] 3.2 ラベル文字色を `text-gray-700` に明示
- [x] 3.3 入力欄 (input/select) にフォーカススタイル `focus:ring-2 focus:ring-[#00d1b2] focus:border-transparent` を追加
- [x] 3.4 ボタン群を `flex justify-end gap-2` に変更し、ボタン幅を `w-full` から内容に応じる (`px-4 py-2`) に変更
- [x] 3.5 「追加」ボタン: `bg-[#00d1b2] hover:bg-[#00c4a7] text-white`、disabled で `bg-gray-300`
- [x] 3.6 「キャンセル」ボタン: `bg-gray-200 text-gray-800 hover:bg-gray-300`
- [x] 3.7 オーバーレイ背景の透過度・フォーカストラップを確認 (動作確認のみ)
- [x] 3.8 既存のテストが pass することを確認

## 4. 動作確認

- [x] 4.1 `npm run dev` でブラウザ表示を目視確認
- [x] 4.2 商品の登録フロー (登録 → 一覧表示 → モーダル閉じる) が問題なく動くか
- [x] 4.3 商品の削除フロー (削除確認 → 削除 → 一覧更新) が問題なく動くか
- [ ] 4.4 Lighthouse / DevTools で簡易にコントラスト確認 (任意)

## 5. クリーンアップ・PR

- [x] 5.1 `npx vitest run` で全テスト pass を確認
- [x] 5.2 `npx biome check --apply` で lint/format を整える
- [x] 5.3 ブランチを切って commit、PR を作成

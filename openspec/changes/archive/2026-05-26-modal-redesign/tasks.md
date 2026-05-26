## 1. BaseModal 実装

- [x] 1.1 `frontend/src/components/BaseModal.tsx` を新規作成する（framer-motion の AnimatePresence + motion.div を使用、sm: ブレークポイントでボトムシート / センターダイアログを切り替え、Esc キー・オーバーレイクリックで閉じる）
- [x] 1.2 `frontend/src/components/BaseModal.test.tsx` を新規作成し、ボトムシート描画・センターダイアログ描画・Esc で閉じる・オーバーレイクリックで閉じるをテストする
- [x] 1.3 CI がローカルで通ることを確認する（`cd frontend && npm test -- BaseModal`）

## 2. EditItemModal を BaseModal に移行

- [x] 2.1 `EditItemModal.tsx` を BaseModal を使うよう書き換える（フォームフィールドを新スタイルに、ボタンを新スタイルに）
- [x] 2.2 `EditItemModal.test.tsx` を通過させる（必要な場合のみ最小修正）
- [x] 2.3 dev server で EditItemModal の動作・見た目を確認する

## 3. CreateItemModal を BaseModal に移行

- [x] 3.1 `CreateItemModal.tsx` を BaseModal を使うよう書き換える（画像プレビュー・wantToBuy トグルを含む、フォームフィールドを新スタイルに、ボタンを新スタイルに）
- [x] 3.2 `CreateItemModal.test.tsx` を通過させる（必要な場合のみ最小修正）
- [x] 3.3 dev server で CreateItemModal の動作・見た目を確認する

## 4. UrlRegistrationModal を BaseModal に移行

- [x] 4.1 `UrlRegistrationModal.tsx` を BaseModal を使うよう書き換える（4ステート idle / streaming / nameSelection / error のロジックは変えず JSX 構造のみ変更、progress ステップリストを新スタイルカードに）
- [x] 4.2 `UrlRegistrationModal.test.tsx` を通過させる（必要な場合のみ最小修正）
- [x] 4.3 dev server で UrlRegistrationModal の動作・見た目を確認する

## 5. セルフレビューと CI 確認

- [x] 5.1 iPhone 15 Pro 幅 393px でボトムシートが正しく表示されることをブラウザで確認する
- [x] 5.2 ボタンテキスト（キャンセル・追加・保存・抽出）が 1 行で収まることを 393px 幅で確認する
- [x] 5.3 デスクトップ幅（640px〜）でセンターダイアログが表示されることを確認する
- [x] 5.4 モバイル slide-up アニメーション・デスクトップ fade+scale アニメーションが動作することを確認する
- [x] 5.5 `cd frontend && npm test` で全テストが通ることを確認する
- [x] 5.6 変更を commit して push し、PR 上の CI が通ることを `gh pr checks --watch` で確認する

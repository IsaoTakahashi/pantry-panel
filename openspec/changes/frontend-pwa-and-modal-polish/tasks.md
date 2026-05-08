## 1. Issue・ブランチ準備

- [x] 1.1 GitHub Issue を作成する（タイトル: "Frontend ポリッシュ: PWA + モーダル + redirect 等"）
- [x] 1.2 Issue 番号ベースのブランチを作成する
- [x] 1.3 Draft PR を作成する

## 2. PWA メタデータ整備

- [x] 2.1 `frontend/src/app/manifest.ts` を新規作成（name / short_name / start_url=`/stock-items` / display=`standalone` / theme_color=`#00d1b2` / background_color=`#ffffff` / icons=512x512 + 192x192 両方とも `/icon.png` 参照）
- [x] 2.2 `frontend/src/app/layout.tsx` の `metadata` を更新（title / description / icons / manifest）
- [x] 2.3 ユーザーが `frontend/public/icon.png` (1024×1024 PNG) を配置する

## 3. Root redirect

- [x] 3.1 `frontend/src/app/page.tsx` を `redirect("/stock-items")` だけのコンポーネントに置換
- [x] 3.2 古い Image 等の import / 使用は全削除

## 4. モーダル背景修正

- [x] 4.1 `frontend/src/components/CreateItemModal.tsx` の dialog `<div>` を修正（`bg-black/50` + `z-50` + `aria-modal="true"`）
- [x] 4.2 `frontend/src/components/EditItemModal.tsx` も同様に修正
- [ ] 4.3 dev サーバーで「商品を追加」を開き、表示モードトグル等が透けず・操作不能になることを手動確認

## 5. モーダル input テキスト色

- [x] 5.1 `CreateItemModal` の `<input>` / `<select>` の className に `text-gray-900` を追加
- [x] 5.2 `EditItemModal` も同様に
- [x] 5.3 placeholder テキストは `placeholder:text-gray-400` を併用（input only）

## 6. CreateItemModal: initialCategory prop

- [x] 6.1 `CreateItemModal` に `initialCategory: string` prop を追加し、`category` state の初期値とする
- [x] 6.2 `<option value="">選択してください</option>` を削除
- [x] 6.3 `frontend/src/app/stock-items/page.tsx` で `initialCategory={filter.category ?? "★"}` を渡す
- [x] 6.4 `CreateItemModal.test.tsx` を更新（initialCategory のテスト追加、4 ケース追加で計 12 ケース）
- [x] 6.5 `page.test.tsx` の関連テストを更新（既存テストは破壊しないことを確認、追加テスト不要）

## 7. 動作確認・仕上げ

- [ ] 7.1 ローカル `npm run lint && npx tsc --noEmit && npm run test` がすべて通る
- [ ] 7.2 dev サーバーで以下を手動確認:
  - `/` にアクセスすると `/stock-items` にリダイレクト
  - ブラウザタブに `Pantry Panel`
  - 「商品を追加」モーダルが半透明黒の背景で開き、背景操作不可
  - モーダルの入力文字 / select 文字が濃い
  - フィルタが「全部」のとき、モーダルカテゴリ初期値が `"★"`
  - フィルタが「調味料」のとき、モーダルカテゴリ初期値が `"調味料"`
  - icon.png 配置済みなら、Chrome DevTools → Application → Manifest が valid
- [ ] 7.3 GitHub Actions CI（lint + tsc + vitest + go test + e2e）がすべて pass
- [ ] 7.4 PR を ready for review にして `Closes #N` リンク
- [ ] 7.5 マージ後に `openspec archive frontend-pwa-and-modal-polish` で archive する

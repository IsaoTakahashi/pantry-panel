## Why

旧プロダクトの中心的価値は「在庫が切れた / 切れそうな商品をワンタップで買い物リストに入れる」UX。Phase 1 で wantToBuy フィールドは作成可能だが、ユーザが画面上でトグルする手段が無い。Phase 2 機能 E として、商品カード上で wantToBuy をトグルする UI を追加し、旧プロダクトの「🛒 アイコンで買いたいリスト送り」体験を再現する。

## What Changes

- **wantToBuy トグルボタン** を商品カードに追加 (常に表示、編集ボタン・削除ボタンと兄弟)
- **視覚状態の差別化** — wantToBuy=true のときアイコンを teal で塗り、false なら灰色アウトライン
- **API クライアント** は既存の `updateStockItem(id, { wantToBuy })` を再利用 (新規追加なし)
- **トグル成功で再取得** — `updated_at` が更新されるためカードが先頭に来る (バックエンド側で COALESCE + DEFAULT now() による更新が既に動作)
- **削除ボタンの表示条件** は変更なし (wantToBuy=false の時のみ削除可)。トグルにより wantToBuy=true になると削除ボタンが消える挙動を維持

データモデル変更なし、新規エンドポイント追加なし。バックエンドは既に PATCH の wantToBuy optional 対応済み。

## Capabilities

### New Capabilities
(なし)

### Modified Capabilities
- `stock-items-list`: カード UI に wantToBuy トグルボタンと状態表示を追加。トグル成功時の一覧再取得・並び替えの挙動を仕様化

## Impact

- **影響ファイル**:
  - `frontend/src/components/ItemCard.tsx` (トグルボタン追加)
  - `frontend/src/components/ItemCard.test.tsx` (トグル動線のテスト追加)
  - `frontend/src/app/stock-items/page.tsx` (`handleToggleWantToBuy` ハンドラ + ItemCard への結線)
  - `frontend/src/app/stock-items/page.test.tsx` (トグルフローのテスト追加)
  - `frontend/e2e/stock-items.spec.ts` (任意・後続 PR でも可)
- **依存関係**: 追加なし (`updateStockItem` 既存)
- **テスト**: `ItemCard` の既存テストにアサーション修正が必要 (toggle button が常時表示される)

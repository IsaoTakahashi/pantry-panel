## Why

Phase 1 で商品の登録・削除はできるが、入力ミスや方針変更で名前・カテゴリを直したい場合に削除→再作成する必要があり手間。Phase 2 の最初の機能として「商品情報編集」を追加し、既存の商品を直接修正できるようにする。

## What Changes

- **編集モーダル** (`EditItemModal`) を新規追加。名前とカテゴリの 2 項目を 1 つのフォームで編集できる
- **ItemCard クリック** で編集モーダルを開く動線を追加 (削除ボタンクリックは引き続き削除)
- **API クライアント** に `updateStockItem(id, params)` を追加し、既存の `PATCH /api/stock-items/:id` を呼び出す
- **重複名のエラー処理** — POST と同じ 409 を 「その商品は登録済みです」として表示
- **編集成功後** はモーダルを閉じ、一覧を再取得して並び順 (`updated_at DESC`) に反映する

データモデル変更なし、新規エンドポイント追加なし。バックエンドは既に PATCH に対応済み (name/category/wantToBuy が optional)。

## Capabilities

### New Capabilities
- `stock-item-edit`: 商品情報編集モーダルの表示・入力・送信・エラー処理に関するルール

### Modified Capabilities
- `stock-items-list`: 商品カードのクリック動線として「編集モーダルを開く」を追加

## Impact

- **影響ファイル**:
  - `frontend/src/components/EditItemModal.tsx` (新規)
  - `frontend/src/components/EditItemModal.test.tsx` (新規)
  - `frontend/src/components/ItemCard.tsx` (クリックで編集モーダルを開くトリガー追加)
  - `frontend/src/components/ItemCard.test.tsx` (クリック動線のテスト追加)
  - `frontend/src/app/stock-items/page.tsx` (モーダル状態管理、編集ハンドラの結線)
  - `frontend/src/app/stock-items/page.test.tsx` (編集フローのテスト追加)
  - `frontend/src/lib/api.ts` (`updateStockItem` 関数追加)
  - `frontend/src/lib/api.test.ts` (新関数のテスト追加)
  - `frontend/e2e/stock-items.spec.ts` (E2E に編集シナリオを追加 — 任意、後続 PR でも可)
- **依存関係**: 追加なし
- **テスト**: 既存テストへの影響は ItemCard クリック動線追加によるアサーション修正のみ

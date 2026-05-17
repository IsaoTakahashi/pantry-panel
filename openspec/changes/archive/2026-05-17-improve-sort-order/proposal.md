## Why

現在、商品への**あらゆる変更**（名前・画像・wantToBuy OFF 含む）が `updated_at` を更新してしまい、意図せず商品がリスト先頭へ移動する。「新規追加」と「買いたいリスト追加（wantToBuy ON）」の場合のみ先頭に移動させる旧仕様を再現するため、専用のソートキーが必要。

## What Changes

- `stock_items` テーブルに `sorted_at TIMESTAMPTZ` カラムを追加する
- `GET /api/stock-items` のソートを `updated_at DESC` から `sorted_at DESC` に変更する
- `sorted_at` を更新するタイミングを以下に限定する:
  - 新規作成時（`POST /api/stock-items`）: `sorted_at = now()`
  - `wantToBuy` を `true` に更新する時（`PATCH /api/stock-items/:id`）: `sorted_at = now()`
- 以下の操作では `sorted_at` を変更しない（順序維持）:
  - 名前・カテゴリ・画像の変更
  - `wantToBuy` を `false` に変更
- API レスポンスに `sortedAt` フィールドを追加する
- マイグレーション: 既存レコードは `sorted_at = updated_at` で初期化（現在の並び順を保持）

## Capabilities

### New Capabilities

なし

### Modified Capabilities

- `stock-items-api`: `sorted_at` カラム追加、ソート基準の変更、レスポンス形式の変更
- `stock-items-list`: アイテムがトップへ移動する条件の変更（`updated_at DESC` → `sorted_at DESC`）

## Impact

- **Backend**: DB マイグレーション、`PgStockItemRepository.List()` のクエリ変更、`Update()` の `sorted_at` 更新ロジック追加
- **Frontend**: `StockItem` 型に `sortedAt` を追加（UI 表示は不要だが型整合のため）
- **Spec**: `stock-items-api` と `stock-items-list` の既存 spec を更新

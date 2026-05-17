## 1. Database Migration

- [x] 1.1 `backend/db/migrations/004_add_sorted_at_to_stock_items.sql` を作成し、`sorted_at TIMESTAMPTZ NOT NULL DEFAULT now()` カラムを追加する
- [x] 1.2 マイグレーションで既存レコードを `UPDATE stock_items SET sorted_at = updated_at` で初期化する

## 2. Backend: Repository

- [x] 2.1 `backend/repository/stock_item.go` の `StockItem` 構造体に `SortedAt time.Time` フィールドを追加する
- [x] 2.2 `PgStockItemRepository.List()` のクエリに `sorted_at` を追加し、`ORDER BY sorted_at DESC` に変更する
- [x] 2.3 `PgStockItemRepository.Create()` の INSERT に `sorted_at` を含める
- [x] 2.4 `PgStockItemRepository.Update()` のロジックを修正し、`wantToBuy = true` のとき `sorted_at = now()` を SET に含め、それ以外は含めない

## 3. Backend: Handler / Response

- [x] 3.1 `backend/handler/stock_item.go` のレスポンス DTO（または JSON タグ）に `sortedAt` を追加する

## 4. Backend: Tests

- [x] 4.1 `List()` が `sorted_at DESC` で並ぶことを確認するテストを更新・追加する
- [x] 4.2 `Update()` で `wantToBuy=true` のとき `sorted_at` が更新されることをテストする
- [x] 4.3 `Update()` で `wantToBuy=false` のとき `sorted_at` が変わらないことをテストする
- [x] 4.4 `Update()` で名前のみ変更したとき `sorted_at` が変わらないことをテストする

## 5. Frontend: Type

- [x] 5.1 `frontend/src/types/stockItem.ts` の `StockItem` 型に `sortedAt: string` を追加する

## 6. CI

- [x] 6.1 ブランチを push して GitHub Actions (CI) がグリーンになることを確認する

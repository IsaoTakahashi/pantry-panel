## Context

現在の `stock_items` テーブルは `updated_at` を `ORDER BY updated_at DESC` のソートキーとして使用しているが、`updated_at` はあらゆる UPDATE で自動更新されるため、名前変更・画像変更・wantToBuy OFF でも商品がリスト先頭に移動してしまう。旧製品（Firebase）では `negateUpdatedTime` という専用フィールドを持ち、特定の操作のみで更新することで順序制御を実現していた。

## Goals / Non-Goals

**Goals:**
- 新規追加・wantToBuy ON の場合のみ商品がリスト先頭へ移動する
- 名前・カテゴリ・画像変更・wantToBuy OFF では順序が変わらない
- 既存データの並び順を壊さない

**Non-Goals:**
- ユーザーによる手動並び替え
- `updated_at` の意味・挙動の変更
- UI への `sortedAt` 表示

## Decisions

### 専用ソートキー `sorted_at` を追加する

**選択肢:**
- A. `sorted_at` カラムを追加（採用）
- B. `updated_at` の更新ロジックを操作ごとに制御する

**理由:** B は「最終更新日時」という `updated_at` の本来の意味を壊す。また将来的に `updated_at` を監査や UI 表示に使う可能性を残したい。A は責務が明確で変更が局所的。

### `sorted_at` を更新するタイミング

| 操作 | `sorted_at` |
|------|------------|
| `POST /api/stock-items`（新規作成） | `now()` |
| `PATCH` で `wantToBuy: true` | `now()` |
| `PATCH` で `wantToBuy: false` | 変更なし |
| `PATCH` で `name` / `category` / `imageUrl` のみ | 変更なし |

バックエンドの `Update()` ハンドラ（または Repository）がリクエストの `wantToBuy` 値を見て `sorted_at` を更新するかどうかを決定する。

### API レスポンスに `sortedAt` を含める

フロントエンドの `StockItem` 型との整合性のために含める。UI 表示は不要だが、型の欠落によるビルドエラーを防ぐ。

## Risks / Trade-offs

- **`sorted_at` と `updated_at` の重複感** → 役割が明確に異なる（順序制御 vs 最終更新記録）ためドキュメントで区別を明示する
- **マイグレーション失敗** → `sorted_at = updated_at` のデフォルト設定は単純な UPDATE のため、ロールバックは `sorted_at` カラムを DROP するだけ

## Migration Plan

1. `002_add_sorted_at_to_stock_items.sql` を追加
   - `ALTER TABLE stock_items ADD COLUMN sorted_at TIMESTAMPTZ NOT NULL DEFAULT now();`
   - `UPDATE stock_items SET sorted_at = updated_at;`（既存レコードの並び順を保持）
2. `PgStockItemRepository.List()` のクエリを `ORDER BY sorted_at DESC` に変更
3. `PgStockItemRepository.Create()` の INSERT に `sorted_at = now()` を含める（DEFAULT で自動設定されるが明示）
4. `PgStockItemRepository.Update()` に `wantToBuy = true` のとき `sorted_at = now()` を追加
5. `StockItem` 構造体（Go）と TypeScript 型に `SortedAt` / `sortedAt` を追加

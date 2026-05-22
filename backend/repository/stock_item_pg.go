package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PgStockItemRepository struct {
	pool *pgxpool.Pool
}

func NewPgStockItemRepository(pool *pgxpool.Pool) *PgStockItemRepository {
	return &PgStockItemRepository{pool: pool}
}

const stockItemColumns = "id, name, category, image_url, source_url, want_to_buy, group_id, created_at, updated_at, sorted_at"

func (r *PgStockItemRepository) List(ctx context.Context, groupID uuid.UUID) ([]StockItem, error) {
	rows, _ := r.pool.Query(ctx,
		"SELECT "+stockItemColumns+" FROM stock_items WHERE group_id = $1 ORDER BY sorted_at DESC",
		groupID)
	return pgx.CollectRows(rows, pgx.RowToStructByName[StockItem])
}

func (r *PgStockItemRepository) Get(ctx context.Context, id uuid.UUID, groupID uuid.UUID) (*StockItem, error) {
	rows, _ := r.pool.Query(ctx,
		"SELECT "+stockItemColumns+" FROM stock_items WHERE id = $1 AND group_id = $2",
		id, groupID)
	return pgx.CollectExactlyOneRow(rows, pgx.RowToAddrOfStructByName[StockItem])
}

func (r *PgStockItemRepository) Create(ctx context.Context, groupID uuid.UUID, name, category string, wantToBuy *bool, sourceURL *string) (*StockItem, error) {
	rows, _ := r.pool.Query(ctx,
		"INSERT INTO stock_items (name, category, want_to_buy, group_id, sorted_at, source_url) VALUES ($1, $2, COALESCE($3, false), $4, NOW(), $5) RETURNING "+stockItemColumns,
		name, category, wantToBuy, groupID, sourceURL)
	return pgx.CollectExactlyOneRow(rows, pgx.RowToAddrOfStructByName[StockItem])
}

func (r *PgStockItemRepository) Update(ctx context.Context, id uuid.UUID, groupID uuid.UUID, params UpdateParams) (*StockItem, error) {
	var imageURLSet bool
	var imageURLValue *string
	if params.ImageURL != nil {
		imageURLSet = true
		imageURLValue = params.ImageURL.Value
	}

	rows, _ := r.pool.Query(ctx,
		`UPDATE stock_items SET
			name = COALESCE($3, name),
			category = COALESCE($4, category),
			want_to_buy = COALESCE($5, want_to_buy),
			image_url = CASE WHEN $6::boolean THEN $7 ELSE image_url END,
			updated_at = NOW(),
			sorted_at = CASE WHEN $5::boolean IS TRUE THEN NOW() ELSE sorted_at END
		WHERE id = $1 AND group_id = $2
		RETURNING `+stockItemColumns,
		id, groupID, params.Name, params.Category, params.WantToBuy, imageURLSet, imageURLValue)

	return pgx.CollectExactlyOneRow(rows, pgx.RowToAddrOfStructByName[StockItem])
}

func (r *PgStockItemRepository) Delete(ctx context.Context, id uuid.UUID, groupID uuid.UUID) error {
	result, err := r.pool.Exec(ctx,
		"DELETE FROM stock_items WHERE id = $1 AND group_id = $2",
		id, groupID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

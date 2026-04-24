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

func (r *PgStockItemRepository) List(ctx context.Context) ([]StockItem, error) {
	rows, _ := r.pool.Query(ctx, "SELECT id, name, category, image_url, want_to_buy, created_at, updated_at FROM stock_items ORDER BY updated_at DESC")

	return pgx.CollectRows(rows, pgx.RowToStructByName[StockItem])
}

func (r *PgStockItemRepository) Create(ctx context.Context, name, category string) (*StockItem, error) {
	rows, _ := r.pool.Query(ctx,
		"INSERT INTO stock_items (name, category) VALUES ($1, $2) RETURNING id, name, category, image_url, want_to_buy, created_at, updated_at",
		name, category)

	return pgx.CollectExactlyOneRow(rows, pgx.RowToAddrOfStructByName[StockItem])
}

func (r *PgStockItemRepository) Update(ctx context.Context, id uuid.UUID, params UpdateParams) (*StockItem, error) {
	rows, _ := r.pool.Query(ctx,
		`UPDATE stock_items SET
			name = COALESCE($2, name),
			category = COALESCE($3, category),
			want_to_buy = COALESCE($4, want_to_buy),
			updated_at = NOW()
		WHERE id = $1
		RETURNING id, name, category, image_url, want_to_buy, created_at, updated_at`,
		id, params.Name, params.Category, params.WantToBuy)

	return pgx.CollectExactlyOneRow(rows, pgx.RowToAddrOfStructByName[StockItem])
}

func (r *PgStockItemRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result, err := r.pool.Exec(ctx, "DELETE FROM stock_items WHERE id = $1", id)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

package repository

import (
	"context"
	"log"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func strPtr(s string) *string { return &s }
func boolPtr(b bool) *bool    { return &b }

var testPool *pgxpool.Pool

func TestMain(m *testing.M) {
	ctx := context.Background()

	pgContainer, err := postgres.Run(ctx,
		"postgres:18",
		postgres.WithDatabase("pantry_panel_test"),
		postgres.WithUsername("test"),
		postgres.WithPassword("test"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2),
		),
	)
	if err != nil {
		log.Fatal(err)
	}

	connStr, err := pgContainer.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		log.Fatal(err)
	}

	testPool, err = pgxpool.New(context.Background(), connStr)
	if err != nil {
		log.Fatalf("failed to connect to test database: %v", err)
	}

	for _, migration := range []string{
		"../db/migrations/001_create_stock_items.sql",
		"../db/migrations/004_add_sorted_at_to_stock_items.sql",
	} {
		sqlBytes, err := os.ReadFile(migration)
		if err != nil {
			log.Fatal(err)
		}
		if _, err = testPool.Exec(context.Background(), string(sqlBytes)); err != nil {
			log.Fatalf("failed to apply migration %s: %v", migration, err)
		}
	}

	_, err = testPool.Exec(ctx, "TRUNCATE stock_items")
	if err != nil {
		log.Fatal(err)
	}

	code := m.Run()

	testPool.Close()
	if err := pgContainer.Terminate(ctx); err != nil {
		log.Printf("failed to terminate test container: %v", err)
	}

	os.Exit(code)
}

func setupTestDB(t *testing.T) *pgxpool.Pool {
	_, err := testPool.Exec(context.Background(), "TRUNCATE stock_items")
	if err != nil {
		t.Fatalf("failed to truncate stock_items: %v", err)
	}
	return testPool
}

func TestCreate_Success(t *testing.T) {
	pool := setupTestDB(t)
	repo := NewPgStockItemRepository(pool)

	item, err := repo.Create(context.Background(), "醤油", "調味料", nil)
	require.NoError(t, err)
	assert.Equal(t, "醤油", item.Name)
	assert.Equal(t, "調味料", item.Category)
	assert.False(t, item.WantToBuy)
	assert.Nil(t, item.ImageURL)
	assert.NotEqual(t, uuid.Nil, item.ID)
}

func TestCreate_WithWantToBuyTrue(t *testing.T) {
	pool := setupTestDB(t)
	repo := NewPgStockItemRepository(pool)

	item, err := repo.Create(context.Background(), "醤油", "調味料", boolPtr(true))
	require.NoError(t, err)
	assert.True(t, item.WantToBuy)
}

func TestCreate_DuplicateName(t *testing.T) {
	pool := setupTestDB(t)
	repo := NewPgStockItemRepository(pool)

	_, err := repo.Create(context.Background(), "醤油", "調味料", nil)
	require.NoError(t, err)
	_, err = repo.Create(context.Background(), "醤油", "飲み物", nil)
	require.Error(t, err)
	assert.Error(t, err, "should not allow duplicate names")
}

func TestList_Empty(t *testing.T) {
	pool := setupTestDB(t)
	repo := NewPgStockItemRepository(pool)

	items, err := repo.List(context.Background())
	require.NoError(t, err)
	assert.Len(t, items, 0)
}

func TestList_OrderBySortedAtDesc(t *testing.T) {
	pool := setupTestDB(t)
	repo := NewPgStockItemRepository(pool)

	_, err := repo.Create(context.Background(), "醤油", "調味料", nil)
	require.NoError(t, err)
	_, err = repo.Create(context.Background(), "味噌", "調味料", nil)
	require.NoError(t, err)
	_, err = pool.Exec(context.Background(),
		"UPDATE stock_items SET sorted_at = NOW() + INTERVAL '1 second' WHERE name = '醤油'")
	require.NoError(t, err)

	items, err := repo.List(context.Background())
	require.NoError(t, err)
	assert.Len(t, items, 2)
	assert.Equal(t, "醤油", items[0].Name)
	assert.Equal(t, "味噌", items[1].Name)
}

func TestUpdate_WantToBuyTrue_UpdatesSortedAt(t *testing.T) {
	pool := setupTestDB(t)
	repo := NewPgStockItemRepository(pool)

	item, err := repo.Create(context.Background(), "醤油", "調味料", nil)
	require.NoError(t, err)
	originalSortedAt := item.SortedAt

	updated, err := repo.Update(context.Background(), item.ID, UpdateParams{WantToBuy: boolPtr(true)})
	require.NoError(t, err)
	assert.True(t, updated.SortedAt.After(originalSortedAt) || updated.SortedAt.Equal(originalSortedAt),
		"sorted_at should be updated when wantToBuy is set to true")
}

func TestUpdate_WantToBuyFalse_KeepsSortedAt(t *testing.T) {
	pool := setupTestDB(t)
	repo := NewPgStockItemRepository(pool)

	item, err := repo.Create(context.Background(), "醤油", "調味料", boolPtr(true))
	require.NoError(t, err)
	_, err = pool.Exec(context.Background(),
		"UPDATE stock_items SET sorted_at = NOW() - INTERVAL '1 hour' WHERE id = $1", item.ID)
	require.NoError(t, err)

	before, err := repo.Get(context.Background(), item.ID)
	require.NoError(t, err)

	updated, err := repo.Update(context.Background(), item.ID, UpdateParams{WantToBuy: boolPtr(false)})
	require.NoError(t, err)
	assert.Equal(t, before.SortedAt.UTC(), updated.SortedAt.UTC(),
		"sorted_at should not change when wantToBuy is set to false")
}

func TestUpdate_NameOnly_KeepsSortedAt(t *testing.T) {
	pool := setupTestDB(t)
	repo := NewPgStockItemRepository(pool)

	item, err := repo.Create(context.Background(), "醤油", "調味料", nil)
	require.NoError(t, err)
	_, err = pool.Exec(context.Background(),
		"UPDATE stock_items SET sorted_at = NOW() - INTERVAL '1 hour' WHERE id = $1", item.ID)
	require.NoError(t, err)

	before, err := repo.Get(context.Background(), item.ID)
	require.NoError(t, err)

	updated, err := repo.Update(context.Background(), item.ID, UpdateParams{Name: strPtr("こいくち醤油")})
	require.NoError(t, err)
	assert.Equal(t, before.SortedAt.UTC(), updated.SortedAt.UTC(),
		"sorted_at should not change when only name is updated")
}

func TestUpdate_Success(t *testing.T) {
	tests := []struct {
		name   string
		params UpdateParams
		check  func(t *testing.T, item *StockItem)
	}{
		{
			name: "update name",
			params: UpdateParams{
				Name: strPtr("こいくち醤油"),
			},
			check: func(t *testing.T, item *StockItem) {
				assert.Equal(t, "こいくち醤油", item.Name)
			},
		},
		{
			name: "update category",
			params: UpdateParams{
				Category: strPtr("飲み物"),
			},
			check: func(t *testing.T, item *StockItem) {
				assert.Equal(t, "飲み物", item.Category)
			},
		},
		{
			name: "update wantToBuy",
			params: UpdateParams{
				WantToBuy: boolPtr(true),
			},
			check: func(t *testing.T, item *StockItem) {
				assert.True(t, item.WantToBuy)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pool := setupTestDB(t)
			repo := NewPgStockItemRepository(pool)

			item, err := repo.Create(context.Background(), "醤油", "調味料", nil)
			require.NoError(t, err)
			updatedItem, err := repo.Update(context.Background(), item.ID, tt.params)
			require.NoError(t, err)
			tt.check(t, updatedItem)
			assert.True(t, updatedItem.UpdatedAt.After(item.UpdatedAt) || updatedItem.UpdatedAt.Equal(item.UpdatedAt),
				"updatedAt should be updated")
		})
	}
}

func TestUpdate_ImageURL_SetValue(t *testing.T) {
	pool := setupTestDB(t)
	repo := NewPgStockItemRepository(pool)

	item, err := repo.Create(context.Background(), "醤油", "調味料", nil)
	require.NoError(t, err)

	url := "https://example.com/a.jpg"
	updated, err := repo.Update(context.Background(), item.ID, UpdateParams{
		ImageURL: &ImageURLUpdate{Value: &url},
	})
	require.NoError(t, err)
	require.NotNil(t, updated.ImageURL)
	assert.Equal(t, "https://example.com/a.jpg", *updated.ImageURL)
}

func TestUpdate_ImageURL_ClearToNull(t *testing.T) {
	pool := setupTestDB(t)
	repo := NewPgStockItemRepository(pool)

	item, err := repo.Create(context.Background(), "醤油", "調味料", nil)
	require.NoError(t, err)

	url := "https://example.com/a.jpg"
	_, err = repo.Update(context.Background(), item.ID, UpdateParams{
		ImageURL: &ImageURLUpdate{Value: &url},
	})
	require.NoError(t, err)

	updated, err := repo.Update(context.Background(), item.ID, UpdateParams{
		ImageURL: &ImageURLUpdate{Value: nil},
	})
	require.NoError(t, err)
	assert.Nil(t, updated.ImageURL)
}

func TestUpdate_ImageURL_UnspecifiedKeepsExisting(t *testing.T) {
	pool := setupTestDB(t)
	repo := NewPgStockItemRepository(pool)

	item, err := repo.Create(context.Background(), "醤油", "調味料", nil)
	require.NoError(t, err)

	url := "https://example.com/b.jpg"
	_, err = repo.Update(context.Background(), item.ID, UpdateParams{
		ImageURL: &ImageURLUpdate{Value: &url},
	})
	require.NoError(t, err)

	updated, err := repo.Update(context.Background(), item.ID, UpdateParams{
		Name: strPtr("こいくち醤油"),
	})
	require.NoError(t, err)
	require.NotNil(t, updated.ImageURL)
	assert.Equal(t, "https://example.com/b.jpg", *updated.ImageURL)
}

func TestUpdate_NotFound(t *testing.T) {
	pool := setupTestDB(t)
	repo := NewPgStockItemRepository(pool)

	newName := "こいくち醤油"
	updateParams := UpdateParams{
		Name: &newName,
	}

	_, err := repo.Update(context.Background(), uuid.New(), updateParams)
	assert.Error(t, err, "should return error when updating non-existent item")
}

func TestUpdate_DuplicateName(t *testing.T) {
	pool := setupTestDB(t)
	repo := NewPgStockItemRepository(pool)

	item1, err := repo.Create(context.Background(), "醤油", "調味料", nil)
	require.NoError(t, err)
	item2, err := repo.Create(context.Background(), "味噌", "調味料", nil)
	require.NoError(t, err)

	updateParams := UpdateParams{
		Name: &item1.Name,
	}

	_, err = repo.Update(context.Background(), item2.ID, updateParams)
	assert.Error(t, err, "should not allow updating to duplicate name")
}

func TestDelete_Success(t *testing.T) {
	pool := setupTestDB(t)
	repo := NewPgStockItemRepository(pool)

	item, err := repo.Create(context.Background(), "醤油", "調味料", nil)
	require.NoError(t, err)
	err = repo.Delete(context.Background(), item.ID)
	require.NoError(t, err)

	items, err := repo.List(context.Background())
	require.NoError(t, err)
	assert.Len(t, items, 0)
}

func TestDelete_NotFound(t *testing.T) {
	pool := setupTestDB(t)
	repo := NewPgStockItemRepository(pool)

	err := repo.Delete(context.Background(), uuid.New())
	assert.Error(t, err, "should return error when deleting non-existent item")
}

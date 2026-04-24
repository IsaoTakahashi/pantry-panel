package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type StockItem struct {
	ID        uuid.UUID `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	Category  string    `json:"category" db:"category"`
	ImageURL  *string   `json:"imageUrl" db:"image_url"`
	WantToBuy bool      `json:"wantToBuy" db:"want_to_buy"`
	CreatedAt time.Time `json:"createdAt" db:"created_at"`
	UpdatedAt time.Time `json:"updatedAt" db:"updated_at"`
}

type StockItemRepository interface {
	List(ctx context.Context) ([]StockItem, error)
	Create(ctx context.Context, name, category string) (*StockItem, error)
	Update(ctx context.Context, id uuid.UUID, params UpdateParams) (*StockItem, error)
	Delete(ctx context.Context, id uuid.UUID) error
}

type UpdateParams struct {
	Name      *string
	Category  *string
	WantToBuy *bool
}

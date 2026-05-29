package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/IsaoTakahashi/pantry-panel/backend/middleware"
	"github.com/IsaoTakahashi/pantry-panel/backend/repository"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/labstack/echo/v5"
)

type mockStockItemRepo struct {
	listFn   func(ctx context.Context, groupID uuid.UUID) ([]repository.StockItem, error)
	getFn    func(ctx context.Context, id uuid.UUID, groupID uuid.UUID) (*repository.StockItem, error)
	createFn func(ctx context.Context, groupID uuid.UUID, name, category string, wantToBuy *bool, sourceURL *string) (*repository.StockItem, error)
	updateFn func(ctx context.Context, id uuid.UUID, groupID uuid.UUID, params repository.UpdateParams) (*repository.StockItem, error)
	deleteFn func(ctx context.Context, id uuid.UUID, groupID uuid.UUID) error
}

func (m *mockStockItemRepo) List(ctx context.Context, groupID uuid.UUID) ([]repository.StockItem, error) {
	return m.listFn(ctx, groupID)
}
func (m *mockStockItemRepo) Get(ctx context.Context, id uuid.UUID, groupID uuid.UUID) (*repository.StockItem, error) {
	return m.getFn(ctx, id, groupID)
}
func (m *mockStockItemRepo) Create(ctx context.Context, groupID uuid.UUID, name, category string, wantToBuy *bool, sourceURL *string) (*repository.StockItem, error) {
	return m.createFn(ctx, groupID, name, category, wantToBuy, sourceURL)
}
func (m *mockStockItemRepo) Update(ctx context.Context, id uuid.UUID, groupID uuid.UUID, params repository.UpdateParams) (*repository.StockItem, error) {
	return m.updateFn(ctx, id, groupID, params)
}
func (m *mockStockItemRepo) Delete(ctx context.Context, id uuid.UUID, groupID uuid.UUID) error {
	return m.deleteFn(ctx, id, groupID)
}

// setupRouterWithAuth creates a router that injects the given AuthInfo via middleware.
func setupRouterWithAuth(h *StockItemHandler, authInfo *middleware.AuthInfo) *echo.Echo {
	e := echo.New()
	injectAuth := func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			middleware.SetAuthInfo(c, authInfo)
			return next(c)
		}
	}
	e.Use(injectAuth)
	e.GET("/api/stock-items", h.List)
	e.POST("/api/stock-items", h.Create)
	e.PATCH("/api/stock-items/:id", h.Update)
	e.DELETE("/api/stock-items/:id", h.Delete)
	return e
}

func TestList(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		now := time.Now()
		testGroupID := uuid.New()
		items := []repository.StockItem{
			{ID: uuid.New(), Name: "醤油", Category: "調味料", WantToBuy: false, GroupID: testGroupID, CreatedAt: now, UpdatedAt: now},
			{ID: uuid.New(), Name: "味噌", Category: "調味料", WantToBuy: true, GroupID: testGroupID, CreatedAt: now, UpdatedAt: now},
		}
		mock := &mockStockItemRepo{
			listFn: func(_ context.Context, groupID uuid.UUID) ([]repository.StockItem, error) {
				assert.Equal(t, testGroupID, groupID)
				return items, nil
			},
		}
		h := NewStockItemHandler(mock)
		e := setupRouterWithAuth(h, &middleware.AuthInfo{UserID: uuid.New(), GroupID: testGroupID, Role: "owner"})

		req := httptest.NewRequest(http.MethodGet, "/api/stock-items", nil)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var body []repository.StockItem
		err := json.NewDecoder(rec.Body).Decode(&body)
		require.NoError(t, err)
		assert.Len(t, body, 2)
		assert.Equal(t, "醤油", body[0].Name)
	})

	t.Run("empty_list", func(t *testing.T) {
		testGroupID := uuid.New()
		mock := &mockStockItemRepo{
			listFn: func(_ context.Context, _ uuid.UUID) ([]repository.StockItem, error) {
				return []repository.StockItem{}, nil
			},
		}
		h := NewStockItemHandler(mock)
		e := setupRouterWithAuth(h, &middleware.AuthInfo{UserID: uuid.New(), GroupID: testGroupID, Role: "owner"})

		req := httptest.NewRequest(http.MethodGet, "/api/stock-items", nil)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var body []repository.StockItem
		err := json.NewDecoder(rec.Body).Decode(&body)
		require.NoError(t, err)
		assert.Len(t, body, 0)
	})

	t.Run("repo_error", func(t *testing.T) {
		testGroupID := uuid.New()
		mock := &mockStockItemRepo{
			listFn: func(_ context.Context, _ uuid.UUID) ([]repository.StockItem, error) {
				return nil, errors.New("repository error")
			},
		}
		h := NewStockItemHandler(mock)
		e := setupRouterWithAuth(h, &middleware.AuthInfo{UserID: uuid.New(), GroupID: testGroupID, Role: "owner"})

		req := httptest.NewRequest(http.MethodGet, "/api/stock-items", nil)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusInternalServerError, rec.Code)
	})
}

func TestCreate(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		now := time.Now()
		testGroupID := uuid.New()
		expected := &repository.StockItem{
			ID:        uuid.New(),
			Name:      "醤油",
			Category:  "調味料",
			WantToBuy: false,
			GroupID:   testGroupID,
			CreatedAt: now,
			UpdatedAt: now,
		}
		mock := &mockStockItemRepo{
			createFn: func(_ context.Context, groupID uuid.UUID, name, category string, _ *bool, _ *string) (*repository.StockItem, error) {
				assert.Equal(t, testGroupID, groupID)
				assert.Equal(t, "醤油", name)
				assert.Equal(t, "調味料", category)
				return expected, nil
			},
		}
		h := NewStockItemHandler(mock)
		e := setupRouterWithAuth(h, &middleware.AuthInfo{UserID: uuid.New(), GroupID: testGroupID, Role: "owner"})

		reqBody := strings.NewReader(`{"name": "醤油", "category": "調味料"}`)
		req := httptest.NewRequest(http.MethodPost, "/api/stock-items", reqBody)
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusCreated, rec.Code)

		var body repository.StockItem
		err := json.NewDecoder(rec.Body).Decode(&body)
		require.NoError(t, err)
		assert.Equal(t, expected.ID, body.ID)
		assert.Equal(t, expected.Name, body.Name)
		assert.Equal(t, expected.Category, body.Category)
		assert.Equal(t, expected.WantToBuy, body.WantToBuy)
	})

	t.Run("with_want_to_buy_true", func(t *testing.T) {
		now := time.Now()
		testGroupID := uuid.New()
		expected := &repository.StockItem{
			ID:        uuid.New(),
			Name:      "醤油",
			Category:  "調味料",
			WantToBuy: true,
			GroupID:   testGroupID,
			CreatedAt: now,
			UpdatedAt: now,
		}
		mock := &mockStockItemRepo{
			createFn: func(_ context.Context, _ uuid.UUID, _, _ string, wantToBuy *bool, _ *string) (*repository.StockItem, error) {
				require.NotNil(t, wantToBuy)
				assert.True(t, *wantToBuy)
				return expected, nil
			},
		}
		h := NewStockItemHandler(mock)
		e := setupRouterWithAuth(h, &middleware.AuthInfo{UserID: uuid.New(), GroupID: testGroupID, Role: "owner"})

		reqBody := strings.NewReader(`{"name": "醤油", "category": "調味料", "wantToBuy": true}`)
		req := httptest.NewRequest(http.MethodPost, "/api/stock-items", reqBody)
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusCreated, rec.Code)

		var body repository.StockItem
		err := json.NewDecoder(rec.Body).Decode(&body)
		require.NoError(t, err)
		assert.True(t, body.WantToBuy)
	})

	t.Run("empty_name", func(t *testing.T) {
		testGroupID := uuid.New()
		mock := &mockStockItemRepo{
			createFn: func(_ context.Context, _ uuid.UUID, _, _ string, _ *bool, _ *string) (*repository.StockItem, error) {
				return nil, nil
			},
		}
		h := NewStockItemHandler(mock)
		e := setupRouterWithAuth(h, &middleware.AuthInfo{UserID: uuid.New(), GroupID: testGroupID, Role: "owner"})

		reqBody := strings.NewReader(`{"name": "", "category": "調味料"}`)
		req := httptest.NewRequest(http.MethodPost, "/api/stock-items", reqBody)
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("empty_category", func(t *testing.T) {
		testGroupID := uuid.New()
		mock := &mockStockItemRepo{
			createFn: func(_ context.Context, _ uuid.UUID, _, _ string, _ *bool, _ *string) (*repository.StockItem, error) {
				return nil, nil
			},
		}
		h := NewStockItemHandler(mock)
		e := setupRouterWithAuth(h, &middleware.AuthInfo{UserID: uuid.New(), GroupID: testGroupID, Role: "owner"})

		reqBody := strings.NewReader(`{"name": "醤油", "category": ""}`)
		req := httptest.NewRequest(http.MethodPost, "/api/stock-items", reqBody)
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("duplicate_name", func(t *testing.T) {
		testGroupID := uuid.New()
		mock := &mockStockItemRepo{
			createFn: func(_ context.Context, _ uuid.UUID, _, _ string, _ *bool, _ *string) (*repository.StockItem, error) {
				return nil, &pgconn.PgError{Code: "23505"}
			},
		}
		h := NewStockItemHandler(mock)
		e := setupRouterWithAuth(h, &middleware.AuthInfo{UserID: uuid.New(), GroupID: testGroupID, Role: "owner"})

		reqBody := strings.NewReader(`{"name": "醤油", "category": "調味料"}`)
		req := httptest.NewRequest(http.MethodPost, "/api/stock-items", reqBody)
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusConflict, rec.Code)
	})
}

func TestUpdate(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		now := time.Now()
		testGroupID := uuid.New()
		expected := &repository.StockItem{
			ID:        uuid.New(),
			Name:      "こいくち醤油",
			Category:  "飲み物",
			WantToBuy: true,
			GroupID:   testGroupID,
			CreatedAt: now,
			UpdatedAt: now,
		}
		mock := &mockStockItemRepo{
			updateFn: func(_ context.Context, id uuid.UUID, groupID uuid.UUID, params repository.UpdateParams) (*repository.StockItem, error) {
				assert.Equal(t, expected.ID, id)
				assert.Equal(t, testGroupID, groupID)
				assert.Equal(t, "こいくち醤油", *params.Name)
				assert.Equal(t, "飲み物", *params.Category)
				assert.Equal(t, true, *params.WantToBuy)
				return expected, nil
			},
		}
		h := NewStockItemHandler(mock)
		e := setupRouterWithAuth(h, &middleware.AuthInfo{UserID: uuid.New(), GroupID: testGroupID, Role: "owner"})

		reqBody := strings.NewReader(`{"name": "こいくち醤油", "category": "飲み物", "wantToBuy": true}`)
		req := httptest.NewRequest(http.MethodPatch, "/api/stock-items/"+expected.ID.String(), reqBody)
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var body repository.StockItem
		err := json.NewDecoder(rec.Body).Decode(&body)
		require.NoError(t, err)
		assert.Equal(t, expected.ID, body.ID)
		assert.Equal(t, expected.Name, body.Name)
		assert.Equal(t, expected.Category, body.Category)
		assert.Equal(t, expected.WantToBuy, body.WantToBuy)
	})

	t.Run("image_url_set_value", func(t *testing.T) {
		now := time.Now()
		id := uuid.New()
		testGroupID := uuid.New()
		var captured repository.UpdateParams
		mock := &mockStockItemRepo{
			updateFn: func(_ context.Context, gotID uuid.UUID, _ uuid.UUID, params repository.UpdateParams) (*repository.StockItem, error) {
				captured = params
				url := "https://example.com/a.jpg"
				return &repository.StockItem{ID: gotID, Name: "醤油", Category: "調味料", GroupID: testGroupID, ImageURL: &url, CreatedAt: now, UpdatedAt: now}, nil
			},
		}
		h := NewStockItemHandler(mock)
		e := setupRouterWithAuth(h, &middleware.AuthInfo{UserID: uuid.New(), GroupID: testGroupID, Role: "owner"})

		reqBody := strings.NewReader(`{"imageUrl": "https://example.com/a.jpg"}`)
		req := httptest.NewRequest(http.MethodPatch, "/api/stock-items/"+id.String(), reqBody)
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		require.NotNil(t, captured.ImageURL)
		require.NotNil(t, captured.ImageURL.Value)
		assert.Equal(t, "https://example.com/a.jpg", *captured.ImageURL.Value)
	})

	t.Run("image_url_explicit_null", func(t *testing.T) {
		now := time.Now()
		id := uuid.New()
		testGroupID := uuid.New()
		var captured repository.UpdateParams
		mock := &mockStockItemRepo{
			updateFn: func(_ context.Context, gotID uuid.UUID, _ uuid.UUID, params repository.UpdateParams) (*repository.StockItem, error) {
				captured = params
				return &repository.StockItem{ID: gotID, Name: "醤油", Category: "調味料", GroupID: testGroupID, ImageURL: nil, CreatedAt: now, UpdatedAt: now}, nil
			},
		}
		h := NewStockItemHandler(mock)
		e := setupRouterWithAuth(h, &middleware.AuthInfo{UserID: uuid.New(), GroupID: testGroupID, Role: "owner"})

		reqBody := strings.NewReader(`{"imageUrl": null}`)
		req := httptest.NewRequest(http.MethodPatch, "/api/stock-items/"+id.String(), reqBody)
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		require.NotNil(t, captured.ImageURL, "ImageURL patch wrapper should be non-nil when null is explicit")
		assert.Nil(t, captured.ImageURL.Value, "Value should be nil to indicate NULL")
	})

	t.Run("image_url_unspecified", func(t *testing.T) {
		now := time.Now()
		id := uuid.New()
		testGroupID := uuid.New()
		var captured repository.UpdateParams
		mock := &mockStockItemRepo{
			updateFn: func(_ context.Context, gotID uuid.UUID, _ uuid.UUID, params repository.UpdateParams) (*repository.StockItem, error) {
				captured = params
				return &repository.StockItem{ID: gotID, Name: "x", Category: "★", GroupID: testGroupID, CreatedAt: now, UpdatedAt: now}, nil
			},
		}
		h := NewStockItemHandler(mock)
		e := setupRouterWithAuth(h, &middleware.AuthInfo{UserID: uuid.New(), GroupID: testGroupID, Role: "owner"})

		reqBody := strings.NewReader(`{"name": "x"}`)
		req := httptest.NewRequest(http.MethodPatch, "/api/stock-items/"+id.String(), reqBody)
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Nil(t, captured.ImageURL, "ImageURL patch wrapper should be nil when field is absent")
	})

	t.Run("image_url_invalid_type", func(t *testing.T) {
		testGroupID := uuid.New()
		mock := &mockStockItemRepo{
			updateFn: func(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ repository.UpdateParams) (*repository.StockItem, error) {
				t.Fatal("repo.Update should not be called on invalid imageUrl")
				return nil, nil
			},
		}
		h := NewStockItemHandler(mock)
		e := setupRouterWithAuth(h, &middleware.AuthInfo{UserID: uuid.New(), GroupID: testGroupID, Role: "owner"})

		reqBody := strings.NewReader(`{"imageUrl": 123}`)
		req := httptest.NewRequest(http.MethodPatch, "/api/stock-items/"+uuid.New().String(), reqBody)
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("invalid_id", func(t *testing.T) {
		testGroupID := uuid.New()
		mock := &mockStockItemRepo{
			updateFn: func(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ repository.UpdateParams) (*repository.StockItem, error) {
				return nil, nil
			},
		}
		h := NewStockItemHandler(mock)
		e := setupRouterWithAuth(h, &middleware.AuthInfo{UserID: uuid.New(), GroupID: testGroupID, Role: "owner"})

		reqBody := strings.NewReader(`{"name": "こいくち醤油", "category": "飲み物", "wantToBuy": true}`)
		req := httptest.NewRequest(http.MethodPatch, "/api/stock-items/invalid-uuid", reqBody)
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("not_found", func(t *testing.T) {
		testGroupID := uuid.New()
		mock := &mockStockItemRepo{
			updateFn: func(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ repository.UpdateParams) (*repository.StockItem, error) {
				return nil, pgx.ErrNoRows
			},
		}
		h := NewStockItemHandler(mock)
		e := setupRouterWithAuth(h, &middleware.AuthInfo{UserID: uuid.New(), GroupID: testGroupID, Role: "owner"})

		reqBody := strings.NewReader(`{"name": "こいくち醤油", "category": "飲み物", "wantToBuy": true}`)
		req := httptest.NewRequest(http.MethodPatch, "/api/stock-items/"+uuid.New().String(), reqBody)
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("duplicate_name", func(t *testing.T) {
		testGroupID := uuid.New()
		mock := &mockStockItemRepo{
			updateFn: func(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ repository.UpdateParams) (*repository.StockItem, error) {
				return nil, &pgconn.PgError{Code: "23505"}
			},
		}
		h := NewStockItemHandler(mock)
		e := setupRouterWithAuth(h, &middleware.AuthInfo{UserID: uuid.New(), GroupID: testGroupID, Role: "owner"})

		reqBody := strings.NewReader(`{"name": "こいくち醤油", "category": "飲み物", "wantToBuy": true}`)
		req := httptest.NewRequest(http.MethodPatch, "/api/stock-items/"+uuid.New().String(), reqBody)
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusConflict, rec.Code)
	})
}

func TestDelete(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		testGroupID := uuid.New()
		mock := &mockStockItemRepo{
			getFn: func(_ context.Context, id uuid.UUID, groupID uuid.UUID) (*repository.StockItem, error) {
				assert.Equal(t, testGroupID, groupID)
				return &repository.StockItem{
					ID:        id,
					Name:      "醤油",
					Category:  "調味料",
					WantToBuy: false,
					GroupID:   testGroupID,
				}, nil
			},
			deleteFn: func(_ context.Context, _ uuid.UUID, groupID uuid.UUID) error {
				assert.Equal(t, testGroupID, groupID)
				return nil
			},
		}
		h := NewStockItemHandler(mock)
		e := setupRouterWithAuth(h, &middleware.AuthInfo{UserID: uuid.New(), GroupID: testGroupID, Role: "owner"})

		id := uuid.New()
		req := httptest.NewRequest(http.MethodDelete, "/api/stock-items/"+id.String(), nil)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("invalid_id", func(t *testing.T) {
		testGroupID := uuid.New()
		mock := &mockStockItemRepo{
			deleteFn: func(_ context.Context, _ uuid.UUID, _ uuid.UUID) error {
				return nil
			},
		}
		h := NewStockItemHandler(mock)
		e := setupRouterWithAuth(h, &middleware.AuthInfo{UserID: uuid.New(), GroupID: testGroupID, Role: "owner"})

		req := httptest.NewRequest(http.MethodDelete, "/api/stock-items/invalid-uuid", nil)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("not_found", func(t *testing.T) {
		testGroupID := uuid.New()
		mock := &mockStockItemRepo{
			getFn: func(_ context.Context, _ uuid.UUID, _ uuid.UUID) (*repository.StockItem, error) {
				return nil, pgx.ErrNoRows
			},
		}
		h := NewStockItemHandler(mock)
		e := setupRouterWithAuth(h, &middleware.AuthInfo{UserID: uuid.New(), GroupID: testGroupID, Role: "owner"})

		id := uuid.New()
		req := httptest.NewRequest(http.MethodDelete, "/api/stock-items/"+id.String(), nil)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("want_to_buy_true", func(t *testing.T) {
		testGroupID := uuid.New()
		mock := &mockStockItemRepo{
			getFn: func(_ context.Context, id uuid.UUID, _ uuid.UUID) (*repository.StockItem, error) {
				return &repository.StockItem{
					ID:        id,
					Name:      "醤油",
					Category:  "調味料",
					WantToBuy: true,
					GroupID:   testGroupID,
				}, nil
			},
		}
		h := NewStockItemHandler(mock)
		e := setupRouterWithAuth(h, &middleware.AuthInfo{UserID: uuid.New(), GroupID: testGroupID, Role: "owner"})

		id := uuid.New()
		req := httptest.NewRequest(http.MethodDelete, "/api/stock-items/"+id.String(), nil)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusConflict, rec.Code)
	})
}

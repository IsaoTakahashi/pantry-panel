package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/IsaoTakahashi/pantry-panel/backend/apierror"
	"github.com/IsaoTakahashi/pantry-panel/backend/middleware"
	"github.com/IsaoTakahashi/pantry-panel/backend/repository"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/labstack/echo/v5"
)

// CreateStockItemRequest is the request body for creating a stock item.
type CreateStockItemRequest struct {
	Name      string  `json:"name"`
	Category  string  `json:"category"`
	WantToBuy *bool   `json:"wantToBuy"`
	SourceURL *string `json:"sourceUrl"`
}

// UpdateStockItemRequest is the request body for updating a stock item.
type UpdateStockItemRequest struct {
	Name      *string         `json:"name"`
	Category  *string         `json:"category"`
	WantToBuy *bool           `json:"wantToBuy"`
	ImageURL  json.RawMessage `json:"imageUrl"`
}

// StockItemHandler handles stock item CRUD endpoints.
type StockItemHandler struct {
	repo repository.StockItemRepository
}

// NewStockItemHandler creates a new StockItemHandler backed by the given repository.
func NewStockItemHandler(repo repository.StockItemRepository) *StockItemHandler {
	return &StockItemHandler{repo: repo}
}

// List handles GET /api/stock-items.
func (h *StockItemHandler) List(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, apierror.ErrorResponse{Message: "Unauthorized"})
	}
	items, err := h.repo.List(c.Request().Context(), authInfo.GroupID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, apierror.ErrorResponse{Message: "Internal Server Error"})
	}
	return c.JSON(http.StatusOK, items)
}

// Create handles POST /api/stock-items.
func (h *StockItemHandler) Create(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, apierror.ErrorResponse{Message: "Unauthorized"})
	}

	var req CreateStockItemRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, apierror.ErrorResponse{Message: "Invalid request body"})
	}

	if req.Name == "" || req.Category == "" {
		return c.JSON(http.StatusBadRequest, apierror.ErrorResponse{Message: "Name and category are required"})
	}

	item, err := h.repo.Create(c.Request().Context(), authInfo.GroupID, req.Name, req.Category, req.WantToBuy, req.SourceURL)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return c.JSON(http.StatusConflict, apierror.ErrorResponse{Message: "Stock item with the same name already exists"})
		}
		return c.JSON(http.StatusInternalServerError, apierror.ErrorResponse{Message: "Internal Server Error"})
	}

	return c.JSON(http.StatusCreated, item)
}

// Update handles PATCH /api/stock-items/:id.
func (h *StockItemHandler) Update(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, apierror.ErrorResponse{Message: "Unauthorized"})
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, apierror.ErrorResponse{Message: "Invalid ID"})
	}

	var req UpdateStockItemRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, apierror.ErrorResponse{Message: "Invalid request body"})
	}

	imageURLPatch, err := parseImageURLPatch(req.ImageURL)
	if err != nil {
		return c.JSON(http.StatusBadRequest, apierror.ErrorResponse{Message: "Invalid imageUrl"})
	}

	params := repository.UpdateParams{
		Name:      req.Name,
		Category:  req.Category,
		WantToBuy: req.WantToBuy,
		ImageURL:  imageURLPatch,
	}

	item, err := h.repo.Update(c.Request().Context(), id, authInfo.GroupID, params)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return c.JSON(http.StatusConflict, apierror.ErrorResponse{Message: "Stock item with the same name already exists"})
		}
		if errors.Is(err, pgx.ErrNoRows) {
			return c.JSON(http.StatusNotFound, apierror.ErrorResponse{Message: "Stock item not found"})
		}
		return c.JSON(http.StatusInternalServerError, apierror.ErrorResponse{Message: "Internal Server Error"})
	}

	return c.JSON(http.StatusOK, item)
}

// parseImageURLPatch interprets the raw JSON value of `imageUrl` in PATCH requests:
//   - absent (zero-length): returns nil, meaning "do not change image_url"
//   - JSON null: returns &ImageURLUpdate{Value: nil}, meaning "set image_url to NULL"
//   - JSON string: returns &ImageURLUpdate{Value: &s}, meaning "set image_url to s"
//   - other JSON types (number, bool, etc.): returns error for HTTP 400
func parseImageURLPatch(raw json.RawMessage) (*repository.ImageURLUpdate, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	if bytes.Equal(raw, []byte("null")) {
		return &repository.ImageURLUpdate{Value: nil}, nil
	}
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil, err
	}
	return &repository.ImageURLUpdate{Value: &s}, nil
}

// Delete handles DELETE /api/stock-items/:id.
func (h *StockItemHandler) Delete(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, apierror.ErrorResponse{Message: "Unauthorized"})
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, apierror.ErrorResponse{Message: "Invalid ID"})
	}

	item, err := h.repo.Get(c.Request().Context(), id, authInfo.GroupID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.JSON(http.StatusNotFound, apierror.ErrorResponse{Message: "Stock item not found"})
		}
		return c.JSON(http.StatusInternalServerError, apierror.ErrorResponse{Message: "Internal Server Error"})
	}

	if item.WantToBuy {
		return c.JSON(http.StatusConflict, apierror.ErrorResponse{Message: "Cannot delete item that is marked as want to buy"})
	}

	err = h.repo.Delete(c.Request().Context(), id, authInfo.GroupID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, apierror.ErrorResponse{Message: "Internal Server Error"})
	}

	return c.NoContent(http.StatusNoContent)
}

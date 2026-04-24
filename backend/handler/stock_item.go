package handler

import (
	"errors"
	"net/http"

	"github.com/IsaoTakahashi/pantry-panel/backend/repository"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/labstack/echo/v5"
)

type CreateStockItemRequest struct {
	Name     string `json:"name"`
	Category string `json:"category"`
}

type UpdateStockItemRequest struct {
	Name      *string `json:"name"`
	Category  *string `json:"category"`
	WantToBuy *bool   `json:"wantToBuy"`
}

type ErrorResponse struct {
	Message string `json:"message"`
}

type StockItemHandler struct {
	repo repository.StockItemRepository
}

func NewStockItemHandler(repo repository.StockItemRepository) *StockItemHandler {
	return &StockItemHandler{repo: repo}
}

func (h *StockItemHandler) List(c *echo.Context) error {
	items, err := h.repo.List(c.Request().Context())
	if err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorResponse{Message: "Internal Server Error"})
	}

	return c.JSON(http.StatusOK, items)
}

func (h *StockItemHandler) Create(c *echo.Context) error {
	var req CreateStockItemRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, ErrorResponse{Message: "Invalid request body"})
	}

	if req.Name == "" || req.Category == "" {
		return c.JSON(http.StatusBadRequest, ErrorResponse{Message: "Name and category are required"})
	}

	item, err := h.repo.Create(c.Request().Context(), req.Name, req.Category)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return c.JSON(http.StatusConflict, ErrorResponse{Message: "Stock item with the same name already exists"})
		}
		return c.JSON(http.StatusInternalServerError, ErrorResponse{Message: "Internal Server Error"})
	}

	return c.JSON(http.StatusCreated, item)
}

func (h *StockItemHandler) Update(c *echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, ErrorResponse{Message: "Invalid ID"})
	}

	var req UpdateStockItemRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, ErrorResponse{Message: "Invalid request body"})
	}

	params := repository.UpdateParams{
		Name:      req.Name,
		Category:  req.Category,
		WantToBuy: req.WantToBuy,
	}

	item, err := h.repo.Update(c.Request().Context(), id, params)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return c.JSON(http.StatusConflict, ErrorResponse{Message: "Stock item with the same name already exists"})
		}
		if errors.Is(err, pgx.ErrNoRows) {
			return c.JSON(http.StatusNotFound, ErrorResponse{Message: "Stock item not found"})
		}
		return c.JSON(http.StatusInternalServerError, ErrorResponse{Message: "Internal Server Error"})
	}

	return c.JSON(http.StatusOK, item)
}

func (h *StockItemHandler) Delete(c *echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, ErrorResponse{Message: "Invalid ID"})
	}

	item, err := h.repo.Get(c.Request().Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.JSON(http.StatusNotFound, ErrorResponse{Message: "Stock item not found"})
		}
		return c.JSON(http.StatusInternalServerError, ErrorResponse{Message: "Internal Server Error"})
	}

	if item.WantToBuy {
		return c.JSON(http.StatusConflict, ErrorResponse{Message: "Cannot delete item that is marked as want to buy"})
	}

	err = h.repo.Delete(c.Request().Context(), id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorResponse{Message: "Internal Server Error"})
	}

	return c.NoContent(http.StatusNoContent)
}

package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/IsaoTakahashi/pantry-panel/backend/apierror"
	"github.com/IsaoTakahashi/pantry-panel/backend/imagesearch"
	"github.com/labstack/echo/v5"
)

type ImageSearchHandler struct {
	client imagesearch.Client
}

func NewImageSearchHandler(client imagesearch.Client) *ImageSearchHandler {
	return &ImageSearchHandler{client: client}
}

type ImageSearchResponse struct {
	Items []imagesearch.Result `json:"items"`
}

func (h *ImageSearchHandler) Search(c *echo.Context) error {
	if h.client == nil {
		return c.JSON(http.StatusServiceUnavailable, apierror.ErrorResponse{Message: "image search is not configured"})
	}

	q := c.QueryParam("q")
	if q == "" {
		return c.JSON(http.StatusBadRequest, apierror.ErrorResponse{Message: "query parameter 'q' is required"})
	}

	num := 10
	if n := c.QueryParam("num"); n != "" {
		if parsed, err := strconv.Atoi(n); err == nil && parsed > 0 && parsed <= 10 {
			num = parsed
		}
	}

	results, err := h.client.Search(c.Request().Context(), q, num)
	if err != nil {
		if errors.Is(err, imagesearch.ErrQuotaExceeded) {
			return c.JSON(http.StatusTooManyRequests, apierror.ErrorResponse{Message: "quota exceeded"})
		}
		return c.JSON(http.StatusBadGateway, apierror.ErrorResponse{Message: "image search failed"})
	}

	return c.JSON(http.StatusOK, ImageSearchResponse{Items: results})
}

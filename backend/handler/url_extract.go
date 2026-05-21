package handler

import (
	"errors"
	"net/http"

	"github.com/IsaoTakahashi/pantry-panel/backend/urlextract"
	"github.com/labstack/echo/v5"
)

type UrlExtractHandler struct {
	extractor urlextract.Extractor
}

func NewUrlExtractHandler(extractor urlextract.Extractor) *UrlExtractHandler {
	return &UrlExtractHandler{extractor: extractor}
}

type ExtractFromURLRequest struct {
	URL string `json:"url"`
}

type ExtractFromURLResponse struct {
	Name     string  `json:"name"`
	ImageURL *string `json:"imageUrl"` // null when empty
}

func (h *UrlExtractHandler) Extract(c *echo.Context) error {
	var req ExtractFromURLRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, ErrorResponse{Message: "Invalid request body"})
	}

	if req.URL == "" {
		return c.JSON(http.StatusBadRequest, ErrorResponse{Message: "url is required"})
	}

	result, err := h.extractor.Extract(c.Request().Context(), req.URL)
	if err != nil {
		if errors.Is(err, urlextract.ErrFetchFailed) {
			return c.JSON(http.StatusBadGateway, ErrorResponse{Message: "failed to fetch the target page"})
		}
		if errors.Is(err, urlextract.ErrExtractionFailed) {
			return c.JSON(http.StatusUnprocessableEntity, ErrorResponse{Message: "could not extract product name from page"})
		}
		return c.JSON(http.StatusInternalServerError, ErrorResponse{Message: "Internal Server Error"})
	}

	resp := ExtractFromURLResponse{
		Name: result.Name,
	}
	if result.ImageURL != "" {
		resp.ImageURL = &result.ImageURL
	}

	return c.JSON(http.StatusOK, resp)
}

package handler

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/IsaoTakahashi/pantry-panel/backend/apierror"
	"github.com/IsaoTakahashi/pantry-panel/backend/urlextract"
	"github.com/labstack/echo/v5"
)

// URLExtractHandler handles URL product extraction endpoints.
type URLExtractHandler struct {
	extractor urlextract.Extractor
}

// NewURLExtractHandler creates a new URLExtractHandler backed by the given extractor.
func NewURLExtractHandler(extractor urlextract.Extractor) *URLExtractHandler {
	return &URLExtractHandler{extractor: extractor}
}

// ExtractFromURLRequest is the request body for extracting product info from a URL.
type ExtractFromURLRequest struct {
	URL string `json:"url"`
}

// ExtractFromURLResponse is the response body for URL extraction results.
type ExtractFromURLResponse struct {
	Name           string   `json:"name"`
	ImageURL       *string  `json:"imageUrl"` // null when empty
	NameCandidates []string `json:"nameCandidates,omitempty"`
}

// Extract handles POST /api/extract-from-url.
func (h *URLExtractHandler) Extract(c *echo.Context) error {
	var req ExtractFromURLRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, apierror.ErrorResponse{Message: "Invalid request body"})
	}

	if req.URL == "" {
		return c.JSON(http.StatusBadRequest, apierror.ErrorResponse{Message: "url is required"})
	}

	slog.Info("extract-from-url", "url", req.URL)

	result, err := h.extractor.Extract(c.Request().Context(), req.URL)
	if err != nil {
		if errors.Is(err, urlextract.ErrFetchFailed) {
			slog.Error("extract-from-url fetch failed", "url", req.URL, "error", err)
			return c.JSON(http.StatusBadGateway, apierror.ErrorResponse{Message: "failed to fetch the target page", Detail: err.Error()})
		}
		if errors.Is(err, urlextract.ErrExtractionFailed) {
			slog.Error("extract-from-url extraction failed", "url", req.URL, "error", err)
			return c.JSON(http.StatusUnprocessableEntity, apierror.ErrorResponse{Message: "could not extract product name from page", Detail: err.Error()})
		}
		slog.Error("extract-from-url internal error", "url", req.URL, "error", err)
		return c.JSON(http.StatusInternalServerError, apierror.ErrorResponse{Message: "Internal Server Error"})
	}

	slog.Info("extract-from-url success", "url", req.URL, "name", result.Name, "hasImage", result.ImageURL != "")

	resp := ExtractFromURLResponse{
		Name:           result.Name,
		NameCandidates: result.NameCandidates,
	}
	if result.ImageURL != "" {
		resp.ImageURL = &result.ImageURL
	}

	return c.JSON(http.StatusOK, resp)
}

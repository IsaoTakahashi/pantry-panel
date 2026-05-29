package handler

import (
	"errors"
	"log"
	"net/http"

	"github.com/IsaoTakahashi/pantry-panel/backend/apierror"
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
	Name           string   `json:"name"`
	ImageURL       *string  `json:"imageUrl"`           // null when empty
	NameCandidates []string `json:"nameCandidates,omitempty"`
}

func (h *UrlExtractHandler) Extract(c *echo.Context) error {
	var req ExtractFromURLRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, apierror.ErrorResponse{Message: "Invalid request body"})
	}

	if req.URL == "" {
		return c.JSON(http.StatusBadRequest, apierror.ErrorResponse{Message: "url is required"})
	}

	log.Printf("extract-from-url: url=%s", req.URL)

	result, err := h.extractor.Extract(c.Request().Context(), req.URL)
	if err != nil {
		if errors.Is(err, urlextract.ErrFetchFailed) {
			log.Printf("extract-from-url: fetch failed url=%s err=%v", req.URL, err)
			return c.JSON(http.StatusBadGateway, apierror.ErrorResponse{Message: "failed to fetch the target page", Detail: err.Error()})
		}
		if errors.Is(err, urlextract.ErrExtractionFailed) {
			log.Printf("extract-from-url: extraction failed url=%s err=%v", req.URL, err)
			return c.JSON(http.StatusUnprocessableEntity, apierror.ErrorResponse{Message: "could not extract product name from page", Detail: err.Error()})
		}
		log.Printf("extract-from-url: internal error url=%s err=%v", req.URL, err)
		return c.JSON(http.StatusInternalServerError, apierror.ErrorResponse{Message: "Internal Server Error"})
	}

	log.Printf("extract-from-url: success url=%s name=%q hasImage=%v", req.URL, result.Name, result.ImageURL != "")

	resp := ExtractFromURLResponse{
		Name:           result.Name,
		NameCandidates: result.NameCandidates,
	}
	if result.ImageURL != "" {
		resp.ImageURL = &result.ImageURL
	}

	return c.JSON(http.StatusOK, resp)
}

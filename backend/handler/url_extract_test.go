package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/IsaoTakahashi/pantry-panel/backend/urlextract"
	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockExtractor struct {
	result urlextract.Result
	err    error
}

func (m *mockExtractor) Extract(_ context.Context, _ string) (urlextract.Result, error) {
	return m.result, m.err
}

func setupUrlExtractRouter(h *UrlExtractHandler) *echo.Echo {
	e := echo.New()
	e.POST("/api/extract-from-url", h.Extract)
	return e
}

func postExtractFromURL(e *echo.Echo, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/extract-from-url", strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec
}

func TestUrlExtract_200_withImage(t *testing.T) {
	imageURL := "https://example.com/img.jpg"
	h := NewUrlExtractHandler(&mockExtractor{
		result: urlextract.Result{Name: "牛乳", ImageURL: imageURL},
	})
	e := setupUrlExtractRouter(h)

	rec := postExtractFromURL(e, `{"url":"https://example.com/product"}`)

	require.Equal(t, http.StatusOK, rec.Code)
	var resp ExtractFromURLResponse
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
	assert.Equal(t, "牛乳", resp.Name)
	require.NotNil(t, resp.ImageURL)
	assert.Equal(t, imageURL, *resp.ImageURL)
}

func TestUrlExtract_200_noImage(t *testing.T) {
	h := NewUrlExtractHandler(&mockExtractor{
		result: urlextract.Result{Name: "牛乳", ImageURL: ""},
	})
	e := setupUrlExtractRouter(h)

	rec := postExtractFromURL(e, `{"url":"https://example.com/product"}`)

	require.Equal(t, http.StatusOK, rec.Code)
	var resp ExtractFromURLResponse
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
	assert.Equal(t, "牛乳", resp.Name)
	assert.Nil(t, resp.ImageURL)
}

func TestUrlExtract_400_emptyBody(t *testing.T) {
	h := NewUrlExtractHandler(&mockExtractor{})
	e := setupUrlExtractRouter(h)

	rec := postExtractFromURL(e, ``)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestUrlExtract_400_emptyURL(t *testing.T) {
	h := NewUrlExtractHandler(&mockExtractor{})
	e := setupUrlExtractRouter(h)

	rec := postExtractFromURL(e, `{"url":""}`)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestUrlExtract_422_extractionFailed(t *testing.T) {
	h := NewUrlExtractHandler(&mockExtractor{err: urlextract.ErrExtractionFailed})
	e := setupUrlExtractRouter(h)

	rec := postExtractFromURL(e, `{"url":"https://example.com/product"}`)

	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
}

func TestUrlExtract_502_fetchFailed(t *testing.T) {
	h := NewUrlExtractHandler(&mockExtractor{err: urlextract.ErrFetchFailed})
	e := setupUrlExtractRouter(h)

	rec := postExtractFromURL(e, `{"url":"https://example.com/product"}`)

	assert.Equal(t, http.StatusBadGateway, rec.Code)
}

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

func setupURLExtractRouter(h *URLExtractHandler) *echo.Echo {
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

func TestUrlExtract(t *testing.T) {
	t.Run("200_with_image", func(t *testing.T) {
		imageURL := "https://example.com/img.jpg"
		h := NewURLExtractHandler(&mockExtractor{
			result: urlextract.Result{Name: "牛乳", ImageURL: imageURL},
		})
		e := setupURLExtractRouter(h)

		rec := postExtractFromURL(e, `{"url":"https://example.com/product"}`)

		require.Equal(t, http.StatusOK, rec.Code)
		var resp ExtractFromURLResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
		assert.Equal(t, "牛乳", resp.Name)
		require.NotNil(t, resp.ImageURL)
		assert.Equal(t, imageURL, *resp.ImageURL)
	})

	t.Run("200_no_image", func(t *testing.T) {
		h := NewURLExtractHandler(&mockExtractor{
			result: urlextract.Result{Name: "牛乳", ImageURL: ""},
		})
		e := setupURLExtractRouter(h)

		rec := postExtractFromURL(e, `{"url":"https://example.com/product"}`)

		require.Equal(t, http.StatusOK, rec.Code)
		var resp ExtractFromURLResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
		assert.Equal(t, "牛乳", resp.Name)
		assert.Nil(t, resp.ImageURL)
	})

	t.Run("200_with_candidates", func(t *testing.T) {
		h := NewURLExtractHandler(&mockExtractor{
			result: urlextract.Result{
				Name:           "長い商品名テストサンプル二十五文字以上",
				ImageURL:       "https://example.com/img.jpg",
				NameCandidates: []string{"候補A", "候補B"},
			},
		})
		e := setupURLExtractRouter(h)

		rec := postExtractFromURL(e, `{"url":"https://example.com/product"}`)

		require.Equal(t, http.StatusOK, rec.Code)
		var resp ExtractFromURLResponse
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
		assert.Equal(t, []string{"候補A", "候補B"}, resp.NameCandidates)
	})

	t.Run("200_no_candidates", func(t *testing.T) {
		h := NewURLExtractHandler(&mockExtractor{
			result: urlextract.Result{Name: "牛乳", ImageURL: ""},
		})
		e := setupURLExtractRouter(h)

		rec := postExtractFromURL(e, `{"url":"https://example.com/product"}`)

		require.Equal(t, http.StatusOK, rec.Code)
		var raw map[string]any
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&raw))
		_, present := raw["nameCandidates"]
		assert.False(t, present, "nameCandidates key must be absent from JSON when there are no candidates")
	})

	t.Run("400_empty_body", func(t *testing.T) {
		h := NewURLExtractHandler(&mockExtractor{})
		e := setupURLExtractRouter(h)

		rec := postExtractFromURL(e, ``)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("400_empty_url", func(t *testing.T) {
		h := NewURLExtractHandler(&mockExtractor{})
		e := setupURLExtractRouter(h)

		rec := postExtractFromURL(e, `{"url":""}`)

		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("422_extraction_failed", func(t *testing.T) {
		h := NewURLExtractHandler(&mockExtractor{err: urlextract.ErrExtractionFailed})
		e := setupURLExtractRouter(h)

		rec := postExtractFromURL(e, `{"url":"https://example.com/product"}`)

		assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	})

	t.Run("502_fetch_failed", func(t *testing.T) {
		h := NewURLExtractHandler(&mockExtractor{err: urlextract.ErrFetchFailed})
		e := setupURLExtractRouter(h)

		rec := postExtractFromURL(e, `{"url":"https://example.com/product"}`)

		assert.Equal(t, http.StatusBadGateway, rec.Code)
	})
}

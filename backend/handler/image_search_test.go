package handler

import (
	"context"
	"errors"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/IsaoTakahashi/pantry-panel/backend/imagesearch"
	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubImageClient struct {
	results []imagesearch.Result
	err     error
}

func (s *stubImageClient) Search(_ context.Context, _ string, _ int) ([]imagesearch.Result, error) {
	return s.results, s.err
}

func setupImageSearchRouter(h *ImageSearchHandler) *echo.Echo {
	e := echo.New()
	e.GET("/api/image-search", h.Search)
	return e
}

func TestImageSearch_Success(t *testing.T) {
	h := NewImageSearchHandler(&stubImageClient{
		results: []imagesearch.Result{
			{ImageURL: "https://x/a.jpg", ThumbnailURL: "https://x/a-t.jpg", Title: "A"},
		},
	})
	e := setupImageSearchRouter(h)

	req := httptest.NewRequest(http.MethodGet, "/api/image-search?q=apple", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var body ImageSearchResponse
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&body))
	require.Len(t, body.Items, 1)
	assert.Equal(t, "https://x/a.jpg", body.Items[0].ImageURL)
}

func TestImageSearch_MissingQuery(t *testing.T) {
	h := NewImageSearchHandler(&stubImageClient{})
	e := setupImageSearchRouter(h)

	req := httptest.NewRequest(http.MethodGet, "/api/image-search", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestImageSearch_QuotaExceeded(t *testing.T) {
	h := NewImageSearchHandler(&stubImageClient{err: imagesearch.ErrQuotaExceeded})
	e := setupImageSearchRouter(h)

	req := httptest.NewRequest(http.MethodGet, "/api/image-search?q=x", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusTooManyRequests, rec.Code)
}

func TestImageSearch_UpstreamFailure(t *testing.T) {
	h := NewImageSearchHandler(&stubImageClient{err: errors.New("boom")})
	e := setupImageSearchRouter(h)

	req := httptest.NewRequest(http.MethodGet, "/api/image-search?q=x", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusBadGateway, rec.Code)
}

func TestImageSearch_NilClient_ReturnsServiceUnavailable(t *testing.T) {
	h := NewImageSearchHandler(nil)
	e := setupImageSearchRouter(h)

	req := httptest.NewRequest(http.MethodGet, "/api/image-search?q=x", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)
	assert.True(t, strings.Contains(rec.Body.String(), "not configured"))
}

func TestImageSearch_NumParamRespected(t *testing.T) {
	called := false
	stub := &stubNumCapture{}
	h := NewImageSearchHandler(stub)
	e := setupImageSearchRouter(h)

	req := httptest.NewRequest(http.MethodGet, "/api/image-search?q=x&num=3", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	called = stub.calledWithNum != 0
	assert.True(t, called)
	assert.Equal(t, 3, stub.calledWithNum)
}

type stubNumCapture struct {
	calledWithNum int
}

func (s *stubNumCapture) Search(_ context.Context, _ string, num int) ([]imagesearch.Result, error) {
	s.calledWithNum = num
	return []imagesearch.Result{}, nil
}

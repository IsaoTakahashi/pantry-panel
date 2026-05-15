package imagesearch

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGoogleClient_Search_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		assert.Equal(t, "test-query", q.Get("q"))
		assert.Equal(t, "image", q.Get("searchType"))
		assert.Equal(t, "k", q.Get("key"))
		assert.Equal(t, "id", q.Get("cx"))
		assert.Equal(t, "5", q.Get("num"))

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{
			"items": [
				{"link": "https://x.com/a.jpg", "title": "Apple", "image": {"thumbnailLink": "https://x.com/a-thumb.jpg"}},
				{"link": "https://x.com/b.jpg", "title": "Banana", "image": {"thumbnailLink": "https://x.com/b-thumb.jpg"}}
			]
		}`))
	}))
	defer server.Close()

	c := &GoogleClient{HTTPClient: server.Client(), APIKey: "k", CSEID: "id", BaseURL: server.URL}
	results, err := c.Search(context.Background(), "test-query", 5)
	require.NoError(t, err)
	require.Len(t, results, 2)
	assert.Equal(t, "https://x.com/a.jpg", results[0].ImageURL)
	assert.Equal(t, "https://x.com/a-thumb.jpg", results[0].ThumbnailURL)
	assert.Equal(t, "Apple", results[0].Title)
}

func TestGoogleClient_Search_EmptyItems(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{}`))
	}))
	defer server.Close()

	c := &GoogleClient{HTTPClient: server.Client(), APIKey: "k", CSEID: "id", BaseURL: server.URL}
	results, err := c.Search(context.Background(), "q", 10)
	require.NoError(t, err)
	assert.Len(t, results, 0)
}

func TestGoogleClient_Search_NumDefaultedWhenZero(t *testing.T) {
	var capturedNum string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedNum = r.URL.Query().Get("num")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"items": []}`))
	}))
	defer server.Close()

	c := &GoogleClient{HTTPClient: server.Client(), APIKey: "k", CSEID: "id", BaseURL: server.URL}
	_, err := c.Search(context.Background(), "q", 0)
	require.NoError(t, err)
	assert.Equal(t, "10", capturedNum)
}

func TestGoogleClient_Search_NumClampedAboveTen(t *testing.T) {
	var capturedNum string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedNum = r.URL.Query().Get("num")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"items": []}`))
	}))
	defer server.Close()

	c := &GoogleClient{HTTPClient: server.Client(), APIKey: "k", CSEID: "id", BaseURL: server.URL}
	_, err := c.Search(context.Background(), "q", 99)
	require.NoError(t, err)
	assert.Equal(t, "10", capturedNum)
}

func TestGoogleClient_Search_QuotaExceeded(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error": {"code": 429, "message": "quota exceeded"}}`))
	}))
	defer server.Close()

	c := &GoogleClient{HTTPClient: server.Client(), APIKey: "k", CSEID: "id", BaseURL: server.URL}
	_, err := c.Search(context.Background(), "q", 5)
	assert.ErrorIs(t, err, ErrQuotaExceeded)
}

func TestGoogleClient_Search_UpstreamFailure_5xx(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	c := &GoogleClient{HTTPClient: server.Client(), APIKey: "k", CSEID: "id", BaseURL: server.URL}
	_, err := c.Search(context.Background(), "q", 5)
	assert.ErrorIs(t, err, ErrUpstreamFailure)
}

func TestGoogleClient_Search_InvalidJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`not json`))
	}))
	defer server.Close()

	c := &GoogleClient{HTTPClient: server.Client(), APIKey: "k", CSEID: "id", BaseURL: server.URL}
	_, err := c.Search(context.Background(), "q", 5)
	assert.ErrorIs(t, err, ErrUpstreamFailure)
}

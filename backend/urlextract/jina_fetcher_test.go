package urlextract

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestJinaFetcher(ts *httptest.Server) *JinaFetcher {
	return &JinaFetcher{
		HTTPClient: ts.Client(),
		BaseURL:    ts.URL + "/",
	}
}

func TestJinaFetcher_SuccessfulParse(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintln(w, `{
			"code": 200,
			"data": {
				"title": "商品名 | 楽天市場",
				"content": "# 商品名\nこれは商品の説明です。",
				"images": {
					"https://example.com/img1.jpg": "商品画像1",
					"https://example.com/img2.jpg": "商品画像2"
				}
			}
		}`)
	}))
	defer ts.Close()

	f := newTestJinaFetcher(ts)
	got, err := f.Fetch(context.Background(), "https://product.example.com/item/123")
	require.NoError(t, err)
	assert.Equal(t, "商品名 | 楽天市場", got.Title)
	assert.Contains(t, got.Content, "商品名")
	assert.Len(t, got.Images, 2)
	assert.Contains(t, got.Images, "https://example.com/img1.jpg")
}

func TestJinaFetcher_Non200Response_ReturnsErrFetchFailed(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "rate limited", http.StatusTooManyRequests)
	}))
	defer ts.Close()

	f := newTestJinaFetcher(ts)
	_, err := f.Fetch(context.Background(), "https://product.example.com/item/123")
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrFetchFailed))
}

func TestJinaFetcher_MalformedJSON_ReturnsErrFetchFailed(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintln(w, `{not valid json}`)
	}))
	defer ts.Close()

	f := newTestJinaFetcher(ts)
	_, err := f.Fetch(context.Background(), "https://product.example.com/item/123")
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrFetchFailed))
}

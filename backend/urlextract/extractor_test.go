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

// newTestExtractor builds a DefaultExtractor using the given httptest server's client.
// jina and claude may be nil.
func newTestExtractor(ts *httptest.Server, jina *JinaFetcher, claude *ClaudeExtractor) *DefaultExtractor {
	return NewDefaultExtractorWithDeps(
		&Fetcher{HTTPClient: ts.Client()},
		jina,
		claude,
	)
}

func TestDefaultExtractor_MetaTagsPresent(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = fmt.Fprintln(w, `<html><head>
			<meta property="og:title" content="テスト商品">
			<meta property="og:image" content="https://example.com/img.jpg">
		</head></html>`)
	}))
	defer ts.Close()

	e := newTestExtractor(ts, nil, nil)
	got, err := e.Extract(context.Background(), ts.URL)
	require.NoError(t, err)
	assert.Equal(t, "テスト商品", got.Name)
	assert.Equal(t, "https://example.com/img.jpg", got.ImageURL)
}

func TestDefaultExtractor_EmptyMetaAndNoClaude_ReturnsErrExtractionFailed(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = fmt.Fprintln(w, `<html><head><title>no og tags here</title></head></html>`)
	}))
	defer ts.Close()

	e := newTestExtractor(ts, nil, nil)
	_, err := e.Extract(context.Background(), ts.URL)
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrExtractionFailed))
}

// TestDefaultExtractor_FetchFails_ServerError verifies that a non-200 direct fetch
// triggers the Jina fallback. With nil jinaFetcher, it should return ErrFetchFailed.
func TestDefaultExtractor_FetchFails_ServerError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "internal server error", http.StatusInternalServerError)
	}))
	defer ts.Close()

	e := newTestExtractor(ts, nil, nil) // nil jina → fetch failure propagates as ErrFetchFailed
	_, err := e.Extract(context.Background(), ts.URL)
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrFetchFailed))
}

// TestDefaultExtractor_FetchFails_ServerClosed verifies that a connection failure
// triggers the Jina fallback. With nil jinaFetcher, it should return ErrFetchFailed.
func TestDefaultExtractor_FetchFails_ServerClosed(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = fmt.Fprintln(w, `<html></html>`)
	}))
	serverURL := ts.URL
	ts.Close() // close before the request is made

	e := newTestExtractor(ts, nil, nil) // nil jina → fetch failure propagates as ErrFetchFailed
	_, err := e.Extract(context.Background(), serverURL)
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrFetchFailed))
}

func TestDefaultExtractor_EmptyMetaWithClaudeNil_ReturnsErrExtractionFailed(t *testing.T) {
	// Explicitly test that when Claude is nil and meta extraction yields nothing,
	// we get ErrExtractionFailed (not a nil-pointer panic or other error).
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = fmt.Fprintln(w, `<html><body>Some page without product info</body></html>`)
	}))
	defer ts.Close()

	e := NewDefaultExtractorWithDeps(
		&Fetcher{HTTPClient: ts.Client()},
		nil,
		nil,
	)
	_, err := e.Extract(context.Background(), ts.URL)
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrExtractionFailed))
}

// TestDefaultExtractor_Step1FetchFails_JinaSucceeds verifies that when the direct fetch
// fails, the extractor falls back to Jina and returns the Jina title + first image.
func TestDefaultExtractor_Step1FetchFails_JinaSucceeds(t *testing.T) {
	// Direct fetch server: always returns 500
	directTS := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "blocked", http.StatusInternalServerError)
	}))
	defer directTS.Close()

	// Jina server: returns valid product data
	jinaTS := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintln(w, `{
			"code": 200,
			"data": {
				"title": "楽天商品名",
				"content": "商品の詳細説明",
				"images": {"https://cdn.example.com/product.jpg": "商品画像"}
			}
		}`)
	}))
	defer jinaTS.Close()

	jina := &JinaFetcher{
		HTTPClient: jinaTS.Client(),
		BaseURL:    jinaTS.URL + "/",
	}
	e := NewDefaultExtractorWithDeps(
		&Fetcher{HTTPClient: directTS.Client()},
		jina,
		nil,
	)
	got, err := e.Extract(context.Background(), directTS.URL)
	require.NoError(t, err)
	assert.Equal(t, "楽天商品名", got.Name)
	assert.Equal(t, "https://cdn.example.com/product.jpg", got.ImageURL)
}

// TestDefaultExtractor_Step1FetchFails_JinaFails verifies that when both direct fetch
// and Jina fail, ErrFetchFailed is returned.
func TestDefaultExtractor_Step1FetchFails_JinaFails(t *testing.T) {
	// Direct fetch server: returns 500
	directTS := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "blocked", http.StatusInternalServerError)
	}))
	defer directTS.Close()

	// Jina server: also fails
	jinaTS := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "jina unavailable", http.StatusServiceUnavailable)
	}))
	defer jinaTS.Close()

	jina := &JinaFetcher{
		HTTPClient: jinaTS.Client(),
		BaseURL:    jinaTS.URL + "/",
	}
	e := NewDefaultExtractorWithDeps(
		&Fetcher{HTTPClient: directTS.Client()},
		jina,
		nil,
	)
	_, err := e.Extract(context.Background(), directTS.URL)
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrFetchFailed))
}

// TestDefaultExtractor_Step1SucceedsButNoName_ReturnsErrExtractionFailed verifies that
// when the direct fetch succeeds but no product name is found, ErrExtractionFailed is
// returned without falling back to Jina.
func TestDefaultExtractor_Step1SucceedsButNoName_ReturnsErrExtractionFailed(t *testing.T) {
	// Jina server that should NOT be called (it returns a name — if called, test would pass
	// for the wrong reason; we track if it was called)
	jinaCallCount := 0
	jinaTS := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		jinaCallCount++
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintln(w, `{"code":200,"data":{"title":"Should not be used","content":"","images":{}}}`)
	}))
	defer jinaTS.Close()

	// Direct fetch server: returns a page with no product info
	directTS := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = fmt.Fprintln(w, `<html><body><p>No product here</p></body></html>`)
	}))
	defer directTS.Close()

	jina := &JinaFetcher{
		HTTPClient: jinaTS.Client(),
		BaseURL:    jinaTS.URL + "/",
	}
	e := NewDefaultExtractorWithDeps(
		&Fetcher{HTTPClient: directTS.Client()},
		jina,
		nil,
	)
	_, err := e.Extract(context.Background(), directTS.URL)
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrExtractionFailed))
	assert.Equal(t, 0, jinaCallCount, "Jina should not be called when Step 1 fetch succeeded")
}

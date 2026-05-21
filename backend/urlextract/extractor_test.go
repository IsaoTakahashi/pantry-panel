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

// newTestExtractor builds a DefaultExtractor that uses the given httptest server's client.
// claude is nil by default; pass a non-nil *ClaudeExtractor only when testing the Claude path.
func newTestExtractor(ts *httptest.Server, claude *ClaudeExtractor) *DefaultExtractor {
	return &DefaultExtractor{
		fetcher: &Fetcher{HTTPClient: ts.Client()},
		claude:  claude,
	}
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

	e := newTestExtractor(ts, nil)
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

	e := newTestExtractor(ts, nil) // claude == nil
	_, err := e.Extract(context.Background(), ts.URL)
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrExtractionFailed))
}

func TestDefaultExtractor_FetchFails_ServerError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "internal server error", http.StatusInternalServerError)
	}))
	defer ts.Close()

	e := newTestExtractor(ts, nil)
	_, err := e.Extract(context.Background(), ts.URL)
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrFetchFailed))
}

func TestDefaultExtractor_FetchFails_ServerClosed(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = fmt.Fprintln(w,`<html></html>`)
	}))
	serverURL := ts.URL
	ts.Close() // close before the request is made

	e := newTestExtractor(ts, nil)
	_, err := e.Extract(context.Background(), serverURL)
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrFetchFailed))
}

func TestDefaultExtractor_EmptyMetaWithClaudeNil_ReturnsErrExtractionFailed(t *testing.T) {
	// Explicitly test that when Claude is nil and meta extraction yields nothing,
	// we get ErrExtractionFailed (not a nil-pointer panic or other error).
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = fmt.Fprintln(w,`<html><body>Some page without product info</body></html>`)
	}))
	defer ts.Close()

	e := &DefaultExtractor{
		fetcher: &Fetcher{HTTPClient: ts.Client()},
		claude:  nil,
	}
	_, err := e.Extract(context.Background(), ts.URL)
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrExtractionFailed))
}

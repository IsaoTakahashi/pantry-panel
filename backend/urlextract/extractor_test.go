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

// TestDefaultExtractor_EmptyMetaAndNoClaude_FallsBackToJina verifies that when the direct
// fetch succeeds but meta extraction yields nothing and Claude is nil, the extractor falls
// back to Jina. With nil jinaFetcher, ErrFetchFailed is returned.
func TestDefaultExtractor_EmptyMetaAndNoClaude_FallsBackToJina(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = fmt.Fprintln(w, `<html><head><title>no og tags here</title></head></html>`)
	}))
	defer ts.Close()

	e := newTestExtractor(ts, nil, nil) // nil jina → ErrFetchFailed from extractViaJina
	_, err := e.Extract(context.Background(), ts.URL)
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrFetchFailed))
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

// TestDefaultExtractor_EmptyMetaWithClaudeNil_FallsBackToJina verifies that when Claude is
// nil and meta extraction yields nothing, the extractor falls back to Jina. With nil
// jinaFetcher, ErrFetchFailed is returned (not a nil-pointer panic or other error).
func TestDefaultExtractor_EmptyMetaWithClaudeNil_FallsBackToJina(t *testing.T) {
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
	assert.True(t, errors.Is(err, ErrFetchFailed))
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

// TestDefaultExtractor_Step1SucceedsButNoMeta_FallsBackToJina verifies that when the direct
// fetch succeeds but meta extraction yields no product name, the extractor falls back to Jina.
func TestDefaultExtractor_Step1SucceedsButNoMeta_FallsBackToJina(t *testing.T) {
	jinaCallCount := 0
	jinaTS := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		jinaCallCount++
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintln(w, `{"code":200,"data":{"title":"Jina商品名","content":"商品説明","images":{"https://cdn.example.com/p.jpg":"商品画像"}}}`)
	}))
	defer jinaTS.Close()

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
	got, err := e.Extract(context.Background(), directTS.URL)
	require.NoError(t, err)
	assert.Equal(t, "Jina商品名", got.Name)
	assert.Equal(t, 1, jinaCallCount, "Jina should be called as fallback")
}

// newStubExtractor builds a DefaultExtractor that uses a stub ClaudeExtractor returning a fixed Result.
func newStubExtractor(directTS *httptest.Server, jina *JinaFetcher, claudeResult Result) *DefaultExtractor {
	fake := &ClaudeExtractor{extractFn: func(_ context.Context, _ string, _ Result) (Result, error) {
		return claudeResult, nil
	}}
	return NewDefaultExtractorWithDeps(
		&Fetcher{HTTPClient: directTS.Client()},
		jina,
		fake,
	)
}

// TestDefaultExtractor_Step1ClaudeLongName_GeneratesCandidates verifies that when Step 1
// Claude returns a name >= 25 runes, GenerateCandidates is called and NameCandidates is set.
// Jina should NOT be called when an image is already present.
func TestDefaultExtractor_Step1ClaudeLongName_GeneratesCandidates(t *testing.T) {
	jinaCallCount := 0
	jinaTS := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		jinaCallCount++
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintln(w, `{"code":200,"data":{"title":"短い商品名","content":"","images":{"https://cdn.example.com/p.jpg":"画像"}}}`)
	}))
	defer jinaTS.Close()

	directTS := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = fmt.Fprintln(w, `<html><head><meta property="og:title" content="長い商品名 | サイト名 - ブランド名 - カテゴリ名"></head></html>`)
	}))
	defer directTS.Close()

	longName := "これは25文字以上の長い商品タイトルですよ追加テキスト" // 26 runes
	wantCandidates := []string{"候補1", "候補2", "候補3"}
	fake := &ClaudeExtractor{
		extractFn: func(_ context.Context, _ string, _ Result) (Result, error) {
			return Result{Name: longName, ImageURL: "https://meta.example.com/img.jpg"}, nil
		},
		generateFn: func(_ context.Context, _ string) ([]string, error) {
			return wantCandidates, nil
		},
	}
	jina := &JinaFetcher{HTTPClient: jinaTS.Client(), BaseURL: jinaTS.URL + "/"}
	e := NewDefaultExtractorWithDeps(&Fetcher{HTTPClient: directTS.Client()}, jina, fake)

	got, err := e.Extract(context.Background(), directTS.URL)
	require.NoError(t, err)
	assert.Equal(t, longName, got.Name, "original long name is preserved")
	assert.Equal(t, wantCandidates, got.NameCandidates, "candidates from GenerateCandidates should be set")
	assert.Equal(t, "https://meta.example.com/img.jpg", got.ImageURL)
	assert.Equal(t, 0, jinaCallCount, "Jina should NOT be called when image is already present")
}

// TestDefaultExtractor_Step1ClaudeNoImage_SupplementsFromJina verifies that when Step 1
// Claude returns no imageURL, the extractor also calls Jina to obtain an image.
func TestDefaultExtractor_Step1ClaudeNoImage_SupplementsFromJina(t *testing.T) {
	jinaCallCount := 0
	jinaTS := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		jinaCallCount++
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintln(w, `{"code":200,"data":{"title":"商品名","content":"","images":{"https://cdn.example.com/p.jpg":"画像"}}}`)
	}))
	defer jinaTS.Close()

	directTS := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = fmt.Fprintln(w, `<html><body>product page</body></html>`)
	}))
	defer directTS.Close()

	jina := &JinaFetcher{HTTPClient: jinaTS.Client(), BaseURL: jinaTS.URL + "/"}
	e := newStubExtractor(directTS, jina, Result{Name: "商品名", ImageURL: ""})

	got, err := e.Extract(context.Background(), directTS.URL)
	require.NoError(t, err)
	assert.Equal(t, "商品名", got.Name)
	assert.Equal(t, "https://cdn.example.com/p.jpg", got.ImageURL, "should use Jina's image")
	assert.Equal(t, 1, jinaCallCount, "Jina should be called to supplement")
}

// collectSteps records progress steps emitted by ExtractWithProgress.
func collectSteps(t *testing.T, e *DefaultExtractor, url string) []string {
	t.Helper()
	var steps []string
	_, err := e.ExtractWithProgress(context.Background(), url, func(step, _ string) {
		steps = append(steps, step)
	})
	_ = err
	return steps
}

// TestExtractWithProgress_NormalPath verifies that fetching and extracting steps are reported
// when the direct fetch succeeds and og:title is found (no Claude).
func TestExtractWithProgress_NormalPath(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = fmt.Fprintln(w, `<html><head>
			<meta property="og:title" content="テスト商品">
			<meta property="og:image" content="https://example.com/img.jpg">
		</head></html>`)
	}))
	defer ts.Close()

	e := newTestExtractor(ts, nil, nil)
	steps := collectSteps(t, e, ts.URL)

	assert.Contains(t, steps, "fetching")
}

// TestExtractWithProgress_FetchingJina verifies that fetching_jina is reported when step1 fails.
func TestExtractWithProgress_FetchingJina(t *testing.T) {
	directTS := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "blocked", http.StatusInternalServerError)
	}))
	defer directTS.Close()

	jinaTS := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintln(w, `{"code":200,"data":{"title":"Jina商品","content":"","images":{}}}`)
	}))
	defer jinaTS.Close()

	jina := &JinaFetcher{HTTPClient: jinaTS.Client(), BaseURL: jinaTS.URL + "/"}
	e := NewDefaultExtractorWithDeps(&Fetcher{HTTPClient: directTS.Client()}, jina, nil)
	steps := collectSteps(t, e, directTS.URL)

	assert.Equal(t, []string{"fetching", "fetching_jina"}, steps)
}

// TestExtractWithProgress_GeneratingCandidates verifies that generating_candidates is reported
// when the name from Claude is >= 25 runes.
func TestExtractWithProgress_GeneratingCandidates(t *testing.T) {
	directTS := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = fmt.Fprintln(w, `<html><body>product page</body></html>`)
	}))
	defer directTS.Close()

	jinaTS := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintln(w, `{"code":200,"data":{"title":"短い名前","content":"","images":{"https://img.example.com/p.jpg":"画像"}}}`)
	}))
	defer jinaTS.Close()

	longName := "これは25文字以上の長い商品タイトルですよ追加テキスト" // >= 25 runes
	fake := &ClaudeExtractor{
		extractFn: func(_ context.Context, _ string, _ Result) (Result, error) {
			return Result{Name: longName}, nil
		},
		generateFn: func(_ context.Context, _ string) ([]string, error) {
			return []string{"候補1"}, nil
		},
	}
	jina := &JinaFetcher{HTTPClient: jinaTS.Client(), BaseURL: jinaTS.URL + "/"}
	e := NewDefaultExtractorWithDeps(&Fetcher{HTTPClient: directTS.Client()}, jina, fake)
	steps := collectSteps(t, e, directTS.URL)

	assert.Contains(t, steps, "generating_candidates")
	assert.Contains(t, steps, "extracting")
}

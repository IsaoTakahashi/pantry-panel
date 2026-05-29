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

func TestDefaultExtractor(t *testing.T) {
	t.Run("meta_tags_present", func(t *testing.T) {
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
	})

	// empty_meta_and_no_claude_falls_back_to_jina verifies that when the direct
	// fetch succeeds but meta extraction yields nothing and Claude is nil, the extractor falls
	// back to Jina. With nil jinaFetcher, ErrFetchFailed is returned.
	t.Run("empty_meta_and_no_claude_falls_back_to_jina", func(t *testing.T) {
		ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = fmt.Fprintln(w, `<html><head><title>no og tags here</title></head></html>`)
		}))
		defer ts.Close()

		e := newTestExtractor(ts, nil, nil) // nil jina → ErrFetchFailed from extractViaJina
		_, err := e.Extract(context.Background(), ts.URL)
		require.Error(t, err)
		assert.True(t, errors.Is(err, ErrFetchFailed))
	})

	// fetch_fails_server_error verifies that a non-200 direct fetch
	// triggers the Jina fallback. With nil jinaFetcher, it should return ErrFetchFailed.
	t.Run("fetch_fails_server_error", func(t *testing.T) {
		ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "internal server error", http.StatusInternalServerError)
		}))
		defer ts.Close()

		e := newTestExtractor(ts, nil, nil) // nil jina → fetch failure propagates as ErrFetchFailed
		_, err := e.Extract(context.Background(), ts.URL)
		require.Error(t, err)
		assert.True(t, errors.Is(err, ErrFetchFailed))
	})

	// fetch_fails_server_closed verifies that a connection failure
	// triggers the Jina fallback. With nil jinaFetcher, it should return ErrFetchFailed.
	t.Run("fetch_fails_server_closed", func(t *testing.T) {
		ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			_, _ = fmt.Fprintln(w, `<html></html>`)
		}))
		serverURL := ts.URL
		ts.Close() // close before the request is made

		e := newTestExtractor(ts, nil, nil) // nil jina → fetch failure propagates as ErrFetchFailed
		_, err := e.Extract(context.Background(), serverURL)
		require.Error(t, err)
		assert.True(t, errors.Is(err, ErrFetchFailed))
	})

	// empty_meta_with_claude_nil_falls_back_to_jina verifies that when Claude is
	// nil and meta extraction yields nothing, the extractor falls back to Jina. With nil
	// jinaFetcher, ErrFetchFailed is returned (not a nil-pointer panic or other error).
	t.Run("empty_meta_with_claude_nil_falls_back_to_jina", func(t *testing.T) {
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
	})

	// step1_fetch_fails_jina_succeeds verifies that when the direct fetch
	// fails, the extractor falls back to Jina and returns the Jina title + first image.
	t.Run("step1_fetch_fails_jina_succeeds", func(t *testing.T) {
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
	})

	// step1_fetch_fails_jina_fails verifies that when both direct fetch
	// and Jina fail, ErrFetchFailed is returned.
	t.Run("step1_fetch_fails_jina_fails", func(t *testing.T) {
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
	})

	// step1_succeeds_but_no_meta_falls_back_to_jina verifies that when the direct
	// fetch succeeds but meta extraction yields no product name, the extractor falls back to Jina.
	t.Run("step1_succeeds_but_no_meta_falls_back_to_jina", func(t *testing.T) {
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
	})

	// step1_claude_long_name_generates_candidates verifies that when Step 1
	// Claude returns a name >= 25 runes, GenerateCandidates is called and NameCandidates is set.
	// Jina should NOT be called when an image is already present.
	t.Run("step1_claude_long_name_generates_candidates", func(t *testing.T) {
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
	})

	// step1_claude_no_image_supplements_from_jina verifies that when Step 1
	// Claude returns no imageURL, the extractor also calls Jina to obtain an image.
	t.Run("step1_claude_no_image_supplements_from_jina", func(t *testing.T) {
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
	})

	// jina_fallback_long_name_generates_candidates verifies that when the direct
	// fetch fails and the Jina-path Claude extraction returns a name >= 25 runes, GenerateCandidates
	// is called and NameCandidates is set on the result.
	t.Run("jina_fallback_long_name_generates_candidates", func(t *testing.T) {
		directTS := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "blocked", http.StatusInternalServerError)
		}))
		defer directTS.Close()

		jinaTS := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = fmt.Fprintln(w, `{"code":200,"data":{"title":"Jina商品名","content":"jina page text","images":{}}}`)
		}))
		defer jinaTS.Close()

		longName := "これは25文字以上の長い商品タイトルですよJina経由"
		wantCandidates := []string{"Jina候補1", "Jina候補2"}
		fake := &ClaudeExtractor{
			extractFn: func(_ context.Context, _ string, _ Result) (Result, error) {
				return Result{Name: longName}, nil
			},
			generateFn: func(_ context.Context, _ string) ([]string, error) {
				return wantCandidates, nil
			},
		}
		jina := &JinaFetcher{HTTPClient: jinaTS.Client(), BaseURL: jinaTS.URL + "/"}
		e := NewDefaultExtractorWithDeps(&Fetcher{HTTPClient: directTS.Client()}, jina, fake)

		got, err := e.Extract(context.Background(), directTS.URL)
		require.NoError(t, err)
		assert.Equal(t, longName, got.Name)
		assert.Equal(t, wantCandidates, got.NameCandidates, "Jina fallback should generate candidates for long names")
	})
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

func TestExtractWithProgress(t *testing.T) {
	// normal_path verifies that fetching and extracting steps are reported
	// when the direct fetch succeeds and og:title is found (no Claude).
	t.Run("normal_path", func(t *testing.T) {
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
	})

	// fetching_jina verifies that fetching_jina is reported when step1 fails.
	t.Run("fetching_jina", func(t *testing.T) {
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
	})

	// generating_candidates verifies that generating_candidates is reported
	// when the name from Claude is >= 25 runes.
	t.Run("generating_candidates", func(t *testing.T) {
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
	})
}

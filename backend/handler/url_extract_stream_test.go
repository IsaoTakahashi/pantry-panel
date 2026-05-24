package handler

import (
	"bufio"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/IsaoTakahashi/pantry-panel/backend/urlextract"
	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockProgressExtractor is a test double for progressExtractor.
type mockProgressExtractor struct {
	steps  []struct{ step, message string }
	result urlextract.Result
	err    error
}

func (m *mockProgressExtractor) ExtractWithProgress(_ context.Context, _ string, onProgress urlextract.ProgressFunc) (urlextract.Result, error) {
	for _, s := range m.steps {
		onProgress(s.step, s.message)
	}
	return m.result, m.err
}

func setupStreamRouter(h *UrlExtractStreamHandler) *echo.Echo {
	e := echo.New()
	e.POST("/api/extract-from-url/stream", h.ExtractStream)
	return e
}

func postExtractStream(e *echo.Echo, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/extract-from-url/stream", strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec
}

// parseSSELines returns the SSE event lines (event: and data: pairs) from a response body.
func parseSSEEvents(body string) []map[string]string {
	var events []map[string]string
	current := map[string]string{}
	scanner := bufio.NewScanner(strings.NewReader(body))
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			if len(current) > 0 {
				events = append(events, current)
				current = map[string]string{}
			}
			continue
		}
		if after, ok := strings.CutPrefix(line, "event: "); ok {
			current["event"] = after
		} else if after, ok := strings.CutPrefix(line, "data: "); ok {
			current["data"] = after
		}
	}
	return events
}

func TestExtractStream_NormalPath_ProgressThenDone(t *testing.T) {
	mock := &mockProgressExtractor{
		steps: []struct{ step, message string }{
			{"fetching", "ページを取得中..."},
			{"extracting", "商品情報を解析中..."},
		},
		result: urlextract.Result{Name: "テスト商品", ImageURL: "https://example.com/img.jpg"},
	}
	h := &UrlExtractStreamHandler{extractor: mock}
	e := setupStreamRouter(h)

	rec := postExtractStream(e, `{"url":"https://example.com/product"}`)

	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "text/event-stream", rec.Header().Get("Content-Type"))

	events := parseSSEEvents(rec.Body.String())
	require.GreaterOrEqual(t, len(events), 3, "expect at least 2 progress + 1 done")

	assert.Equal(t, "progress", events[0]["event"])
	assert.Contains(t, events[0]["data"], `"step":"fetching"`)

	assert.Equal(t, "progress", events[1]["event"])
	assert.Contains(t, events[1]["data"], `"step":"extracting"`)

	last := events[len(events)-1]
	assert.Equal(t, "done", last["event"])
	assert.Contains(t, last["data"], `"name":"テスト商品"`)
	assert.Contains(t, last["data"], `"imageUrl":"https://example.com/img.jpg"`)
}

func TestExtractStream_ErrorPath_ErrorEventNoDone(t *testing.T) {
	mock := &mockProgressExtractor{
		steps: []struct{ step, message string }{
			{"fetching", "ページを取得中..."},
		},
		err: fmt.Errorf("connection refused: %w", urlextract.ErrFetchFailed),
	}
	h := &UrlExtractStreamHandler{extractor: mock}
	e := setupStreamRouter(h)

	rec := postExtractStream(e, `{"url":"https://example.com/product"}`)

	require.Equal(t, http.StatusOK, rec.Code)
	events := parseSSEEvents(rec.Body.String())

	eventNames := make([]string, len(events))
	for i, ev := range events {
		eventNames[i] = ev["event"]
	}
	assert.Contains(t, eventNames, "error")
	assert.NotContains(t, eventNames, "done")

	var errEvent map[string]string
	for _, ev := range events {
		if ev["event"] == "error" {
			errEvent = ev
			break
		}
	}
	require.NotNil(t, errEvent)
	assert.Contains(t, errEvent["data"], `"kind":"fetchFailed"`)
}

func TestExtractStream_WithCandidates_DoneIncludesCandidates(t *testing.T) {
	mock := &mockProgressExtractor{
		result: urlextract.Result{
			Name:           "長い商品名テストサンプル二十五文字以上",
			ImageURL:       "",
			NameCandidates: []string{"候補1", "候補2", "候補3"},
		},
	}
	h := &UrlExtractStreamHandler{extractor: mock}
	e := setupStreamRouter(h)

	rec := postExtractStream(e, `{"url":"https://example.com/product"}`)

	require.Equal(t, http.StatusOK, rec.Code)
	events := parseSSEEvents(rec.Body.String())

	var doneEvent map[string]string
	for _, ev := range events {
		if ev["event"] == "done" {
			doneEvent = ev
			break
		}
	}
	require.NotNil(t, doneEvent, "done event must be present")
	assert.Contains(t, doneEvent["data"], `"nameCandidates"`)
	assert.Contains(t, doneEvent["data"], "候補1")
}

func TestExtractStream_WithoutCandidates_DoneOmitsCandidates(t *testing.T) {
	mock := &mockProgressExtractor{
		result: urlextract.Result{Name: "牛乳", ImageURL: ""},
	}
	h := &UrlExtractStreamHandler{extractor: mock}
	e := setupStreamRouter(h)

	rec := postExtractStream(e, `{"url":"https://example.com/product"}`)

	require.Equal(t, http.StatusOK, rec.Code)
	events := parseSSEEvents(rec.Body.String())

	var doneEvent map[string]string
	for _, ev := range events {
		if ev["event"] == "done" {
			doneEvent = ev
			break
		}
	}
	require.NotNil(t, doneEvent, "done event must be present")
	assert.NotContains(t, doneEvent["data"], `"nameCandidates"`)
}

func TestExtractStream_EmptyURL_Returns400(t *testing.T) {
	h := &UrlExtractStreamHandler{extractor: &mockProgressExtractor{}}
	e := setupStreamRouter(h)

	rec := postExtractStream(e, `{"url":""}`)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

package urlextract

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

const jinaTimeout = 20 * time.Second

// JinaFetcher fetches product data from the Jina AI reader API.
type JinaFetcher struct {
	HTTPClient *http.Client
	// BaseURL is the Jina reader base URL. Defaults to "https://r.jina.ai/".
	// Override in tests to point at an httptest server.
	BaseURL string
}

// NewJinaFetcher returns a JinaFetcher with a 20-second timeout.
func NewJinaFetcher() *JinaFetcher {
	return &JinaFetcher{
		HTTPClient: &http.Client{Timeout: jinaTimeout},
		BaseURL:    "https://r.jina.ai/",
	}
}

// JinaResult holds the parsed response from the Jina AI reader API.
type JinaResult struct {
	Title   string
	Content string            // Markdown text
	Images  map[string]string // imageURL -> altText
}

// Fetch calls the Jina AI reader API for rawURL and returns structured result.
// Returns ErrFetchFailed on non-200 response or JSON parse failure.
func (f *JinaFetcher) Fetch(ctx context.Context, rawURL string) (JinaResult, error) {
	jinaURL := f.BaseURL + rawURL

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, jinaURL, nil)
	if err != nil {
		return JinaResult{}, fmt.Errorf("%w: build jina request: %v", ErrFetchFailed, err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-With-Images-Summary", "true")
	if key := os.Getenv("JINA_API_KEY"); key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}

	resp, err := f.HTTPClient.Do(req)
	if err != nil {
		return JinaResult{}, fmt.Errorf("%w: %v", ErrFetchFailed, err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return JinaResult{}, fmt.Errorf("%w: jina status %d", ErrFetchFailed, resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 5<<20))
	if err != nil {
		return JinaResult{}, fmt.Errorf("%w: read jina body: %v", ErrFetchFailed, err)
	}

	// Jina JSON shape: {"code":200,"data":{"title":"...","content":"...","images":{"url":"alt",...}}}
	var payload struct {
		Data struct {
			Title   string            `json:"title"`
			Content string            `json:"content"`
			Images  map[string]string `json:"images"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return JinaResult{}, fmt.Errorf("%w: parse jina json: %v", ErrFetchFailed, err)
	}

	return JinaResult{
		Title:   payload.Data.Title,
		Content: payload.Data.Content,
		Images:  payload.Data.Images,
	}, nil
}

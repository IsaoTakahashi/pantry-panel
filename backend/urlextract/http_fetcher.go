package urlextract

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"
)

const defaultTimeout = 5 * time.Second

// Fetcher fetches the raw HTML bytes from a URL.
type Fetcher struct {
	HTTPClient *http.Client
}

// NewFetcher returns a Fetcher with a 5-second timeout.
func NewFetcher() *Fetcher {
	return &Fetcher{
		HTTPClient: &http.Client{
			Timeout: defaultTimeout,
		},
	}
}

// Fetch performs an HTTP GET on rawURL and returns the response body bytes.
// It wraps errors with ErrFetchFailed.
func (f *Fetcher) Fetch(ctx context.Context, rawURL string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, fmt.Errorf("%w: build request: %v", ErrFetchFailed, err)
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

	resp, err := f.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrFetchFailed, err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: status %d", ErrFetchFailed, resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 5<<20))
	if err != nil {
		return nil, fmt.Errorf("%w: read body: %v", ErrFetchFailed, err)
	}

	return body, nil
}

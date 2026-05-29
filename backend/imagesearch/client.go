package imagesearch

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
)

var (
	ErrQuotaExceeded   = errors.New("imagesearch: quota exceeded")
	ErrUpstreamFailure = errors.New("imagesearch: upstream failure")
)

type Result struct {
	ImageURL     string `json:"imageUrl"`
	ThumbnailURL string `json:"thumbnailUrl"`
	Title        string `json:"title"`
}

type Client interface {
	Search(ctx context.Context, query string, num int) ([]Result, error)
}

type GoogleClient struct {
	HTTPClient *http.Client
	APIKey     string
	CSEID      string
	BaseURL    string
}

func NewGoogleClient(apiKey, cseID string) *GoogleClient {
	return &GoogleClient{
		HTTPClient: http.DefaultClient,
		APIKey:     apiKey,
		CSEID:      cseID,
		BaseURL:    "https://www.googleapis.com/customsearch/v1",
	}
}

func (c *GoogleClient) Search(ctx context.Context, query string, num int) ([]Result, error) {
	if num <= 0 || num > 10 {
		num = 10
	}

	params := url.Values{}
	params.Set("key", c.APIKey)
	params.Set("cx", c.CSEID)
	params.Set("q", query)
	params.Set("searchType", "image")
	params.Set("num", strconv.Itoa(num))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"?"+params.Encode(), nil)
	if err != nil {
		return nil, fmt.Errorf("imagesearch: build request: %w", err)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUpstreamFailure, err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, ErrQuotaExceeded
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		slog.Error("imagesearch upstream error", "status", resp.StatusCode, "body", string(body))
		return nil, fmt.Errorf("%w: status %d", ErrUpstreamFailure, resp.StatusCode)
	}

	var body struct {
		Items []struct {
			Link  string `json:"link"`
			Title string `json:"title"`
			Image struct {
				ThumbnailLink string `json:"thumbnailLink"`
			} `json:"image"`
		} `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("%w: decode: %v", ErrUpstreamFailure, err)
	}

	results := make([]Result, 0, len(body.Items))
	for _, it := range body.Items {
		results = append(results, Result{
			ImageURL:     it.Link,
			ThumbnailURL: it.Image.ThumbnailLink,
			Title:        it.Title,
		})
	}
	return results, nil
}

package urlextract

import (
	"context"
	"errors"
	"strings"

	"golang.org/x/net/html"
)

var ErrFetchFailed = errors.New("urlextract: fetch failed")
var ErrExtractionFailed = errors.New("urlextract: extraction failed")

type Result struct {
	Name     string
	ImageURL string // empty if not found
}

type Extractor interface {
	Extract(ctx context.Context, rawURL string) (Result, error)
}

// DefaultExtractor extracts product metadata from a URL using:
//  1. HTTP fetch
//  2. HTML meta tags (og:title, og:image, schema.org JSON-LD)
//  3. Claude AI as a fallback (only if ANTHROPIC_API_KEY is configured)
type DefaultExtractor struct {
	fetcher *Fetcher
	claude  *ClaudeExtractor // may be nil if ANTHROPIC_API_KEY is not set
}

// NewDefaultExtractor creates a DefaultExtractor with all configured sub-extractors.
func NewDefaultExtractor() *DefaultExtractor {
	return &DefaultExtractor{
		fetcher: NewFetcher(),
		claude:  NewClaudeExtractor(),
	}
}

// Extract fetches the given URL and extracts product name and image URL.
// It tries HTML meta tags first, falls back to Claude if configured.
// Returns ErrFetchFailed if the URL cannot be fetched.
// Returns ErrExtractionFailed if no product name can be found by any method.
func (e *DefaultExtractor) Extract(ctx context.Context, rawURL string) (Result, error) {
	// Step 1: Fetch HTML
	htmlBytes, err := e.fetcher.Fetch(ctx, rawURL)
	if err != nil {
		return Result{}, err // ErrFetchFailed already wrapped by Fetcher
	}

	// Step 2: Parse meta tags (og:title, og:image, JSON-LD)
	result := ParseMeta(htmlBytes, rawURL)
	if result.Name != "" {
		return result, nil
	}

	// Step 3: Claude fallback (only if configured)
	if e.claude != nil {
		text := extractVisibleText(htmlBytes)
		result, err = e.claude.Extract(ctx, text)
		if err != nil {
			return Result{}, err
		}
		if result.Name != "" {
			return result, nil
		}
	}

	// Step 4: All methods exhausted
	return Result{}, ErrExtractionFailed
}

// extractVisibleText extracts human-readable text from HTML bytes by stripping tags.
// The result is suitable for sending to Claude to reduce token usage.
func extractVisibleText(htmlBytes []byte) string {
	doc, err := html.Parse(strings.NewReader(string(htmlBytes)))
	if err != nil {
		// Fall back to raw bytes as string if parse fails
		return string(htmlBytes)
	}

	var sb strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		// Skip script and style elements entirely
		if n.Type == html.ElementNode {
			tag := strings.ToLower(n.Data)
			if tag == "script" || tag == "style" || tag == "noscript" {
				return
			}
		}
		if n.Type == html.TextNode {
			text := strings.TrimSpace(n.Data)
			if text != "" {
				sb.WriteString(text)
				sb.WriteByte('\n')
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	return sb.String()
}

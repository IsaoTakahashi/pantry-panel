package urlextract

import (
	"context"
	"errors"
	"log"
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
//  1. Direct HTTP fetch + meta tags (og:title, og:image, schema.org JSON-LD)
//  2. Jina AI reader fallback (only when Step 1 fetch fails)
//  3. Claude AI for clean product name extraction (when ANTHROPIC_API_KEY is configured)
type DefaultExtractor struct {
	fetcher      *Fetcher
	jinaFetcher  *JinaFetcher
	claude       *ClaudeExtractor // may be nil if ANTHROPIC_API_KEY is not set
}

// NewDefaultExtractor creates a DefaultExtractor with all configured sub-extractors.
func NewDefaultExtractor() *DefaultExtractor {
	return &DefaultExtractor{
		fetcher:     NewFetcher(),
		jinaFetcher: NewJinaFetcher(),
		claude:      NewClaudeExtractor(),
	}
}

// NewDefaultExtractorWithDeps creates a DefaultExtractor with explicit dependencies.
// Intended for testing; any argument may be nil.
func NewDefaultExtractorWithDeps(fetcher *Fetcher, jina *JinaFetcher, claude *ClaudeExtractor) *DefaultExtractor {
	return &DefaultExtractor{
		fetcher:     fetcher,
		jinaFetcher: jina,
		claude:      claude,
	}
}

// Extract fetches the given URL and extracts product name and image URL.
//
// Step 1: Direct fetch (5s timeout).
//   - On fetch error: proceed to Step 2 (Jina fallback).
//   - On success: parse og:image / schema.org image for imageURL.
//     If Claude is configured, use Claude(visibleText) for name; imageURL prefers meta over Claude.
//     Else use og:title / schema.org name.
//     If name == "": return ErrExtractionFailed (no Jina fallback — page loaded, no product).
//
// Step 2: Jina AI fallback (only when Step 1 fetch fails).
//   - If Jina fetch fails: return ErrFetchFailed.
//   - If Claude configured: Claude(jina.Content) → name + imageURL.
//   - Else: name = jina.Title, imageURL = first key from jina.Images.
//   - If name == "": return ErrExtractionFailed.
func (e *DefaultExtractor) Extract(ctx context.Context, rawURL string) (Result, error) {
	// Step 1: Direct fetch
	htmlBytes, fetchErr := e.fetcher.Fetch(ctx, rawURL)
	if fetchErr != nil {
		log.Printf("urlextract: step1 fetch failed url=%s err=%v → trying Jina", rawURL, fetchErr)
		return e.extractViaJina(ctx, rawURL)
	}
	log.Printf("urlextract: step1 fetch ok url=%s htmlBytes=%d", rawURL, len(htmlBytes))

	// Step 1 succeeded: parse meta tags
	metaResult := ParseMeta(htmlBytes, rawURL)
	log.Printf("urlextract: step1 meta name=%q imageURL=%q", metaResult.Name, metaResult.ImageURL)

	if e.claude != nil {
		text := extractVisibleText(htmlBytes)
		log.Printf("urlextract: step1 visible text len=%d", len(text))
		claudeResult, err := e.claude.Extract(ctx, text, metaResult)
		if err != nil {
			log.Printf("urlextract: step1 claude error err=%v", err)
			return Result{}, err
		}
		log.Printf("urlextract: step1 claude name=%q imageURL=%q", claudeResult.Name, claudeResult.ImageURL)
		imageURL := metaResult.ImageURL
		if imageURL == "" {
			imageURL = claudeResult.ImageURL
		}
		name := claudeResult.Name
		if name != "" {
			return Result{Name: name, ImageURL: imageURL}, nil
		}
		log.Printf("urlextract: step1 claude returned no name → trying Jina")
		return e.extractViaJina(ctx, rawURL)
	}

	// No Claude: use meta tags; fall back to Jina if meta also empty
	if metaResult.Name != "" {
		return metaResult, nil
	}
	log.Printf("urlextract: step1 no claude, empty meta → trying Jina")
	return e.extractViaJina(ctx, rawURL)
}

// extractViaJina fetches via Jina AI and returns a Result.
func (e *DefaultExtractor) extractViaJina(ctx context.Context, rawURL string) (Result, error) {
	if e.jinaFetcher == nil {
		log.Printf("urlextract: jina skipped (no jinaFetcher)")
		return Result{}, ErrFetchFailed
	}

	jinaResult, err := e.jinaFetcher.Fetch(ctx, rawURL)
	if err != nil {
		log.Printf("urlextract: jina fetch failed url=%s err=%v", rawURL, err)
		return Result{}, err
	}
	log.Printf("urlextract: jina fetch ok title=%q contentLen=%d images=%d", jinaResult.Title, len(jinaResult.Content), len(jinaResult.Images))

	if e.claude != nil {
		claudeResult, err := e.claude.Extract(ctx, jinaResult.Content, Result{Name: jinaResult.Title})
		if err != nil {
			log.Printf("urlextract: jina claude error err=%v", err)
			return Result{}, err
		}
		log.Printf("urlextract: jina claude name=%q imageURL=%q", claudeResult.Name, claudeResult.ImageURL)
		if claudeResult.Name != "" {
			return claudeResult, nil
		}
		log.Printf("urlextract: jina claude returned no name → ErrExtractionFailed")
		return Result{}, ErrExtractionFailed
	}

	// No Claude: use Jina title and first image
	name := jinaResult.Title
	if name == "" {
		log.Printf("urlextract: jina no claude, empty title → ErrExtractionFailed")
		return Result{}, ErrExtractionFailed
	}
	var imageURL string
	for url := range jinaResult.Images {
		imageURL = url
		break
	}
	return Result{Name: name, ImageURL: imageURL}, nil
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

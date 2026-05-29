package urlextract

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"unicode/utf8"

	"golang.org/x/net/html"
)

var markdownImageRe = regexp.MustCompile(`!\[([^\]]*)\]\((https?://[^)]+)\)`)

var ErrFetchFailed = errors.New("urlextract: fetch failed")
var ErrExtractionFailed = errors.New("urlextract: extraction failed")

// ProgressFunc is called by DefaultExtractor as each extraction step begins.
// step is a short identifier (fetching, fetching_jina, extracting, generating_candidates).
// message is a human-readable Japanese description of the step.
type ProgressFunc func(step, message string)

type Result struct {
	Name           string
	ImageURL       string   // empty if not found
	NameCandidates []string // populated when name >= 25 runes and Claude is available
}

type Extractor interface {
	Extract(ctx context.Context, rawURL string) (Result, error)
}

// DefaultExtractor extracts product metadata from a URL using:
//  1. Direct HTTP fetch + meta tags (og:title, og:image, schema.org JSON-LD)
//  2. Jina AI reader fallback (only when Step 1 fetch fails)
//  3. Claude AI for clean product name extraction (when ANTHROPIC_API_KEY is configured)
type DefaultExtractor struct {
	fetcher     *Fetcher
	jinaFetcher *JinaFetcher
	claude      *ClaudeExtractor // may be nil if ANTHROPIC_API_KEY is not set
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
	return e.extractWithProgress(ctx, rawURL, func(_, _ string) {})
}

// ExtractWithProgress is like Extract but calls onProgress at each step.
func (e *DefaultExtractor) ExtractWithProgress(ctx context.Context, rawURL string, onProgress ProgressFunc) (Result, error) {
	return e.extractWithProgress(ctx, rawURL, onProgress)
}

func (e *DefaultExtractor) extractWithProgress(ctx context.Context, rawURL string, onProgress ProgressFunc) (Result, error) {
	// Step 1: Direct fetch
	onProgress("fetching", "ページを取得中...")
	htmlBytes, fetchErr := e.fetcher.Fetch(ctx, rawURL)
	if fetchErr != nil {
		slog.Warn("urlextract step1 fetch failed, trying Jina", "url", rawURL, "error", fetchErr)
		onProgress("fetching_jina", "別の方法でページを取得中...")
		res, jinaErr := e.extractViaJinaWithProgress(ctx, rawURL, onProgress)
		if jinaErr != nil {
			return Result{}, fmt.Errorf("step1: %v; %w", fetchErr, jinaErr)
		}
		if e.claude != nil && utf8.RuneCountInString(res.Name) >= 25 {
			onProgress("generating_candidates", "名前の候補を生成中...")
			res.NameCandidates, _ = e.claude.GenerateCandidates(ctx, res.Name)
		}
		return res, nil
	}
	slog.Info("urlextract step1 fetch ok", "url", rawURL, "htmlBytes", len(htmlBytes))

	// Step 1 succeeded: parse meta tags
	metaResult := ParseMeta(htmlBytes, rawURL)
	slog.Info("urlextract step1 meta", "name", metaResult.Name, "imageURL", metaResult.ImageURL)

	if e.claude != nil {
		onProgress("extracting", "商品情報を解析中...")
		text := extractVisibleText(htmlBytes)
		slog.Info("urlextract step1 visible text", "len", len(text))
		claudeResult, err := e.claude.Extract(ctx, text, metaResult)
		if err != nil {
			slog.Error("urlextract step1 claude error", "error", err)
			return Result{}, err
		}
		slog.Info("urlextract step1 claude", "name", claudeResult.Name, "imageURL", claudeResult.ImageURL)
		imageURL := metaResult.ImageURL
		if imageURL == "" {
			imageURL = claudeResult.ImageURL
		}
		name := claudeResult.Name
		if name == "" {
			slog.Warn("urlextract step1 claude returned no name, trying Jina")
			onProgress("fetching_jina", "別の方法でページを取得中...")
			res, jinaErr := e.extractViaJinaWithProgress(ctx, rawURL, onProgress)
			if jinaErr != nil {
				return Result{}, jinaErr
			}
			if utf8.RuneCountInString(res.Name) >= 25 {
				onProgress("generating_candidates", "名前の候補を生成中...")
				res.NameCandidates, _ = e.claude.GenerateCandidates(ctx, res.Name)
			}
			return res, nil
		}
		needImage := imageURL == ""
		if utf8.RuneCountInString(name) >= 25 {
			onProgress("generating_candidates", "名前の候補を生成中...")
			candidates, _ := e.claude.GenerateCandidates(ctx, name)
			result := Result{Name: name, ImageURL: imageURL, NameCandidates: candidates}
			if needImage {
				if jinaRes, jinaErr := e.extractViaJina(ctx, rawURL); jinaErr == nil && jinaRes.ImageURL != "" {
					result.ImageURL = jinaRes.ImageURL
				}
			}
			return result, nil
		}
		if needImage {
			if jinaRes, jinaErr := e.extractViaJina(ctx, rawURL); jinaErr == nil && jinaRes.ImageURL != "" {
				imageURL = jinaRes.ImageURL
			}
		}
		return Result{Name: name, ImageURL: imageURL}, nil
	}

	// No Claude: use meta tags; fall back to Jina if meta also empty
	if metaResult.Name != "" {
		return metaResult, nil
	}
	slog.Warn("urlextract step1 no claude, empty meta, trying Jina")
	onProgress("fetching_jina", "別の方法でページを取得中...")
	return e.extractViaJinaWithProgress(ctx, rawURL, onProgress)
}

// extractViaJinaWithProgress is like extractViaJina but emits extracting before the Claude call.
func (e *DefaultExtractor) extractViaJinaWithProgress(ctx context.Context, rawURL string, onProgress ProgressFunc) (Result, error) {
	if e.jinaFetcher == nil {
		slog.Info("urlextract jina skipped (no jinaFetcher)")
		return Result{}, fmt.Errorf("jina: not configured: %w", ErrFetchFailed)
	}

	jinaResult, err := e.jinaFetcher.Fetch(ctx, rawURL)
	if err != nil {
		slog.Warn("urlextract jina fetch failed", "url", rawURL, "error", err)
		return Result{}, fmt.Errorf("jina: %v: %w", err, ErrFetchFailed)
	}
	slog.Info("urlextract jina fetch ok", "title", jinaResult.Title, "contentLen", len(jinaResult.Content), "images", len(jinaResult.Images))

	if e.claude != nil {
		onProgress("extracting", "商品情報を解析中...")
		claudeResult, err := e.claude.Extract(ctx, jinaResult.Content, Result{Name: jinaResult.Title})
		if err != nil {
			slog.Error("urlextract jina claude error", "error", err)
			return Result{}, err
		}
		slog.Info("urlextract jina claude", "name", claudeResult.Name, "imageURL", claudeResult.ImageURL)
		if claudeResult.Name == "" {
			slog.Warn("urlextract jina claude returned no name, ErrExtractionFailed")
			return Result{}, fmt.Errorf("claude returned empty name: %w", ErrExtractionFailed)
		}
		name := claudeResult.Name
		imageURL := claudeResult.ImageURL
		if imageURL == "" {
			slog.Warn("urlextract jina result missing image, supplementing from raw Jina")
			imageURL = imageURLFromJina(jinaResult.Images, jinaResult.Content, name)
		}
		return Result{Name: name, ImageURL: imageURL}, nil
	}

	name := jinaResult.Title
	if name == "" {
		slog.Warn("urlextract jina no claude, empty title, ErrExtractionFailed")
		return Result{}, fmt.Errorf("jina: empty title: %w", ErrExtractionFailed)
	}
	return Result{Name: name, ImageURL: imageURLFromJina(jinaResult.Images, jinaResult.Content, name)}, nil
}

// extractViaJina fetches via Jina AI and returns a Result.
func (e *DefaultExtractor) extractViaJina(ctx context.Context, rawURL string) (Result, error) {
	if e.jinaFetcher == nil {
		slog.Info("urlextract jina skipped (no jinaFetcher)")
		return Result{}, fmt.Errorf("jina: not configured: %w", ErrFetchFailed)
	}

	jinaResult, err := e.jinaFetcher.Fetch(ctx, rawURL)
	if err != nil {
		slog.Warn("urlextract jina fetch failed", "url", rawURL, "error", err)
		return Result{}, fmt.Errorf("jina: %v: %w", err, ErrFetchFailed)
	}
	slog.Info("urlextract jina fetch ok", "title", jinaResult.Title, "contentLen", len(jinaResult.Content), "images", len(jinaResult.Images))

	if e.claude != nil {
		claudeResult, err := e.claude.Extract(ctx, jinaResult.Content, Result{Name: jinaResult.Title})
		if err != nil {
			slog.Error("urlextract jina claude error", "error", err)
			return Result{}, err
		}
		slog.Info("urlextract jina claude", "name", claudeResult.Name, "imageURL", claudeResult.ImageURL)
		if claudeResult.Name == "" {
			slog.Warn("urlextract jina claude returned no name, ErrExtractionFailed")
			return Result{}, fmt.Errorf("claude returned empty name: %w", ErrExtractionFailed)
		}
		name := claudeResult.Name
		imageURL := claudeResult.ImageURL
		if imageURL == "" {
			slog.Warn("urlextract jina result missing image, supplementing from raw Jina")
			imageURL = imageURLFromJina(jinaResult.Images, jinaResult.Content, name)
		}
		return Result{Name: name, ImageURL: imageURL}, nil
	}

	// No Claude: use Jina title and first image
	name := jinaResult.Title
	if name == "" {
		slog.Warn("urlextract jina no claude, empty title, ErrExtractionFailed")
		return Result{}, fmt.Errorf("jina: empty title: %w", ErrExtractionFailed)
	}
	return Result{Name: name, ImageURL: imageURLFromJina(jinaResult.Images, jinaResult.Content, name)}, nil
}

// firstValidImageURL returns the first key in images that is an http/https URL.
// Jina uses non-URL placeholders like "Image N,M: alt" for images it cannot retrieve.
func firstValidImageURL(images map[string]string) string {
	for url := range images {
		if strings.HasPrefix(url, "http://") || strings.HasPrefix(url, "https://") {
			return url
		}
	}
	return ""
}

// imageURLFromJina returns the best image URL from Jina data.
// Tries the images map first; falls back to markdown image links in content,
// preferring those whose alt text contains nameHint.
func imageURLFromJina(images map[string]string, content, nameHint string) string {
	if url := firstValidImageURL(images); url != "" {
		return url
	}
	return firstImageURLFromMarkdown(content, nameHint)
}

// firstImageURLFromMarkdown extracts an image URL from Jina markdown content.
// Prefers images whose alt text contains nameHint; falls back to the first URL found.
func firstImageURLFromMarkdown(content, nameHint string) string {
	matches := markdownImageRe.FindAllStringSubmatch(content, -1)
	nameHintLower := strings.ToLower(nameHint)
	var firstURL string
	for _, m := range matches {
		alt, url := m[1], m[2]
		if firstURL == "" {
			firstURL = url
		}
		if nameHint != "" && strings.Contains(strings.ToLower(alt), nameHintLower) {
			return url
		}
	}
	return firstURL
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

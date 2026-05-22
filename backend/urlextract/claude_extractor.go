package urlextract

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"unicode/utf8"

	"github.com/anthropics/anthropic-sdk-go"
)

const (
	maxHTMLTextLen = 8000
	claudeModel    = anthropic.ModelClaudeHaiku4_5_20251001
)

// systemPrompt is the static instruction block sent to Claude.
// It is marked with cache_control so the token cost is amortized across requests.
const systemPrompt = `You are a product information extractor. Given page content from a product page and optional reference data extracted from HTML meta tags, extract the product name and image URL.

Respond ONLY with a JSON object in this exact format:
{"name": "<product name>", "imageUrl": "<image url or empty string>"}

Rules:
- Prefer clean product names; strip store/site name suffixes (e.g. "Product Name | Store" → "Product Name")
- If the meta reference provides an image URL and no better image is found in the page content, use the meta image
- If you cannot determine a product name, set "name" to an empty string
- If you cannot find an image URL, set "imageUrl" to an empty string
- Do not include any other text or explanation`

// truncateText safely truncates a string to maxRunes characters, respecting UTF-8 rune boundaries.
// This prevents panic when truncating multi-byte UTF-8 strings (e.g., Japanese text).
func truncateText(s string, maxRunes int) string {
	if utf8.RuneCountInString(s) <= maxRunes {
		return s
	}
	runes := []rune(s)
	return string(runes[:maxRunes])
}

// ClaudeExtractor uses Claude Haiku to extract product name and image URL from page content.
type ClaudeExtractor struct {
	client *anthropic.Client
}

// NewClaudeExtractor returns a ClaudeExtractor if ANTHROPIC_API_KEY is set, otherwise nil.
func NewClaudeExtractor() *ClaudeExtractor {
	key := os.Getenv("ANTHROPIC_API_KEY")
	if key == "" {
		return nil
	}
	client := anthropic.NewClient()
	return &ClaudeExtractor{client: &client}
}

// Extract sends content (truncated to maxHTMLTextLen runes) and meta reference to Claude Haiku.
// meta provides og:title / og:image as hints; content is the main text (HTML visible text or Markdown).
// Returns empty Result with nil error if Claude cannot extract anything useful.
func (e *ClaudeExtractor) Extract(ctx context.Context, content string, meta Result) (Result, error) {
	content = truncateText(content, maxHTMLTextLen)

	userText := fmt.Sprintf(
		"Reference from meta tags (may be noisy or incomplete):\nname: %q\nimageUrl: %q\n\nPage content:\n%s",
		meta.Name, meta.ImageURL, content,
	)

	msg, err := e.client.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     claudeModel,
		MaxTokens: 256,
		System: []anthropic.TextBlockParam{
			{
				Text:         systemPrompt,
				CacheControl: anthropic.NewCacheControlEphemeralParam(),
			},
		},
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock(userText)),
		},
	})
	if err != nil {
		return Result{}, fmt.Errorf("claude extraction failed: %w", err)
	}

	var responseText string
	for _, block := range msg.Content {
		if block.Type == "text" {
			responseText = block.Text
			break
		}
	}

	log.Printf("claude: raw response=%q", responseText)

	if responseText == "" {
		return Result{}, nil
	}

	responseText = strings.TrimSpace(responseText)
	// Strip markdown code fences if Claude wraps the JSON (e.g. ```json\n...\n```)
	if strings.HasPrefix(responseText, "```") {
		responseText = strings.TrimPrefix(responseText, "```json")
		responseText = strings.TrimPrefix(responseText, "```")
		responseText = strings.TrimSuffix(responseText, "```")
		responseText = strings.TrimSpace(responseText)
	}
	var extracted struct {
		Name     string `json:"name"`
		ImageURL string `json:"imageUrl"`
	}
	if err := json.Unmarshal([]byte(responseText), &extracted); err != nil {
		log.Printf("claude: json unmarshal error err=%v response=%q", err, responseText)
		return Result{}, nil
	}

	return Result{
		Name:     extracted.Name,
		ImageURL: extracted.ImageURL,
	}, nil
}

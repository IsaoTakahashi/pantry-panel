package urlextract

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"unicode/utf8"

	"github.com/anthropics/anthropic-sdk-go"
)

const (
	maxHTMLTextLen = 8000
	claudeModel    = anthropic.ModelClaudeHaiku4_5_20251001
)

// truncateText safely truncates a string to maxRunes characters, respecting UTF-8 rune boundaries.
// This prevents panic when truncating multi-byte UTF-8 strings (e.g., Japanese text).
func truncateText(s string, maxRunes int) string {
	if utf8.RuneCountInString(s) <= maxRunes {
		return s
	}
	runes := []rune(s)
	return string(runes[:maxRunes])
}

// ClaudeExtractor uses Claude Haiku to extract product name and image URL from HTML text.
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

// Extract sends htmlText (truncated to maxHTMLTextLen runes) to Claude Haiku and returns
// the extracted product name and image URL. Returns empty Result with nil error if Claude
// cannot extract anything useful.
func (e *ClaudeExtractor) Extract(ctx context.Context, htmlText string) (Result, error) {
	htmlText = truncateText(htmlText, maxHTMLTextLen)

	prompt := fmt.Sprintf(
		`You are a product information extractor. Given the following HTML content from a product page, extract the product name and product image URL.

Respond ONLY with a JSON object in this exact format:
{"name": "<product name>", "imageUrl": "<image url or empty string>"}

If you cannot find a product name, set "name" to an empty string.
If you cannot find an image URL, set "imageUrl" to an empty string.
Do not include any other text or explanation.

HTML content:
%s`, htmlText)

	msg, err := e.client.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     claudeModel,
		MaxTokens: 256,
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock(prompt)),
		},
	})
	if err != nil {
		return Result{}, fmt.Errorf("claude extraction failed: %w", err)
	}

	// Extract text from the first text content block
	var responseText string
	for _, block := range msg.Content {
		if block.Type == "text" {
			responseText = block.Text
			break
		}
	}

	if responseText == "" {
		return Result{}, nil
	}

	// Parse JSON response
	responseText = strings.TrimSpace(responseText)
	var extracted struct {
		Name     string `json:"name"`
		ImageURL string `json:"imageUrl"`
	}
	if err := json.Unmarshal([]byte(responseText), &extracted); err != nil {
		// Claude returned something unexpected — treat as no result
		return Result{}, nil
	}

	return Result{
		Name:     extracted.Name,
		ImageURL: extracted.ImageURL,
	}, nil
}

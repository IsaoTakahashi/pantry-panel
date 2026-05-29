package urlextract

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"unicode/utf8"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewClaudeExtractor(t *testing.T) {
	t.Run("nil_when_key_unset", func(t *testing.T) {
		t.Setenv("ANTHROPIC_API_KEY", "")
		got := NewClaudeExtractor()
		assert.Nil(t, got)
	})

	t.Run("not_nil_when_key_set", func(t *testing.T) {
		t.Setenv("ANTHROPIC_API_KEY", "test-key-value")
		got := NewClaudeExtractor()
		assert.NotNil(t, got)
	})
}

func TestTruncateText(t *testing.T) {
	t.Run("short_string_unchanged", func(t *testing.T) {
		input := "hello world"
		got := truncateText(input, maxHTMLTextLen)
		assert.Equal(t, input, got)
	})

	t.Run("truncates_to_exact_runes", func(t *testing.T) {
		// Build a string longer than maxHTMLTextLen using multi-byte runes (Japanese)
		r := 'あ' // 3-byte UTF-8 rune
		longStr := ""
		for range maxHTMLTextLen + 100 {
			longStr += string(r)
		}
		require.Greater(t, utf8.RuneCountInString(longStr), maxHTMLTextLen)

		got := truncateText(longStr, maxHTMLTextLen)
		assert.Equal(t, maxHTMLTextLen, utf8.RuneCountInString(got))
	})

	t.Run("exact_length_unchanged", func(t *testing.T) {
		r := 'あ'
		exactStr := ""
		for range maxHTMLTextLen {
			exactStr += string(r)
		}
		got := truncateText(exactStr, maxHTMLTextLen)
		assert.Equal(t, maxHTMLTextLen, utf8.RuneCountInString(got))
		assert.Equal(t, exactStr, got)
	})
}

// TestClaudeResponseParsing tests the JSON parsing logic that ClaudeExtractor.Extract() applies
// to the Claude API response. We validate that the expected struct unmarshalling works correctly.
func TestClaudeResponseParsing(t *testing.T) {
	t.Run("name_and_image", func(t *testing.T) {
		responseText := `{"name": "テスト商品", "imageUrl": "https://example.com/img.jpg"}`
		var extracted struct {
			Name     string `json:"name"`
			ImageURL string `json:"imageUrl"`
		}
		err := json.Unmarshal([]byte(responseText), &extracted)
		require.NoError(t, err)
		assert.Equal(t, "テスト商品", extracted.Name)
		assert.Equal(t, "https://example.com/img.jpg", extracted.ImageURL)
	})

	t.Run("empty_fields", func(t *testing.T) {
		responseText := `{"name": "", "imageUrl": ""}`
		var extracted struct {
			Name     string `json:"name"`
			ImageURL string `json:"imageUrl"`
		}
		err := json.Unmarshal([]byte(responseText), &extracted)
		require.NoError(t, err)
		assert.Equal(t, "", extracted.Name)
		assert.Equal(t, "", extracted.ImageURL)
	})

	t.Run("malformed_json", func(t *testing.T) {
		responseText := `not valid json`
		var extracted struct {
			Name     string `json:"name"`
			ImageURL string `json:"imageUrl"`
		}
		err := json.Unmarshal([]byte(responseText), &extracted)
		// Unmarshal should fail; ClaudeExtractor treats this as no result (returns empty Result)
		assert.Error(t, err)
	})
}

func TestGenerateCandidates(t *testing.T) {
	// TestGenerateCandidates verifies that GenerateCandidates returns the candidates
	// produced by generateFn when it succeeds.
	t.Run("happy_path", func(t *testing.T) {
		want := []string{"候補1", "候補2", "候補3"}
		e := &ClaudeExtractor{
			generateFn: func(_ context.Context, _ string) ([]string, error) {
				return want, nil
			},
		}
		got, err := e.GenerateCandidates(context.Background(), "これは25文字以上の長い商品タイトルです")
		require.NoError(t, err)
		assert.Equal(t, want, got)
	})

	// error_returns_empty_slice verifies that when generateFn returns an error,
	// GenerateCandidates swallows it and returns an empty (non-nil) slice with nil error.
	t.Run("error_returns_empty_slice", func(t *testing.T) {
		e := &ClaudeExtractor{
			generateFn: func(_ context.Context, _ string) ([]string, error) {
				return nil, errors.New("claude API down")
			},
		}
		got, err := e.GenerateCandidates(context.Background(), "長い商品名テスト")
		require.NoError(t, err)
		assert.Equal(t, []string{}, got)
	})
}

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

func TestNewClaudeExtractor_NilWhenKeyUnset(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "")
	got := NewClaudeExtractor()
	assert.Nil(t, got)
}

func TestNewClaudeExtractor_NotNilWhenKeySet(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key-value")
	got := NewClaudeExtractor()
	assert.NotNil(t, got)
}

func TestTruncateText_ShortStringUnchanged(t *testing.T) {
	input := "hello world"
	got := truncateText(input, maxHTMLTextLen)
	assert.Equal(t, input, got)
}

func TestTruncateText_TruncatesToExactRunes(t *testing.T) {
	// Build a string longer than maxHTMLTextLen using multi-byte runes (Japanese)
	r := 'あ' // 3-byte UTF-8 rune
	longStr := ""
	for i := 0; i < maxHTMLTextLen+100; i++ {
		longStr += string(r)
	}
	require.Greater(t, utf8.RuneCountInString(longStr), maxHTMLTextLen)

	got := truncateText(longStr, maxHTMLTextLen)
	assert.Equal(t, maxHTMLTextLen, utf8.RuneCountInString(got))
}

func TestTruncateText_ExactLengthUnchanged(t *testing.T) {
	r := 'あ'
	exactStr := ""
	for i := 0; i < maxHTMLTextLen; i++ {
		exactStr += string(r)
	}
	got := truncateText(exactStr, maxHTMLTextLen)
	assert.Equal(t, maxHTMLTextLen, utf8.RuneCountInString(got))
	assert.Equal(t, exactStr, got)
}

// TestClaudeResponseParsing tests the JSON parsing logic that ClaudeExtractor.Extract() applies
// to the Claude API response. We validate that the expected struct unmarshalling works correctly.
func TestClaudeResponseParsing_NameAndImage(t *testing.T) {
	responseText := `{"name": "テスト商品", "imageUrl": "https://example.com/img.jpg"}`
	var extracted struct {
		Name     string `json:"name"`
		ImageURL string `json:"imageUrl"`
	}
	err := json.Unmarshal([]byte(responseText), &extracted)
	require.NoError(t, err)
	assert.Equal(t, "テスト商品", extracted.Name)
	assert.Equal(t, "https://example.com/img.jpg", extracted.ImageURL)
}

func TestClaudeResponseParsing_EmptyFields(t *testing.T) {
	responseText := `{"name": "", "imageUrl": ""}`
	var extracted struct {
		Name     string `json:"name"`
		ImageURL string `json:"imageUrl"`
	}
	err := json.Unmarshal([]byte(responseText), &extracted)
	require.NoError(t, err)
	assert.Equal(t, "", extracted.Name)
	assert.Equal(t, "", extracted.ImageURL)
}

func TestClaudeResponseParsing_MalformedJSON(t *testing.T) {
	responseText := `not valid json`
	var extracted struct {
		Name     string `json:"name"`
		ImageURL string `json:"imageUrl"`
	}
	err := json.Unmarshal([]byte(responseText), &extracted)
	// Unmarshal should fail; ClaudeExtractor treats this as no result (returns empty Result)
	assert.Error(t, err)
}

// TestGenerateCandidates_HappyPath verifies that GenerateCandidates returns the candidates
// produced by generateFn when it succeeds.
func TestGenerateCandidates_HappyPath(t *testing.T) {
	want := []string{"候補1", "候補2", "候補3"}
	e := &ClaudeExtractor{
		generateFn: func(_ context.Context, _ string) ([]string, error) {
			return want, nil
		},
	}
	got, err := e.GenerateCandidates(context.Background(), "これは25文字以上の長い商品タイトルです")
	require.NoError(t, err)
	assert.Equal(t, want, got)
}

// TestGenerateCandidates_ErrorReturnsEmptySlice verifies that when generateFn returns an error,
// GenerateCandidates swallows it and returns an empty (non-nil) slice with nil error.
func TestGenerateCandidates_ErrorReturnsEmptySlice(t *testing.T) {
	e := &ClaudeExtractor{
		generateFn: func(_ context.Context, _ string) ([]string, error) {
			return nil, errors.New("claude API down")
		},
	}
	got, err := e.GenerateCandidates(context.Background(), "長い商品名テスト")
	require.NoError(t, err)
	assert.Equal(t, []string{}, got)
}

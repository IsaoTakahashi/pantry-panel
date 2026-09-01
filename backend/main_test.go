package main

import (
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"

	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParsePort(t *testing.T) {
	tests := []struct {
		name     string
		env      string
		expected string
	}{
		{
			name:     "empty env returns default port",
			env:      "",
			expected: "8080",
		},
		{
			name:     "custom port is returned",
			env:      "9090",
			expected: "9090",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := parsePort(tt.env); got != tt.expected {
				t.Errorf("parsePort(%q) = %q, want %q", tt.env, got, tt.expected)
			}
		})
	}
}

func TestParseCORSAllowedOrigins(t *testing.T) {
	tests := []struct {
		name     string
		env      string
		expected []string
	}{
		{
			name:     "empty env returns default origin",
			env:      "",
			expected: []string{"http://localhost:3000"},
		},
		{
			name:     "single origin is returned as slice",
			env:      "http://example.com",
			expected: []string{"http://example.com"},
		},
		{
			name:     "multiple origins are split and returned as slice",
			env:      "http://example.com,http://foo.com",
			expected: []string{"http://example.com", "http://foo.com"},
		},
		{
			name:     "whitespace around origins is trimmed",
			env:      "http://example.com, http://foo.com , http://bar.com",
			expected: []string{"http://example.com", "http://foo.com", "http://bar.com"},
		},
		{
			name:     "empty entries between commas are filtered",
			env:      "http://example.com,,http://foo.com",
			expected: []string{"http://example.com", "http://foo.com"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := parseCORSAllowedOrigins(tt.env); !slices.Equal(got, tt.expected) {
				t.Errorf("parseCORSAllowedOrigins(%q) = %v, want %v", tt.env, got, tt.expected)
			}
		})
	}
}

func TestCompileOriginMatcher(t *testing.T) {
	tests := []struct {
		name     string
		patterns []string
		origins  []string
		wants    []bool
	}{
		{
			name:     "exact match allows the same origin",
			patterns: []string{"https://example.com"},
			origins:  []string{"https://example.com"},
			wants:    []bool{true},
		},
		{
			name:     "exact match is case insensitive",
			patterns: []string{"https://Example.com"},
			origins:  []string{"https://example.com"},
			wants:    []bool{true},
		},
		{
			name:     "exact match rejects different origin",
			patterns: []string{"https://Example.com"},
			origins:  []string{"https://other.com"},
			wants:    []bool{false},
		},
		{
			name:     "wildcard matches a single segment",
			patterns: []string{"https://app-*.vercel.app"},
			origins:  []string{"https://app-abc123.vercel.app"},
			wants:    []bool{true},
		},
		{
			name:     "wildcard does not span dots",
			patterns: []string{"https://app-*.vercel.app"},
			origins:  []string{"https://app-evil.attacker.com.vercel.app"},
			wants:    []bool{false},
		},
		{
			name:     "wildcard rejects non-matching origin",
			patterns: []string{"https://app-*.vercel.app"},
			origins:  []string{"https://other-abc.vercel.app"},
			wants:    []bool{false},
		},
		{
			name:     "mixed exact and wildcard patterns",
			patterns: []string{"https://app-123.vercel.app", "https://app-*.vercel.app"},
			origins:  []string{"https://app-123.vercel.app", "https://app-abc123.vercel.app", "https://app.vercel.app"},
			wants:    []bool{true, true, false},
		},
		{
			name:     "empty patterns rejects everything",
			patterns: []string{},
			origins:  []string{"https://other-abc.vercel.app"},
			wants:    []bool{false},
		},
		{
			name:     "vercel preview url is allowed",
			patterns: []string{"https://pantry-panel-*-rictons-projects.vercel.app"},
			origins:  []string{"https://pantry-panel-6how12g71-rictons-projects.vercel.app"},
			wants:    []bool{true},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			matcher, err := compileOriginMatcher(tt.patterns)
			require.NoError(t, err)

			require.Equal(t, len(tt.origins), len(tt.wants), "test data: origins/wants length mismatch")
			for i, origin := range tt.origins {
				assert.Equalf(t, tt.wants[i], matcher(origin), "origin=%q", origin)
			}
		})
	}
}

func TestCORSMiddlewareMaxAge(t *testing.T) {
	matcher, err := compileOriginMatcher([]string{"https://allowed.example.com"})
	require.NoError(t, err)

	e := echo.New()
	e.Use(newCORSMiddleware(matcher))
	e.GET("/health", func(c *echo.Context) error {
		return c.NoContent(http.StatusOK)
	})

	t.Run("allowed origin preflight includes Access-Control-Max-Age: 7200", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodOptions, "/health", nil)
		req.Header.Set(echo.HeaderOrigin, "https://allowed.example.com")
		req.Header.Set(echo.HeaderAccessControlRequestMethod, http.MethodGet)
		rec := httptest.NewRecorder()

		e.ServeHTTP(rec, req)

		assert.Equal(t, "https://allowed.example.com", rec.Header().Get(echo.HeaderAccessControlAllowOrigin))
		assert.Equal(t, "7200", rec.Header().Get(echo.HeaderAccessControlMaxAge))
	})

	t.Run("disallowed origin preflight has neither Access-Control-Allow-Origin nor Access-Control-Max-Age", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodOptions, "/health", nil)
		req.Header.Set(echo.HeaderOrigin, "https://evil.example.com")
		req.Header.Set(echo.HeaderAccessControlRequestMethod, http.MethodGet)
		rec := httptest.NewRecorder()

		e.ServeHTTP(rec, req)

		assert.Empty(t, rec.Header().Get(echo.HeaderAccessControlAllowOrigin))
		assert.Empty(t, rec.Header().Get(echo.HeaderAccessControlMaxAge))
	})
}

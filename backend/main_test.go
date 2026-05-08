package main

import (
	"slices"
	"testing"
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

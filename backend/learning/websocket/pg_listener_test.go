//go:build learning

package websocket

import (
	"testing"
	"time"
)

func TestComputeBackoff(t *testing.T) {
	tests := []struct {
		attempt int
		want    time.Duration
	}{
		{0, 500 * time.Millisecond},
		{1, 1 * time.Second},
		{2, 2 * time.Second},
		{3, 5 * time.Second},
		{4, 10 * time.Second},
		{5, 10 * time.Second},
		{100, 10 * time.Second},
	}
	for _, tt := range tests {
		computed := computeBackoff(tt.attempt)
		if computed != tt.want {
			t.Errorf("computeBackoff(%d) = %v, want %v", tt.attempt, computed, tt.want)
		}
		_ = tt
	}
}

package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockPinger struct {
	err error
}

func (m *mockPinger) Ping() error {
	return m.err
}

func TestHealthCheck(t *testing.T) {
	tests := []struct {
		name     string
		pinger   Pinger
		wantCode int
		wantBody map[string]string
	}{
		{"HealthCheck DBConnected", &mockPinger{err: nil}, 200, map[string]string{"status": "ok", "db": "connected"}},
		{"HealthCheck DBDisconnected", &mockPinger{err: errors.New("connection refused")}, 503, map[string]string{"status": "error", "db": "disconnected"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := echo.New()
			req := httptest.NewRequest(http.MethodGet, "/health", nil)
			rec := httptest.NewRecorder()
			c := e.NewContext(req, rec)

			h := HealthCheck(tt.pinger)
			err := h(c)

			require.NoError(t, err)

			assert.Equal(t, tt.wantCode, rec.Code)

			var got map[string]string
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))

			assert.Equal(t, tt.wantBody, got)
		})
	}
}

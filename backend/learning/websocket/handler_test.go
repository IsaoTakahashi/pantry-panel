//go:build learning

package websocket

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	cws "github.com/coder/websocket"
	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHandler(t *testing.T) {
	t.Run("registers_on_connect", func(t *testing.T) {
		hub := NewHub()
		e := echo.New()
		e.GET("/ws", Handler(hub))
		srv := httptest.NewServer(e)
		defer srv.Close()
		wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"

		ctx := context.Background()
		conn, _, err := cws.Dial(ctx, wsURL, nil)
		require.NoError(t, err)
		defer func() { _ = conn.Close(cws.StatusNormalClosure, "") }()

		assert.Eventually(t, func() bool {
			return hub.Len() == 1
		}, time.Second, 10*time.Millisecond)
	})

	t.Run("unregisters_on_disconnect", func(t *testing.T) {
		hub := NewHub()
		e := echo.New()
		e.GET("/ws", Handler(hub))
		srv := httptest.NewServer(e)
		defer srv.Close()
		wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"

		ctx := context.Background()
		conn, _, err := cws.Dial(ctx, wsURL, nil)
		require.NoError(t, err)
		_ = conn.Close(cws.StatusNormalClosure, "")

		assert.Eventually(t, func() bool {
			return hub.Len() == 0
		}, time.Second, 10*time.Millisecond)
	})

	t.Run("broadcast_reaches_client", func(t *testing.T) {
		hub := NewHub()
		e := echo.New()
		e.GET("/ws", Handler(hub))
		srv := httptest.NewServer(e)
		defer srv.Close()
		wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"

		ctx := context.Background()
		conn, _, err := cws.Dial(ctx, wsURL, nil)
		require.NoError(t, err)
		defer func() { _ = conn.Close(cws.StatusNormalClosure, "") }()

		assert.Eventually(t, func() bool {
			return hub.Len() == 1
		}, time.Second, 10*time.Millisecond)

		hub.Broadcast([]byte(`{"type":"x"}`))
		_, msg, err := conn.Read(ctx)
		require.NoError(t, err)
		assert.Equal(t, `{"type":"x"}`, string(msg))
	})
}

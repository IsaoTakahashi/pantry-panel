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

func TestHandler_RegistersOnConnect(t *testing.T) {
	hub := NewHub()
	e := echo.New()
	e.GET("/ws", Handler(hub))
	srv := httptest.NewServer(e)
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"

	ctx := context.Background()
	conn, _, err := cws.Dial(ctx, wsURL, nil)
	require.NoError(t, err)
	defer conn.Close(cws.StatusNormalClosure, "")

	assert.Eventually(t, func() bool {
		return hub.Len() == 1
	}, time.Second, 10*time.Millisecond)
}

func TestHandler_UnregistersOnDisconnect(t *testing.T) {
	hub := NewHub()
	e := echo.New()
	e.GET("/ws", Handler(hub))
	srv := httptest.NewServer(e)
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"

	ctx := context.Background()
	conn, _, err := cws.Dial(ctx, wsURL, nil)
	require.NoError(t, err)
	conn.Close(cws.StatusNormalClosure, "")

	assert.Eventually(t, func() bool {
		return hub.Len() == 0
	}, time.Second, 10*time.Millisecond)
}

func TestHandler_BroadcastReachesClient(t *testing.T) {
	hub := NewHub()
	e := echo.New()
	e.GET("/ws", Handler(hub))
	srv := httptest.NewServer(e)
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"

	ctx := context.Background()
	conn, _, err := cws.Dial(ctx, wsURL, nil)
	require.NoError(t, err)
	defer conn.Close(cws.StatusNormalClosure, "")

	assert.Eventually(t, func() bool {
		return hub.Len() == 1
	}, time.Second, 10*time.Millisecond)

	hub.Broadcast([]byte(`{"type":"x"}`))
	_, msg, err := conn.Read(ctx)
	require.NoError(t, err)
	assert.Equal(t, `{"type":"x"}`, string(msg))
}

//go:build learning

package websocket

import (
	"github.com/labstack/echo/v5"
)

// Handler returns an Echo handler that upgrades HTTP to WebSocket, registers
// the new connection with hub, and pumps messages from c.Send to the wire.
//
// Implementation hint:
//   1) accept the connection via coder/websocket Accept (use c.Response() and c.Request())
//   2) make a Client with a buffered Send channel
//   3) hub.Register(c); defer hub.Unregister(c) and conn.Close
//   4) goroutine: for msg := range c.Send { conn.Write(...) }
//   5) read loop: read & ignore (or implement ping/pong) until connection closes
func Handler(hub *Hub) func(c *echo.Context) error {
	// TODO: implement
	return func(c *echo.Context) error {
		return nil
	}
}

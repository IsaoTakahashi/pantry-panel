//go:build learning

package websocket

import (
	cws "github.com/coder/websocket"
	"github.com/labstack/echo/v5"
)

// Handler returns an Echo handler that upgrades HTTP to WebSocket, registers
// the new connection with hub, and pumps messages from c.Send to the wire.
//
// Implementation hint:
//  1. accept the connection via coder/websocket Accept (use c.Response() and c.Request())
//  2. make a Client with a buffered Send channel
//  3. hub.Register(c); defer hub.Unregister(c) and conn.Close
//  4. goroutine: for msg := range c.Send { conn.Write(...) }
//  5. read loop: read & ignore (or implement ping/pong) until connection closes
func Handler(hub *Hub) func(c *echo.Context) error {

	return func(c *echo.Context) error {
		conn, err := cws.Accept(c.Response(), c.Request(), &cws.AcceptOptions{
			OriginPatterns: []string{"localhost:3000"},
		})
		if err != nil {
			return err
		}
		defer conn.Close(cws.StatusNormalClosure, "")

		client := &Client{Send: make(chan []byte, 10)}
		hub.Register(client)
		defer hub.Unregister(client)

		go func() {
			for msg := range client.Send {
				err := conn.Write(c.Request().Context(), cws.MessageText, msg)
				if err != nil {
					return
				}
			}
		}()

		for {
			_, _, err := conn.Read(c.Request().Context())
			if err != nil {
				break
			}
		}
		close(client.Send)

		return nil
	}
}

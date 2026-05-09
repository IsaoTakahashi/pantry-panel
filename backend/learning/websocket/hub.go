//go:build learning

// Package websocket provides a learning-only Hub + WebSocket handler that
// broadcasts PostgreSQL LISTEN/NOTIFY messages to all connected clients.
//
// This package is excluded from the production build by the `learning` build tag.
package websocket

import "sync"

// Client represents a single WebSocket connection's outbound channel.
// The handler goroutine owns the connection and reads from Send.
type Client struct {
	// Send is the buffered outbound channel. The Hub MUST do a non-blocking
	// send; if the channel is full the client is treated as slow and dropped.
	Send chan []byte
}

// Hub keeps track of registered clients and broadcasts messages to all of them.
type Hub struct {
	mu      sync.RWMutex
	clients map[*Client]struct{}
}

// NewHub creates an empty Hub.
func NewHub() *Hub {
	// TODO: implement
	return nil
}

// Register adds a client to the hub. Safe for concurrent use.
func (h *Hub) Register(c *Client) {
	// TODO: implement (lock + add to map)
}

// Unregister removes a client. If the client is not registered, this is a no-op.
// Safe for concurrent use.
func (h *Hub) Unregister(c *Client) {
	// TODO: implement (lock + delete from map; do NOT close c.Send here, the
	//       handler goroutine that owns the connection should close it)
}

// Broadcast sends msg to every registered client without blocking.
// If a client's Send channel is full, the client is unregistered (slow client policy).
func (h *Hub) Broadcast(msg []byte) {
	// TODO: implement
	//   1) snapshot clients under RLock
	//   2) for each client: select { case c.Send <- msg: default: drop & unregister }
}

// Len returns the current number of registered clients. Used by tests.
func (h *Hub) Len() int {
	// TODO: implement
	return 0
}

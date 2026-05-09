//go:build learning

package websocket

import "testing"

func TestHub_NewHub_Empty(t *testing.T) {
	// TODO: assert NewHub().Len() == 0
}

func TestHub_Register_AddsClient(t *testing.T) {
	// TODO:
	//   hub := NewHub()
	//   c := &Client{Send: make(chan []byte, 1)}
	//   hub.Register(c)
	//   assert hub.Len() == 1
}

func TestHub_Unregister_RemovesClient(t *testing.T) {
	// TODO:
	//   register c then unregister c, assert Len() == 0
}

func TestHub_Broadcast_SingleClient(t *testing.T) {
	// TODO:
	//   register one client with buffered Send
	//   hub.Broadcast([]byte("hello"))
	//   read from c.Send and assert == "hello"
}

func TestHub_Broadcast_MultipleClients(t *testing.T) {
	// TODO: register 2 clients, broadcast once, both receive
}

func TestHub_Broadcast_FullChannel_DropsClient(t *testing.T) {
	// TODO:
	//   register a client with Send buffer 0 (or full buffer)
	//   broadcast a message
	//   assert hub.Len() == 0  (slow client got dropped)
}

func TestHub_ConcurrentRegisterUnregister(t *testing.T) {
	// TODO: launch many goroutines doing Register / Unregister / Broadcast.
	//       Run with `go test -race -tags=learning ./...` to detect races.
}

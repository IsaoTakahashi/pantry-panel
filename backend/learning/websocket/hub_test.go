//go:build learning

package websocket

import (
	"sync"
	"testing"
)

func TestHub(t *testing.T) {
	t.Run("new_hub_empty", func(t *testing.T) {
		if got := NewHub().Len(); got != 0 {
			t.Errorf("NewHub().Len() = %d, want 0", got)
		}
	})

	t.Run("register_adds_client", func(t *testing.T) {
		hub := NewHub()
		c := &Client{Send: make(chan []byte, 1)}
		hub.Register(c)
		if got := hub.Len(); got != 1 {
			t.Errorf("After Register, hub.Len() = %d, want 1", got)
		}
	})

	t.Run("unregister_removes_client", func(t *testing.T) {
		hub := NewHub()
		c := &Client{Send: make(chan []byte, 1)}
		hub.Register(c)
		hub.Unregister(c)
		if got := hub.Len(); got != 0 {
			t.Errorf("After Unregister, hub.Len() = %d, want 0", got)
		}
	})

	t.Run("broadcast_single_client", func(t *testing.T) {
		hub := NewHub()
		c := &Client{Send: make(chan []byte, 1)}
		hub.Register(c)
		hub.Broadcast([]byte("hello"))
		select {
		case msg := <-c.Send:
			if string(msg) != "hello" {
				t.Errorf("Received message = %q, want %q", msg, "hello")
			}
		default:
			t.Error("Expected to receive a message, but channel was empty")
		}
	})

	t.Run("broadcast_multiple_clients", func(t *testing.T) {
		hub := NewHub()
		c1 := &Client{Send: make(chan []byte, 1)}
		c2 := &Client{Send: make(chan []byte, 1)}
		hub.Register(c1)
		hub.Register(c2)

		hub.Broadcast([]byte("hello"))

		for i, c := range []*Client{c1, c2} {
			select {
			case msg := <-c.Send:
				if string(msg) != "hello" {
					t.Errorf("Client %d: Received message = %q, want %q", i+1, msg, "hello")
				}
			default:
				t.Errorf("Client %d: Expected to receive a message, but channel was empty", i+1)
			}
		}
	})

	t.Run("broadcast_full_channel_drops_client", func(t *testing.T) {
		hub := NewHub()
		c := &Client{Send: make(chan []byte)} // buffer size 0
		hub.Register(c)
		hub.Broadcast([]byte("hello"))
		if got := hub.Len(); got != 0 {
			t.Errorf("After broadcast to full channel, hub.Len() = %d, want 0", got)
		}
	})

	t.Run("concurrent_register_unregister", func(t *testing.T) {
		hub := NewHub()
		c := &Client{Send: make(chan []byte, 1)}

		var wg sync.WaitGroup
		wg.Add(2)

		go func() {
			defer wg.Done()
			for i := 0; i < 1000; i++ {
				hub.Register(c)
				hub.Unregister(c)
			}
		}()

		go func() {
			defer wg.Done()
			for i := 0; i < 1000; i++ {
				hub.Broadcast([]byte("hello"))
			}
		}()

		wg.Wait()
	})
}

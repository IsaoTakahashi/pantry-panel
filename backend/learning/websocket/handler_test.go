//go:build learning

package websocket

import "testing"

func TestHandler_RegistersOnConnect(t *testing.T) {
	// TODO:
	//   hub := NewHub()
	//   e := echo.New(); e.GET("/ws", Handler(hub))
	//   srv := httptest.NewServer(e)
	//   defer srv.Close()
	//   wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"
	//   conn, _, err := wsClient.Dial(ctx, wsURL, nil)
	//   require.NoError; defer conn.Close
	//   eventually assert hub.Len() == 1
}

func TestHandler_UnregistersOnDisconnect(t *testing.T) {
	// TODO: connect, then conn.Close; eventually assert hub.Len() == 0
}

func TestHandler_BroadcastReachesClient(t *testing.T) {
	// TODO: connect; hub.Broadcast([]byte(`{"type":"x"}`));
	//       conn.Read returns that message
}

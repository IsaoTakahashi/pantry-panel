//go:build learning

package websocket_test

// Integration test: real Postgres (testcontainers) + Hub + PgListener + handler + WS client.
//
// Steps:
//   1) start postgres testcontainer (see backend/repository/repository_integration_test.go for an example)
//   2) apply base migration (001_create_stock_items.sql) and learning migration (learning_001_stock_items_notify.sql)
//   3) ctx, cancel := context.WithCancel(context.Background()); defer cancel()
//   4) hub := websocket.NewHub()
//   5) listener := websocket.NewPgListener(dsn, "stock_items_changed", func(p string) { hub.Broadcast([]byte(p)) })
//      go listener.Run(ctx)
//   6) e := echo.New(); e.GET("/ws", websocket.Handler(hub))
//      srv := httptest.NewServer(e); defer srv.Close()
//   7) connect ws client
//   8) execute INSERT INTO stock_items (...)
//   9) read from ws within 5s timeout, parse JSON, assert type/payload
//
// TODO: implement the test function `TestIntegration_NotifyToBroadcast(t *testing.T)`.

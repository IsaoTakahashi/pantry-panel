//go:build learning

// Command server is the learning entrypoint that wires up the Hub, PgListener,
// and Echo /ws handler. Run with:
//
//	go run -tags=learning ./learning/cmd/server
//
// It expects DATABASE_URL to point at a local Postgres with the learning
// migration applied. PORT defaults to 8080.
package main

// TODO: implement main()
//   1) ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM); defer cancel()
//   2) read DATABASE_URL (default to local compose)
//   3) hub := websocket.NewHub()
//   4) listener := websocket.NewPgListener(dsn, "stock_items_changed", func(p string) { hub.Broadcast([]byte(p)) })
//      go listener.Run(ctx)
//   5) e := echo.New(); e.GET("/ws", websocket.Handler(hub))
//   6) e.Start(":" + os.Getenv("PORT"))  // PORT default "8080"

func main() {
}

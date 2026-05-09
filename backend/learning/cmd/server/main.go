//go:build learning

// Command server is the learning entrypoint that wires up the Hub, PgListener,
// and Echo /ws handler. Run with:
//
//	go run -tags=learning ./learning/cmd/server
//
// It expects DATABASE_URL to point at a local Postgres with the learning
// migration applied. PORT defaults to 8080.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/IsaoTakahashi/pantry-panel/backend/learning/websocket"
	"github.com/labstack/echo/v5"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://pantry:pantry@localhost:5432/pantry_panel?sslmode=disable"
	}

	hub := websocket.NewHub()
	listener := websocket.NewPgListener(dsn, "stock_items_changed", func(p string) { hub.Broadcast([]byte(p)) })

	go listener.Run(ctx)

	e := echo.New()
	e.GET("/ws", websocket.Handler(hub))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	sc := echo.StartConfig{
		Address: ":" + port,
	}

	if err := sc.Start(ctx, e); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

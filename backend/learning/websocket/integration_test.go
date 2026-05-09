//go:build learning

package websocket

import (
	"context"
	"log"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	cws "github.com/coder/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

var testPool *pgxpool.Pool
var connStr string

func TestMain(m *testing.M) {
	ctx := context.Background()

	pgContainer, err := postgres.Run(ctx,
		"postgres:18",
		postgres.WithDatabase("pantry_panel_test"),
		postgres.WithUsername("test"),
		postgres.WithPassword("test"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2),
		),
	)
	if err != nil {
		log.Fatal(err)
	}

	connStr, err = pgContainer.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		log.Fatal(err)
	}

	testPool, err = pgxpool.New(context.Background(), connStr)
	if err != nil {
		log.Fatalf("failed to connect to test database: %v", err)
	}

	sqlBytes1, err := os.ReadFile("../../db/migrations/001_create_stock_items.sql")
	if err != nil {
		log.Fatal(err)
	}
	_, err = testPool.Exec(context.Background(), string(sqlBytes1))
	if err != nil {
		log.Fatalf("failed to apply migration: %v", err)
	}

	sqlBytes2, err := os.ReadFile("../../db/migrations/learning_001_stock_items_notify.sql")
	if err != nil {
		log.Fatal(err)
	}
	_, err = testPool.Exec(context.Background(), string(sqlBytes2))
	if err != nil {
		log.Fatalf("failed to apply migration: %v", err)
	}

	_, err = testPool.Exec(ctx, "TRUNCATE stock_items")
	if err != nil {
		log.Fatal(err)
	}

	code := m.Run()

	testPool.Close()
	if err := pgContainer.Terminate(ctx); err != nil {
		log.Printf("failed to terminate test container: %v", err)
	}

	os.Exit(code)
}

func TestIntegration_NotifyToBroadcast(t *testing.T) {

	// 2. Hub + PgListener 起動
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	hub := NewHub()
	listener := NewPgListener(connStr, "stock_items_changed", func(p string) {
		hub.Broadcast([]byte(p))
	})
	go listener.Run(ctx)
	time.Sleep(300 * time.Millisecond)

	// 3. Echo サーバー起動
	e := echo.New()
	e.GET("/ws", Handler(hub))
	srv := httptest.NewServer(e)
	defer srv.Close()

	// 4. WS クライアント接続
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"
	conn, _, err := cws.Dial(ctx, wsURL, nil)
	require.NoError(t, err)
	defer conn.Close(cws.StatusNormalClosure, "")

	assert.Eventually(t, func() bool {
		return hub.Len() == 1
	}, time.Second, 10*time.Millisecond)

	// 5. INSERT
	_, err = testPool.Exec(ctx, `INSERT INTO stock_items (name, category) VALUES ('醤油', '調味料')`)
	require.NoError(t, err)

	// 6. WS で受信 → アサート
	readCtx, readCancel := context.WithTimeout(ctx, 5*time.Second)
	defer readCancel()

	_, msg, err := conn.Read(readCtx)
	require.NoError(t, err)
	assert.Contains(t, string(msg), "stock_items.created")
}

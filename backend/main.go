package main

import (
	"log"
	"os"

	"github.com/IsaoTakahashi/pantry-panel/backend/db"
	"github.com/IsaoTakahashi/pantry-panel/backend/handler"
	"github.com/labstack/echo/v5"
	"github.com/labstack/echo/v5/middleware"
)

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://pantry:pantry@localhost:5432/pantry_panel?sslmode=disable"
	}

	conn, err := db.Connect(dsn)

	if err != nil {
		log.Fatal(err)
	}
	if err := db.Ping(conn); err != nil {
		log.Fatal(err)
	}

	e := echo.New()
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"http://localhost:3000"},
	}))

	e.GET("/health", handler.HealthCheck(conn))

	if err := e.Start(":8080"); err != nil {
		log.Fatal(err)
	}
}

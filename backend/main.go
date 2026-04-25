package main

import (
	"log"
	"os"

	"github.com/IsaoTakahashi/pantry-panel/backend/db"
	"github.com/IsaoTakahashi/pantry-panel/backend/handler"
	"github.com/IsaoTakahashi/pantry-panel/backend/repository"
	"github.com/labstack/echo/v5"
	"github.com/labstack/echo/v5/middleware"
)

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://pantry:pantry@localhost:5432/pantry_panel?sslmode=disable"
	}

	pool, err := db.Connect(dsn)

	if err != nil {
		log.Fatal(err)
	}
	if err := db.Ping(pool); err != nil {
		log.Fatal(err)
	}

	stockItemRepo := repository.NewPgStockItemRepository(pool)
	stockItemHandler := handler.NewStockItemHandler(stockItemRepo)

	e := echo.New()
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"http://localhost:3000"},
	}))

	e.GET("/health", handler.HealthCheck(pool))
	e.GET("/api/stock-items", stockItemHandler.List)
	e.POST("/api/stock-items", stockItemHandler.Create)
	e.PATCH("/api/stock-items/:id", stockItemHandler.Update)
	e.DELETE("/api/stock-items/:id", stockItemHandler.Delete)

	if err := e.Start(":8080"); err != nil {
		log.Fatal(err)
	}
}

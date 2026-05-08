package main

import (
	"log"
	"os"
	"strings"

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
		AllowOrigins: parseCORSAllowedOrigins(os.Getenv("CORS_ALLOWED_ORIGINS")),
	}))

	e.GET("/health", handler.HealthCheck(pool))
	e.GET("/api/stock-items", stockItemHandler.List)
	e.POST("/api/stock-items", stockItemHandler.Create)
	e.PATCH("/api/stock-items/:id", stockItemHandler.Update)
	e.DELETE("/api/stock-items/:id", stockItemHandler.Delete)

	if err := e.Start(":" + parsePort(os.Getenv("PORT"))); err != nil {
		log.Fatal(err)
	}
}

func parsePort(env string) string {
	if env == "" {
		return "8080"
	}
	return env
}

func parseCORSAllowedOrigins(env string) []string {
	if env == "" {
		return []string{"http://localhost:3000"}
	}
	parts := strings.Split(env, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	if len(out) == 0 {
		return []string{"http://localhost:3000"}
	}
	return out
}

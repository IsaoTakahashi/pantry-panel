package handler

import (
	"context"
	"net/http"

	"github.com/labstack/echo/v5"
)

// Pinger is implemented by anything that can verify a database connection.
type Pinger interface {
	Ping(ctx context.Context) error
}

// HealthCheck returns an Echo handler that reports database connectivity status.
func HealthCheck(p Pinger) func(c *echo.Context) error {
	return func(c *echo.Context) error {
		if err := p.Ping(c.Request().Context()); err != nil {
			return c.JSON(http.StatusServiceUnavailable, map[string]string{"status": "error", "db": "disconnected"})
		}
		return c.JSON(http.StatusOK, map[string]string{"status": "ok", "db": "connected"})
	}
}

package handler

import (
	"context"
	"net/http"

	"github.com/labstack/echo/v5"
)

type Pinger interface {
	Ping(ctx context.Context) error
}

func HealthCheck(p Pinger) func(c *echo.Context) error {
	return func(c *echo.Context) error {
		if err := p.Ping(c.Request().Context()); err != nil {
			return c.JSON(http.StatusServiceUnavailable, map[string]string{"status": "error", "db": "disconnected"})
		}
		return c.JSON(http.StatusOK, map[string]string{"status": "ok", "db": "connected"})
	}
}

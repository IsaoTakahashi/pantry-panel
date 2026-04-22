package handler

import (
	"net/http"

	"github.com/labstack/echo/v5"
)

type Pinger interface {
	Ping() error
}

func HealthCheck(p Pinger) func(c *echo.Context) error {
	return func(c *echo.Context) error {
		if err := p.Ping(); err != nil {
			return c.JSON(http.StatusServiceUnavailable, map[string]string{"status": "error", "db": "disconnected"})
		}
		return c.JSON(http.StatusOK, map[string]string{"status": "ok", "db": "connected"})
	}
}

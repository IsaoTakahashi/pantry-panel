package main

import (
	"log"
	"net/http"

	"github.com/labstack/echo/v5"
)

func main() {
	e := echo.New()

	e.GET("/", func(c *echo.Context) error {
		return c.String(http.StatusOK, "Healthy")
	})

	if err := e.Start(":8080"); err != nil {
		log.Fatal(err)
	}
}

package main

import (
	"fmt"
	"log"
	"os"
	"regexp"
	"strings"

	"github.com/IsaoTakahashi/pantry-panel/backend/db"
	"github.com/IsaoTakahashi/pantry-panel/backend/handler"
	"github.com/IsaoTakahashi/pantry-panel/backend/imagesearch"
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

	var imageClient imagesearch.Client
	googleKey := os.Getenv("GOOGLE_CSE_API_KEY")
	googleCSE := os.Getenv("GOOGLE_CSE_ID")
	if googleKey != "" && googleCSE != "" {
		imageClient = imagesearch.NewGoogleClient(googleKey, googleCSE)
	} else {
		log.Println("warning: GOOGLE_CSE_API_KEY / GOOGLE_CSE_ID not set; image search disabled")
	}
	imageSearchHandler := handler.NewImageSearchHandler(imageClient)

	matcher, err := compileOriginMatcher(parseCORSAllowedOrigins(os.Getenv("CORS_ALLOWED_ORIGINS")))
	if err != nil {
		log.Fatal(err)
	}

	e := echo.New()
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		UnsafeAllowOriginFunc: func(c *echo.Context, origin string) (string, bool, error) {
			if matcher(origin) {
				return origin, true, nil
			}
			return "", false, nil
		},
	}))

	e.GET("/health", handler.HealthCheck(pool))
	e.GET("/api/stock-items", stockItemHandler.List)
	e.GET("/api/stock-items/image-search", imageSearchHandler.Search)
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

func compileOriginMatcher(patterns []string) (func(origin string) bool, error) {
	type rule struct {
		exact string
		regex *regexp.Regexp
	}

	rules := make([]rule, 0, len(patterns))
	for _, p := range patterns {
		lower := strings.ToLower(p)
		if !strings.Contains(lower, "*") {
			rules = append(rules, rule{exact: lower})
			continue
		}

		escaped := regexp.QuoteMeta(lower)
		regexStr := strings.ReplaceAll(escaped, `\*`, `[^.]*`)
		compiled, err := regexp.Compile("^" + regexStr + "$")
		if err != nil {
			return nil, fmt.Errorf("invalid CORS pattern %q: %w", p, err)
		}
		rules = append(rules, rule{regex: compiled})
	}

	return func(origin string) bool {
		lower := strings.ToLower(origin)
		for _, r := range rules {
			if r.regex != nil {
				if r.regex.MatchString(lower) {
					return true
				}
			} else if r.exact == lower {
				return true
			}
		}
		return false
	}, nil
}

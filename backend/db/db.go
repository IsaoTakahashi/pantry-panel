// Package db provides helpers for connecting to and pinging the PostgreSQL pool.
package db

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Connect creates a new pgxpool connection to the given DSN and returns it.
func Connect(dsn string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		return nil, err
	}

	return pool, nil
}

// Ping verifies that the pool can reach the database.
func Ping(pool *pgxpool.Pool) error {
	return pool.Ping(context.Background())
}

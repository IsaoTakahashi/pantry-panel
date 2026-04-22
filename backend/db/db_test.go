package db

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
)

func TestConnectAndPing(t *testing.T) {
	ctx := context.Background()
	container, err := postgres.Run(ctx,
		"postgres:18",
		postgres.WithDatabase("test_db"),
		postgres.WithUsername("test"),
		postgres.WithPassword("test"),
		postgres.BasicWaitStrategies())
	require.NoError(t, err)
	defer container.Terminate(ctx)

	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err)

	db, err := Connect(dsn)
	require.NoError(t, err)
	assert.NoError(t, Ping(db))

}

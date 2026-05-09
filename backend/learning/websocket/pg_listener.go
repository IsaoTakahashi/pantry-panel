//go:build learning

package websocket

import (
	"context"
	"time"
)

// PgListener subscribes to a PostgreSQL channel via LISTEN/NOTIFY and invokes
// onMessage for each notification payload. It auto-reconnects with exponential
// backoff on connection failures.
type PgListener struct {
	dsn       string
	channel   string
	onMessage func(payload string)
}

// NewPgListener creates a listener. onMessage MUST NOT be nil.
func NewPgListener(dsn, channel string, onMessage func(string)) *PgListener {
	// TODO: implement
	return nil
}

// Run blocks until ctx is done. It connects, LISTENs on the channel, reads
// notifications and calls onMessage. On disconnect, it sleeps via computeBackoff
// then reconnects.
//
// Use go listener.Run(ctx) and cancel ctx to stop.
func (l *PgListener) Run(ctx context.Context) {
	// TODO: implement
	//   for { check ctx; connect (pgx.Connect); LISTEN; for { wait notification or ctx done; onMessage(payload) }; on error: sleep computeBackoff; }
}

// computeBackoff returns the wait duration for the given attempt index.
// Schedule: [500ms, 1s, 2s, 5s, 10s, 10s, 10s, ...]
//
// Exposed for unit testing.
func computeBackoff(attempt int) time.Duration {
	// TODO: implement
	return 0
}

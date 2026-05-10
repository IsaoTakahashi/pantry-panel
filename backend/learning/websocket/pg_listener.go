//go:build learning

package websocket

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
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
	return &PgListener{
		dsn:       dsn,
		channel:   channel,
		onMessage: onMessage,
	}
}

// Run blocks until ctx is done. It connects, LISTENs on the channel, reads
// notifications and calls onMessage. On disconnect, it sleeps via computeBackoff
// then reconnects.
//
// Use go listener.Run(ctx) and cancel ctx to stop.
func (l *PgListener) Run(ctx context.Context) {
	for attempt := 0; ; attempt++ {
		select {
		case <-ctx.Done():
			return
		default:
		}

		conn, err := pgx.Connect(ctx, l.dsn)
		if err != nil {
			time.Sleep(computeBackoff(attempt))
			continue
		}

		_, err = conn.Exec(ctx, "LISTEN "+l.channel)
		if err != nil {
			conn.Close(ctx)
			time.Sleep(computeBackoff(attempt))
			continue
		}

		attempt = 0
		for {
			select {
			case <-ctx.Done():
				conn.Close(ctx)
				return
			default:
			}

			notification, err := conn.WaitForNotification(ctx)
			if err != nil {
				conn.Close(ctx)
				time.Sleep(computeBackoff(attempt))
				break
			}
			l.onMessage(notification.Payload)
		}
	}
}

// computeBackoff returns the wait duration for the given attempt index.
// Schedule: [500ms, 1s, 2s, 5s, 10s, 10s, 10s, ...]
//
// Exposed for unit testing.
func computeBackoff(attempt int) time.Duration {
	switch {
	case attempt <= 0:
		return 500 * time.Millisecond
	case attempt == 1:
		return 1 * time.Second
	case attempt == 2:
		return 2 * time.Second
	case attempt == 3:
		return 5 * time.Second
	default:
		return 10 * time.Second
	}
}

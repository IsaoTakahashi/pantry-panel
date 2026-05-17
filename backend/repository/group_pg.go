package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PgGroupRepository struct {
	pool *pgxpool.Pool
}

func NewPgGroupRepository(pool *pgxpool.Pool) *PgGroupRepository {
	return &PgGroupRepository{pool: pool}
}

func (r *PgGroupRepository) FindMembershipByUserID(ctx context.Context, userID uuid.UUID) (*GroupMembership, error) {
	rows, _ := r.pool.Query(ctx,
		`SELECT g.id, g.name, gm.role
		 FROM group_members gm
		 JOIN groups g ON g.id = gm.group_id
		 WHERE gm.user_id = $1
		 LIMIT 1`,
		userID)

	type row struct {
		GroupID uuid.UUID `db:"id"`
		Name    string    `db:"name"`
		Role    string    `db:"role"`
	}
	r2, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[row])
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &GroupMembership{GroupID: r2.GroupID, Name: r2.Name, Role: r2.Role}, nil
}

func (r *PgGroupRepository) CreateGroup(ctx context.Context, name string, ownerID uuid.UUID) (*Group, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var group Group
	err = tx.QueryRow(ctx,
		"INSERT INTO groups (name) VALUES ($1) RETURNING id, name, created_at",
		name).Scan(&group.ID, &group.Name, &group.CreatedAt)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx,
		"INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner')",
		group.ID, ownerID)
	if err != nil {
		return nil, err
	}

	return &group, tx.Commit(ctx)
}

func (r *PgGroupRepository) CreateInvitation(ctx context.Context, groupID, createdBy uuid.UUID, ttl time.Duration) (*Invitation, error) {
	expiresAt := time.Now().Add(ttl)
	rows, _ := r.pool.Query(ctx,
		`INSERT INTO invitations (group_id, created_by, expires_at)
		 VALUES ($1, $2, $3)
		 RETURNING token, group_id, created_by, expires_at, use_count, created_at`,
		groupID, createdBy, expiresAt)

	type inv struct {
		Token     uuid.UUID `db:"token"`
		GroupID   uuid.UUID `db:"group_id"`
		CreatedBy uuid.UUID `db:"created_by"`
		ExpiresAt time.Time `db:"expires_at"`
		UseCount  int       `db:"use_count"`
		CreatedAt time.Time `db:"created_at"`
	}
	r2, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[inv])
	if err != nil {
		return nil, err
	}
	return &Invitation{
		Token: r2.Token, GroupID: r2.GroupID, CreatedBy: r2.CreatedBy,
		ExpiresAt: r2.ExpiresAt, UseCount: r2.UseCount, CreatedAt: r2.CreatedAt,
	}, nil
}

func (r *PgGroupRepository) FindInvitation(ctx context.Context, token uuid.UUID) (*Invitation, error) {
	rows, _ := r.pool.Query(ctx,
		`SELECT token, group_id, created_by, expires_at, use_count, created_at
		 FROM invitations WHERE token = $1`,
		token)

	type inv struct {
		Token     uuid.UUID `db:"token"`
		GroupID   uuid.UUID `db:"group_id"`
		CreatedBy uuid.UUID `db:"created_by"`
		ExpiresAt time.Time `db:"expires_at"`
		UseCount  int       `db:"use_count"`
		CreatedAt time.Time `db:"created_at"`
	}
	r2, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[inv])
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &Invitation{
		Token: r2.Token, GroupID: r2.GroupID, CreatedBy: r2.CreatedBy,
		ExpiresAt: r2.ExpiresAt, UseCount: r2.UseCount, CreatedAt: r2.CreatedAt,
	}, nil
}

func (r *PgGroupRepository) AcceptInvitation(ctx context.Context, token, userID uuid.UUID) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var groupID uuid.UUID
	var expiresAt time.Time
	err = tx.QueryRow(ctx,
		"SELECT group_id, expires_at FROM invitations WHERE token = $1 FOR UPDATE",
		token).Scan(&groupID, &expiresAt)
	if err == pgx.ErrNoRows {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if time.Now().After(expiresAt) {
		return ErrInvitationExpired
	}

	_, err = tx.Exec(ctx,
		"INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING",
		groupID, userID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx,
		"UPDATE invitations SET use_count = use_count + 1 WHERE token = $1",
		token)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

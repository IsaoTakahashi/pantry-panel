package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	ErrNotFound          = errors.New("not found")
	ErrInvitationExpired = errors.New("invitation expired")
)

type Group struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
}

type GroupMembership struct {
	GroupID uuid.UUID `json:"groupId"`
	Name    string    `json:"name"`
	Role    string    `json:"role"` // "owner" | "member"
}

type Invitation struct {
	Token     uuid.UUID `json:"token"`
	GroupID   uuid.UUID `json:"groupId"`
	CreatedBy uuid.UUID `json:"createdBy"`
	ExpiresAt time.Time `json:"expiresAt"`
	UseCount  int       `json:"useCount"`
	CreatedAt time.Time `json:"createdAt"`
}

type GroupRepository interface {
	// FindMembershipByUserID はユーザーが所属するグループを返す。未所属なら nil, nil を返す。
	FindMembershipByUserID(ctx context.Context, userID uuid.UUID) (*GroupMembership, error)

	// CreateGroup は新しいグループを作成し、ownerID を owner として追加する。
	CreateGroup(ctx context.Context, name string, ownerID uuid.UUID) (*Group, error)

	// CreateInvitation は有効期限付き招待トークンを生成する。
	CreateInvitation(ctx context.Context, groupID, createdBy uuid.UUID, ttl time.Duration) (*Invitation, error)

	// FindInvitation はトークンで招待を検索する。見つからなければ ErrNotFound を返す。
	FindInvitation(ctx context.Context, token uuid.UUID) (*Invitation, error)

	// AcceptInvitation は招待を承認してユーザーをグループに追加する。
	// 既にメンバーなら冪等（エラーなし）。期限切れなら ErrInvitationExpired を返す。
	AcceptInvitation(ctx context.Context, token, userID uuid.UUID) error
}

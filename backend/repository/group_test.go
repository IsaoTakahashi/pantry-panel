package repository

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupGroupTestDB(t *testing.T) *PgGroupRepository {
	t.Helper()
	_, err := testPool.Exec(context.Background(),
		"TRUNCATE invitations, group_members, groups CASCADE")
	require.NoError(t, err)
	return NewPgGroupRepository(testPool)
}

func TestCreateGroup_Success(t *testing.T) {
	repo := setupGroupTestDB(t)
	ownerID := uuid.New()

	group, err := repo.CreateGroup(context.Background(), "我が家", ownerID)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, group.ID)
	assert.Equal(t, "我が家", group.Name)

	// owner として登録されていること
	membership, err := repo.FindMembershipByUserID(context.Background(), ownerID)
	require.NoError(t, err)
	require.NotNil(t, membership)
	assert.Equal(t, group.ID, membership.GroupID)
	assert.Equal(t, "owner", membership.Role)
}

func TestFindMembershipByUserID_NotMember(t *testing.T) {
	repo := setupGroupTestDB(t)

	membership, err := repo.FindMembershipByUserID(context.Background(), uuid.New())
	require.NoError(t, err)
	assert.Nil(t, membership)
}

func TestCreateInvitation_AndFind(t *testing.T) {
	repo := setupGroupTestDB(t)
	ownerID := uuid.New()
	group, _ := repo.CreateGroup(context.Background(), "テスト家族", ownerID)

	inv, err := repo.CreateInvitation(context.Background(), group.ID, ownerID, 7*24*time.Hour)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, inv.Token)
	assert.True(t, inv.ExpiresAt.After(time.Now()))
	assert.Equal(t, 0, inv.UseCount)

	found, err := repo.FindInvitation(context.Background(), inv.Token)
	require.NoError(t, err)
	assert.Equal(t, inv.Token, found.Token)
}

func TestFindInvitation_NotFound(t *testing.T) {
	repo := setupGroupTestDB(t)

	_, err := repo.FindInvitation(context.Background(), uuid.New())
	assert.ErrorIs(t, err, ErrNotFound)
}

func TestAcceptInvitation_Success(t *testing.T) {
	repo := setupGroupTestDB(t)
	ownerID := uuid.New()
	group, _ := repo.CreateGroup(context.Background(), "テスト家族", ownerID)
	inv, _ := repo.CreateInvitation(context.Background(), group.ID, ownerID, 7*24*time.Hour)

	newMemberID := uuid.New()
	err := repo.AcceptInvitation(context.Background(), inv.Token, newMemberID)
	require.NoError(t, err)

	membership, err := repo.FindMembershipByUserID(context.Background(), newMemberID)
	require.NoError(t, err)
	require.NotNil(t, membership)
	assert.Equal(t, group.ID, membership.GroupID)
	assert.Equal(t, "member", membership.Role)

	// use_count が増加していること
	updated, _ := repo.FindInvitation(context.Background(), inv.Token)
	assert.Equal(t, 1, updated.UseCount)
}

func TestAcceptInvitation_Idempotent(t *testing.T) {
	repo := setupGroupTestDB(t)
	ownerID := uuid.New()
	group, _ := repo.CreateGroup(context.Background(), "テスト家族", ownerID)
	inv, _ := repo.CreateInvitation(context.Background(), group.ID, ownerID, 7*24*time.Hour)
	memberID := uuid.New()

	require.NoError(t, repo.AcceptInvitation(context.Background(), inv.Token, memberID))
	// 2回目は冪等（エラーなし）
	require.NoError(t, repo.AcceptInvitation(context.Background(), inv.Token, memberID))
}

func TestAcceptInvitation_Expired(t *testing.T) {
	repo := setupGroupTestDB(t)
	ownerID := uuid.New()
	group, _ := repo.CreateGroup(context.Background(), "テスト家族", ownerID)
	// TTL を -1 時間にして有効期限切れトークンを作成
	inv, _ := repo.CreateInvitation(context.Background(), group.ID, ownerID, -time.Hour)

	err := repo.AcceptInvitation(context.Background(), inv.Token, uuid.New())
	assert.ErrorIs(t, err, ErrInvitationExpired)
}

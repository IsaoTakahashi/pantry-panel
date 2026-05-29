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

func TestCreateGroup(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := setupGroupTestDB(t)
		ownerID := uuid.New()

		group, err := repo.CreateGroup(context.Background(), "我が家", ownerID)
		require.NoError(t, err)
		assert.NotEqual(t, uuid.Nil, group.ID)
		assert.Equal(t, "我が家", group.Name)

		memberships, err := repo.FindMembershipsByUserID(context.Background(), ownerID)
		require.NoError(t, err)
		require.Len(t, memberships, 1)
		assert.Equal(t, group.ID, memberships[0].GroupID)
		assert.Equal(t, "owner", memberships[0].Role)
	})
}

func TestFindMembershipsByUserID(t *testing.T) {
	t.Run("not_member", func(t *testing.T) {
		repo := setupGroupTestDB(t)

		memberships, err := repo.FindMembershipsByUserID(context.Background(), uuid.New())
		require.NoError(t, err)
		assert.Empty(t, memberships)
	})

	t.Run("multiple_groups", func(t *testing.T) {
		repo := setupGroupTestDB(t)
		userID := uuid.New()

		group1, err := repo.CreateGroup(context.Background(), "我が家", userID)
		require.NoError(t, err)
		group2, err := repo.CreateGroup(context.Background(), "実家", uuid.New())
		require.NoError(t, err)
		inv, err := repo.CreateInvitation(context.Background(), group2.ID, uuid.New(), 7*24*time.Hour)
		require.NoError(t, err)
		require.NoError(t, repo.AcceptInvitation(context.Background(), inv.Token, userID))

		memberships, err := repo.FindMembershipsByUserID(context.Background(), userID)
		require.NoError(t, err)
		require.Len(t, memberships, 2)

		ids := []uuid.UUID{memberships[0].GroupID, memberships[1].GroupID}
		assert.Contains(t, ids, group1.ID)
		assert.Contains(t, ids, group2.ID)
	})
}

func TestUpdateGroupName(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := setupGroupTestDB(t)
		ownerID := uuid.New()
		group, err := repo.CreateGroup(context.Background(), "旧名前", ownerID)
		require.NoError(t, err)

		updated, err := repo.UpdateGroupName(context.Background(), group.ID, "新しい名前")
		require.NoError(t, err)
		assert.Equal(t, group.ID, updated.ID)
		assert.Equal(t, "新しい名前", updated.Name)
	})

	t.Run("not_found", func(t *testing.T) {
		repo := setupGroupTestDB(t)

		_, err := repo.UpdateGroupName(context.Background(), uuid.New(), "名前")
		assert.ErrorIs(t, err, ErrNotFound)
	})
}

func TestCreateInvitation(t *testing.T) {
	t.Run("and_find", func(t *testing.T) {
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
	})
}

func TestFindInvitation(t *testing.T) {
	t.Run("not_found", func(t *testing.T) {
		repo := setupGroupTestDB(t)

		_, err := repo.FindInvitation(context.Background(), uuid.New())
		assert.ErrorIs(t, err, ErrNotFound)
	})
}

func TestAcceptInvitation(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := setupGroupTestDB(t)
		ownerID := uuid.New()
		group, _ := repo.CreateGroup(context.Background(), "テスト家族", ownerID)
		inv, _ := repo.CreateInvitation(context.Background(), group.ID, ownerID, 7*24*time.Hour)

		newMemberID := uuid.New()
		err := repo.AcceptInvitation(context.Background(), inv.Token, newMemberID)
		require.NoError(t, err)

		memberships, err := repo.FindMembershipsByUserID(context.Background(), newMemberID)
		require.NoError(t, err)
		require.Len(t, memberships, 1)
		assert.Equal(t, group.ID, memberships[0].GroupID)
		assert.Equal(t, "member", memberships[0].Role)

		updated, _ := repo.FindInvitation(context.Background(), inv.Token)
		assert.Equal(t, 1, updated.UseCount)
	})

	t.Run("idempotent", func(t *testing.T) {
		repo := setupGroupTestDB(t)
		ownerID := uuid.New()
		group, _ := repo.CreateGroup(context.Background(), "テスト家族", ownerID)
		inv, _ := repo.CreateInvitation(context.Background(), group.ID, ownerID, 7*24*time.Hour)
		memberID := uuid.New()

		require.NoError(t, repo.AcceptInvitation(context.Background(), inv.Token, memberID))
		require.NoError(t, repo.AcceptInvitation(context.Background(), inv.Token, memberID))
	})

	t.Run("expired", func(t *testing.T) {
		repo := setupGroupTestDB(t)
		ownerID := uuid.New()
		group, _ := repo.CreateGroup(context.Background(), "テスト家族", ownerID)
		inv, _ := repo.CreateInvitation(context.Background(), group.ID, ownerID, -time.Hour)

		err := repo.AcceptInvitation(context.Background(), inv.Token, uuid.New())
		assert.ErrorIs(t, err, ErrInvitationExpired)
	})
}

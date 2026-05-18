package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/IsaoTakahashi/pantry-panel/backend/middleware"
	"github.com/IsaoTakahashi/pantry-panel/backend/repository"
	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockGroupRepo struct {
	findMembershipFn   func(ctx context.Context, userID uuid.UUID) (*repository.GroupMembership, error)
	createGroupFn      func(ctx context.Context, name string, ownerID uuid.UUID) (*repository.Group, error)
	createInvitationFn func(ctx context.Context, groupID, createdBy uuid.UUID, ttl time.Duration) (*repository.Invitation, error)
	findInvitationFn   func(ctx context.Context, token uuid.UUID) (*repository.Invitation, error)
	acceptInvitationFn func(ctx context.Context, token, userID uuid.UUID) error
}

func (m *mockGroupRepo) FindMembershipByUserID(ctx context.Context, userID uuid.UUID) (*repository.GroupMembership, error) {
	return m.findMembershipFn(ctx, userID)
}
func (m *mockGroupRepo) CreateGroup(ctx context.Context, name string, ownerID uuid.UUID) (*repository.Group, error) {
	return m.createGroupFn(ctx, name, ownerID)
}
func (m *mockGroupRepo) CreateInvitation(ctx context.Context, groupID, createdBy uuid.UUID, ttl time.Duration) (*repository.Invitation, error) {
	return m.createInvitationFn(ctx, groupID, createdBy, ttl)
}
func (m *mockGroupRepo) FindInvitation(ctx context.Context, token uuid.UUID) (*repository.Invitation, error) {
	return m.findInvitationFn(ctx, token)
}
func (m *mockGroupRepo) AcceptInvitation(ctx context.Context, token, userID uuid.UUID) error {
	return m.acceptInvitationFn(ctx, token, userID)
}

func setupGroupRouter(h *GroupHandler) *echo.Echo {
	e := echo.New()
	e.POST("/api/groups", h.CreateGroup)
	e.GET("/api/groups/me", h.GetMyGroup)
	e.POST("/api/invitations", h.CreateInvitation)
	e.POST("/api/invitations/:token/accept", h.AcceptInvitation)
	return e
}

func TestCreateGroup_Success(t *testing.T) {
	userID := uuid.New()
	groupID := uuid.New()
	mock := &mockGroupRepo{
		findMembershipFn: func(_ context.Context, _ uuid.UUID) (*repository.GroupMembership, error) {
			return nil, nil // 未所属
		},
		createGroupFn: func(_ context.Context, name string, ownerID uuid.UUID) (*repository.Group, error) {
			return &repository.Group{ID: groupID, Name: name}, nil
		},
	}
	h := NewGroupHandler(mock)
	e := setupGroupRouter(h)

	body := `{"name":"我が家"}`
	req := httptest.NewRequest(http.MethodPost, "/api/groups", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	c := e.NewContext(req, rec)
	middleware.SetAuthInfo(c, &middleware.AuthInfo{UserID: userID})
	require.NoError(t, h.CreateGroup(c))

	assert.Equal(t, http.StatusCreated, rec.Code)
	var resp repository.Group
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
	assert.Equal(t, groupID, resp.ID)
	assert.Equal(t, "我が家", resp.Name)
}

func TestCreateGroup_AlreadyMember(t *testing.T) {
	userID := uuid.New()
	mock := &mockGroupRepo{
		findMembershipFn: func(_ context.Context, _ uuid.UUID) (*repository.GroupMembership, error) {
			return &repository.GroupMembership{GroupID: uuid.New(), Name: "家", Role: "owner"}, nil
		},
	}
	h := NewGroupHandler(mock)
	e := setupGroupRouter(h)

	body := `{"name":"新しい家"}`
	req := httptest.NewRequest(http.MethodPost, "/api/groups", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	c := e.NewContext(req, rec)
	middleware.SetAuthInfo(c, &middleware.AuthInfo{UserID: userID})
	require.NoError(t, h.CreateGroup(c))

	assert.Equal(t, http.StatusConflict, rec.Code)
}

func TestGetMyGroup_Success(t *testing.T) {
	userID := uuid.New()
	groupID := uuid.New()
	mock := &mockGroupRepo{
		findMembershipFn: func(_ context.Context, _ uuid.UUID) (*repository.GroupMembership, error) {
			return &repository.GroupMembership{GroupID: groupID, Name: "我が家", Role: "owner"}, nil
		},
	}
	h := NewGroupHandler(mock)
	e := setupGroupRouter(h)

	req := httptest.NewRequest(http.MethodGet, "/api/groups/me", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	middleware.SetAuthInfo(c, &middleware.AuthInfo{UserID: userID, GroupID: groupID, Role: "owner"})
	require.NoError(t, h.GetMyGroup(c))

	assert.Equal(t, http.StatusOK, rec.Code)
	var resp repository.GroupMembership
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
	assert.Equal(t, groupID, resp.GroupID)
	assert.Equal(t, "我が家", resp.Name)
}

func TestCreateInvitation_Success(t *testing.T) {
	userID := uuid.New()
	groupID := uuid.New()
	token := uuid.New()
	mock := &mockGroupRepo{
		createInvitationFn: func(_ context.Context, gID, cBy uuid.UUID, _ time.Duration) (*repository.Invitation, error) {
			return &repository.Invitation{
				Token:     token,
				GroupID:   gID,
				CreatedBy: cBy,
				ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
			}, nil
		},
	}
	h := NewGroupHandler(mock)
	e := setupGroupRouter(h)

	req := httptest.NewRequest(http.MethodPost, "/api/invitations", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	middleware.SetAuthInfo(c, &middleware.AuthInfo{UserID: userID, GroupID: groupID, Role: "owner"})
	require.NoError(t, h.CreateInvitation(c))

	assert.Equal(t, http.StatusCreated, rec.Code)
	var resp repository.Invitation
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
	assert.Equal(t, token, resp.Token)
}

func TestAcceptInvitation_Success(t *testing.T) {
	userID := uuid.New()
	token := uuid.New()
	mock := &mockGroupRepo{
		acceptInvitationFn: func(_ context.Context, tok, uid uuid.UUID) error {
			assert.Equal(t, token, tok)
			assert.Equal(t, userID, uid)
			return nil
		},
		findMembershipFn: func(_ context.Context, _ uuid.UUID) (*repository.GroupMembership, error) {
			return &repository.GroupMembership{GroupID: uuid.New(), Name: "家", Role: "member"}, nil
		},
	}
	h := NewGroupHandler(mock)
	e := setupGroupRouter(h)

	req := httptest.NewRequest(http.MethodPost, "/api/invitations/"+token.String()+"/accept", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPathValues(echo.PathValues{{Name: "token", Value: token.String()}})
	middleware.SetAuthInfo(c, &middleware.AuthInfo{UserID: userID})
	require.NoError(t, h.AcceptInvitation(c))

	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestAcceptInvitation_Expired(t *testing.T) {
	userID := uuid.New()
	token := uuid.New()
	mock := &mockGroupRepo{
		acceptInvitationFn: func(_ context.Context, _, _ uuid.UUID) error {
			return repository.ErrInvitationExpired
		},
	}
	h := NewGroupHandler(mock)
	e := setupGroupRouter(h)

	req := httptest.NewRequest(http.MethodPost, "/api/invitations/"+token.String()+"/accept", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPathValues(echo.PathValues{{Name: "token", Value: token.String()}})
	middleware.SetAuthInfo(c, &middleware.AuthInfo{UserID: userID})
	require.NoError(t, h.AcceptInvitation(c))

	assert.Equal(t, http.StatusGone, rec.Code)
}

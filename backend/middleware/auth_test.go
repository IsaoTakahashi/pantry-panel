package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/IsaoTakahashi/pantry-panel/backend/middleware"
	"github.com/IsaoTakahashi/pantry-panel/backend/repository"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var testSecret = []byte("test-secret-key")

func testKeyFunc(token *jwt.Token) (interface{}, error) {
	if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
		return nil, jwt.ErrSignatureInvalid
	}
	return testSecret, nil
}

func makeToken(t *testing.T, sub string, exp time.Time) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": sub,
		"exp": exp.Unix(),
	})
	s, err := token.SignedString(testSecret)
	require.NoError(t, err)
	return s
}

type mockGroupRepo struct {
	findFn func(ctx context.Context, userID uuid.UUID) (*repository.GroupMembership, error)
}

func (m *mockGroupRepo) FindMembershipByUserID(ctx context.Context, userID uuid.UUID) (*repository.GroupMembership, error) {
	return m.findFn(ctx, userID)
}
func (m *mockGroupRepo) CreateGroup(ctx context.Context, name string, ownerID uuid.UUID) (*repository.Group, error) {
	return nil, nil
}
func (m *mockGroupRepo) CreateInvitation(ctx context.Context, groupID, createdBy uuid.UUID, ttl time.Duration) (*repository.Invitation, error) {
	return nil, nil
}
func (m *mockGroupRepo) FindInvitation(ctx context.Context, token uuid.UUID) (*repository.Invitation, error) {
	return nil, nil
}
func (m *mockGroupRepo) AcceptInvitation(ctx context.Context, token, userID uuid.UUID) error {
	return nil
}

func setupMiddlewareTest(cfg middleware.JWTAuthConfig) (*echo.Echo, *httptest.ResponseRecorder) {
	e := echo.New()
	e.Use(middleware.NewJWTAuth(cfg))
	e.GET("/test", func(c *echo.Context) error {
		return c.String(http.StatusOK, "ok")
	})
	rec := httptest.NewRecorder()
	return e, rec
}

func TestJWTAuth_NoHeader(t *testing.T) {
	groupID := uuid.New()
	mock := &mockGroupRepo{
		findFn: func(_ context.Context, _ uuid.UUID) (*repository.GroupMembership, error) {
			return &repository.GroupMembership{GroupID: groupID, Name: "家", Role: "owner"}, nil
		},
	}
	e, rec := setupMiddlewareTest(middleware.JWTAuthConfig{
		KeyFunc:      testKeyFunc,
		GroupRepo:    mock,
		RequireGroup: true,
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	e.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestJWTAuth_InvalidToken(t *testing.T) {
	mock := &mockGroupRepo{
		findFn: func(_ context.Context, _ uuid.UUID) (*repository.GroupMembership, error) {
			return nil, nil
		},
	}
	e, rec := setupMiddlewareTest(middleware.JWTAuthConfig{
		KeyFunc:      testKeyFunc,
		GroupRepo:    mock,
		RequireGroup: false,
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer not-a-jwt")
	e.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestJWTAuth_ExpiredToken(t *testing.T) {
	userID := uuid.New()
	token := makeToken(t, userID.String(), time.Now().Add(-time.Hour)) // 期限切れ

	mock := &mockGroupRepo{
		findFn: func(_ context.Context, _ uuid.UUID) (*repository.GroupMembership, error) {
			return nil, nil
		},
	}
	e, rec := setupMiddlewareTest(middleware.JWTAuthConfig{
		KeyFunc:      testKeyFunc,
		GroupRepo:    mock,
		RequireGroup: false,
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	e.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestJWTAuth_ValidToken_WithGroup(t *testing.T) {
	userID := uuid.New()
	groupID := uuid.New()
	token := makeToken(t, userID.String(), time.Now().Add(time.Hour))

	mock := &mockGroupRepo{
		findFn: func(_ context.Context, uid uuid.UUID) (*repository.GroupMembership, error) {
			assert.Equal(t, userID, uid)
			return &repository.GroupMembership{GroupID: groupID, Name: "家", Role: "owner"}, nil
		},
	}

	var capturedInfo *middleware.AuthInfo
	e := echo.New()
	e.Use(middleware.NewJWTAuth(middleware.JWTAuthConfig{
		KeyFunc: testKeyFunc, GroupRepo: mock, RequireGroup: true,
	}))
	e.GET("/test", func(c *echo.Context) error {
		info, ok := middleware.GetAuthInfo(c)
		require.True(t, ok)
		capturedInfo = info
		return c.String(http.StatusOK, "ok")
	})
	rec := httptest.NewRecorder()

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	e.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	require.NotNil(t, capturedInfo)
	assert.Equal(t, userID, capturedInfo.UserID)
	assert.Equal(t, groupID, capturedInfo.GroupID)
	assert.Equal(t, "owner", capturedInfo.Role)
}

func TestJWTAuth_RequireGroup_NoGroup(t *testing.T) {
	userID := uuid.New()
	token := makeToken(t, userID.String(), time.Now().Add(time.Hour))

	mock := &mockGroupRepo{
		findFn: func(_ context.Context, _ uuid.UUID) (*repository.GroupMembership, error) {
			return nil, nil // グループ未所属
		},
	}
	e, rec := setupMiddlewareTest(middleware.JWTAuthConfig{
		KeyFunc:      testKeyFunc,
		GroupRepo:    mock,
		RequireGroup: true,
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	e.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusForbidden, rec.Code)
}

func TestJWTAuth_NoGroupRequired_NoGroup_Passes(t *testing.T) {
	userID := uuid.New()
	token := makeToken(t, userID.String(), time.Now().Add(time.Hour))

	mock := &mockGroupRepo{
		findFn: func(_ context.Context, _ uuid.UUID) (*repository.GroupMembership, error) {
			return nil, nil // グループ未所属でも通過
		},
	}
	e, rec := setupMiddlewareTest(middleware.JWTAuthConfig{
		KeyFunc:      testKeyFunc,
		GroupRepo:    mock,
		RequireGroup: false,
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	e.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)
}

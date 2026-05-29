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

func testKeyFunc(token *jwt.Token) (any, error) {
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
	findMembershipsFn func(ctx context.Context, userID uuid.UUID) ([]repository.GroupMembership, error)
}

func (m *mockGroupRepo) FindMembershipsByUserID(ctx context.Context, userID uuid.UUID) ([]repository.GroupMembership, error) {
	if m.findMembershipsFn != nil {
		return m.findMembershipsFn(ctx, userID)
	}
	return nil, nil
}
func (m *mockGroupRepo) CreateGroup(_ context.Context, _ string, _ uuid.UUID) (*repository.Group, error) {
	return nil, nil
}
func (m *mockGroupRepo) UpdateGroupName(_ context.Context, _ uuid.UUID, _ string) (*repository.Group, error) {
	return nil, nil
}
func (m *mockGroupRepo) CreateInvitation(_ context.Context, _, _ uuid.UUID, _ time.Duration) (*repository.Invitation, error) {
	return nil, nil
}
func (m *mockGroupRepo) FindInvitation(_ context.Context, _ uuid.UUID) (*repository.Invitation, error) {
	return nil, nil
}
func (m *mockGroupRepo) AcceptInvitation(_ context.Context, _, _ uuid.UUID) error { return nil }

func setupMiddlewareTest(cfg middleware.JWTAuthConfig) (*echo.Echo, *httptest.ResponseRecorder) {
	e := echo.New()
	e.Use(middleware.NewJWTAuth(cfg))
	e.GET("/test", func(c *echo.Context) error {
		return c.String(http.StatusOK, "ok")
	})
	rec := httptest.NewRecorder()
	return e, rec
}

func TestJWTAuth(t *testing.T) {
	t.Run("no_header", func(t *testing.T) {
		e, rec := setupMiddlewareTest(middleware.JWTAuthConfig{
			KeyFunc: testKeyFunc, GroupRepo: &mockGroupRepo{}, RequireGroup: true,
		})
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		e.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("invalid_token", func(t *testing.T) {
		e, rec := setupMiddlewareTest(middleware.JWTAuthConfig{
			KeyFunc: testKeyFunc, GroupRepo: &mockGroupRepo{}, RequireGroup: false,
		})
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("Authorization", "Bearer not-a-jwt")
		e.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("expired_token", func(t *testing.T) {
		userID := uuid.New()
		token := makeToken(t, userID.String(), time.Now().Add(-time.Hour))
		e, rec := setupMiddlewareTest(middleware.JWTAuthConfig{
			KeyFunc: testKeyFunc, GroupRepo: &mockGroupRepo{}, RequireGroup: false,
		})
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		e.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("valid_token_no_group_required", func(t *testing.T) {
		userID := uuid.New()
		token := makeToken(t, userID.String(), time.Now().Add(time.Hour))

		var capturedInfo *middleware.AuthInfo
		e := echo.New()
		e.Use(middleware.NewJWTAuth(middleware.JWTAuthConfig{
			KeyFunc: testKeyFunc, GroupRepo: &mockGroupRepo{}, RequireGroup: false,
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
		assert.Equal(t, uuid.Nil, capturedInfo.GroupID)
	})

	t.Run("require_group_missing_header", func(t *testing.T) {
		userID := uuid.New()
		token := makeToken(t, userID.String(), time.Now().Add(time.Hour))
		e, rec := setupMiddlewareTest(middleware.JWTAuthConfig{
			KeyFunc: testKeyFunc, GroupRepo: &mockGroupRepo{}, RequireGroup: true,
		})
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		e.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusForbidden, rec.Code)
	})

	t.Run("require_group_invalid_group_id", func(t *testing.T) {
		userID := uuid.New()
		token := makeToken(t, userID.String(), time.Now().Add(time.Hour))
		e, rec := setupMiddlewareTest(middleware.JWTAuthConfig{
			KeyFunc: testKeyFunc, GroupRepo: &mockGroupRepo{}, RequireGroup: true,
		})
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("X-Active-Group-ID", "not-a-uuid")
		e.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusForbidden, rec.Code)
	})

	t.Run("require_group_not_member", func(t *testing.T) {
		userID := uuid.New()
		token := makeToken(t, userID.String(), time.Now().Add(time.Hour))
		mock := &mockGroupRepo{
			findMembershipsFn: func(_ context.Context, _ uuid.UUID) ([]repository.GroupMembership, error) {
				return []repository.GroupMembership{}, nil
			},
		}
		e, rec := setupMiddlewareTest(middleware.JWTAuthConfig{
			KeyFunc: testKeyFunc, GroupRepo: mock, RequireGroup: true,
		})
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("X-Active-Group-ID", uuid.New().String())
		e.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusForbidden, rec.Code)
	})

	t.Run("require_group_valid_member", func(t *testing.T) {
		userID := uuid.New()
		groupID := uuid.New()
		token := makeToken(t, userID.String(), time.Now().Add(time.Hour))
		mock := &mockGroupRepo{
			findMembershipsFn: func(_ context.Context, uid uuid.UUID) ([]repository.GroupMembership, error) {
				assert.Equal(t, userID, uid)
				return []repository.GroupMembership{{GroupID: groupID, Name: "家", Role: "owner"}}, nil
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
		req.Header.Set("X-Active-Group-ID", groupID.String())
		e.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		require.NotNil(t, capturedInfo)
		assert.Equal(t, userID, capturedInfo.UserID)
		assert.Equal(t, groupID, capturedInfo.GroupID)
		assert.Equal(t, "owner", capturedInfo.Role)
	})
}

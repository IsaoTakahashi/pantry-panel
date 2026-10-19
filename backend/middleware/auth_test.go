package middleware_test

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/IsaoTakahashi/pantry-panel/backend/apierror"
	"github.com/IsaoTakahashi/pantry-panel/backend/middleware"
	"github.com/IsaoTakahashi/pantry-panel/backend/repository"
	"github.com/MicahParks/jwkset"
	keyfunc "github.com/MicahParks/keyfunc/v3"
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
func (m *mockGroupRepo) DeleteGroup(_ context.Context, _ uuid.UUID) error         { return nil }

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

	t.Run("token_signed_with_other_key", func(t *testing.T) {
		// 形式は正しく exp も期限内だが、検証用とは別の鍵で署名されたトークン。
		// Frontend の /stock-items は署名検証を Go API に一任しているため、
		// ここで 401 を返して後続のハンドラを呼ばないことが在庫漏えい防止の要
		userID := uuid.New()
		groupID := uuid.New()
		forged := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub": userID.String(),
			"exp": time.Now().Add(time.Hour).Unix(),
		})
		token, err := forged.SignedString([]byte("attacker-secret-key"))
		require.NoError(t, err)

		handlerCalled := false
		e := echo.New()
		e.Use(middleware.NewJWTAuth(middleware.JWTAuthConfig{
			KeyFunc: testKeyFunc,
			GroupRepo: &mockGroupRepo{
				findMembershipsFn: func(_ context.Context, _ uuid.UUID) ([]repository.GroupMembership, error) {
					return []repository.GroupMembership{{GroupID: groupID, Name: "家", Role: "owner"}}, nil
				},
			},
			RequireGroup: true,
		}))
		e.GET("/test", func(c *echo.Context) error {
			handlerCalled = true
			return c.String(http.StatusOK, "ok")
		})
		rec := httptest.NewRecorder()

		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("X-Active-Group-ID", groupID.String())
		e.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusUnauthorized, rec.Code)
		assert.False(t, handlerCalled, "handler must not run for a token signed with another key")
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

// --- 本物の keyfunc（JWKS を httptest から取得）を通すテスト ---
//
// スタブの jwt.Keyfunc や静的な鍵ストアでは、JWKS の取り直しのレートリミッターの経路を通らない。
// 障害中の 2 回目以降のリクエストはこの経路で失敗するため、本番（main.go）と同じ
// keyfunc.NewDefaultOverrideCtx で組み立てる。レートリミッターはインスタンスごとなので、
// サブテストごとに JWKS サーバーと keyfunc を作り直す。

func newRSAKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	k, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	return k
}

// newJWKSServer は、与えた公開鍵（kid → 鍵）を JWK Set として返す httptest サーバーを立てる。
// alg を指定した鍵は JWK の "alg" にも設定する。
func newJWKSServer(t *testing.T, keys map[string]any, alg jwkset.ALG) *httptest.Server {
	t.Helper()
	store := jwkset.NewMemoryStorage()
	for kid, pub := range keys {
		jwk, err := jwkset.NewJWKFromKey(pub, jwkset.JWKOptions{
			Metadata: jwkset.JWKMetadataOptions{KID: kid, ALG: alg},
		})
		require.NoError(t, err)
		require.NoError(t, store.KeyWrite(t.Context(), jwk))
	}
	body, err := store.JSONPublic(t.Context())
	require.NoError(t, err)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}))
	t.Cleanup(srv.Close)
	return srv
}

// newFailingJWKSServer は常に 500 を返す JWKS サーバーを立てる。
func newFailingJWKSServer(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)
	return srv
}

// newProductionKeyfunc は main.go と同じ既定値の keyfunc を作り、本番と同じラッパーで包む。
func newProductionKeyfunc(t *testing.T, jwksURL string) jwt.Keyfunc {
	t.Helper()
	k, err := keyfunc.NewDefaultOverrideCtx(t.Context(), []string{jwksURL}, keyfunc.Override{})
	require.NoError(t, err)
	return middleware.NewKeyStoreFirstKeyfunc(k)
}

func signWithKID(t *testing.T, method jwt.SigningMethod, key any, kid any) string {
	t.Helper()
	token := jwt.NewWithClaims(method, jwt.MapClaims{
		"sub": uuid.New().String(),
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	token.Header["kid"] = kid
	s, err := token.SignedString(key)
	require.NoError(t, err)
	return s
}

// keyfuncTestServer は RequireGroup: true の JWT ミドルウェアを組み、ハンドラと GroupRepo の呼び出しを数える。
type keyfuncTestServer struct {
	e             *echo.Echo
	groupID       uuid.UUID
	handlerCalls  int
	groupRepoCall int
}

func newKeyfuncTestServer(kf jwt.Keyfunc) *keyfuncTestServer {
	s := &keyfuncTestServer{e: echo.New(), groupID: uuid.New()}
	s.e.Use(middleware.NewJWTAuth(middleware.JWTAuthConfig{
		KeyFunc: kf,
		GroupRepo: &mockGroupRepo{
			findMembershipsFn: func(_ context.Context, _ uuid.UUID) ([]repository.GroupMembership, error) {
				s.groupRepoCall++
				return []repository.GroupMembership{{GroupID: s.groupID, Name: "家", Role: "owner"}}, nil
			},
		},
		RequireGroup: true,
	}))
	s.e.GET("/test", func(c *echo.Context) error {
		s.handlerCalls++
		return c.String(http.StatusOK, "ok")
	})
	return s
}

func (s *keyfuncTestServer) get(token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-Active-Group-ID", s.groupID.String())
	rec := httptest.NewRecorder()
	s.e.ServeHTTP(rec, req)
	return rec
}

func assertServiceUnavailable(t *testing.T, rec *httptest.ResponseRecorder, call int) {
	t.Helper()
	assert.Equal(t, http.StatusServiceUnavailable, rec.Code, "call %d", call)
	var body apierror.ErrorResponse
	if assert.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body), "call %d", call) {
		assert.Equal(t, "Service Unavailable", body.Message, "call %d", call)
	}
}

func TestJWTAuth_SigningKeyUnavailable(t *testing.T) {
	// B-1: JWKS を取得できない状態が続くとき、正しく署名されたトークンでの連続したリクエストがすべて 503。
	// 1 回目は取り直しをしても鍵が見つからない経路、2・3 回目は取り直しのレートリミッターの待ちで
	// 即失敗する経路を通る。2 回目以降がこのテストの本体
	t.Run("jwks_fetch_keeps_failing_returns_503_for_consecutive_requests", func(t *testing.T) {
		srv := newFailingJWKSServer(t)
		s := newKeyfuncTestServer(newProductionKeyfunc(t, srv.URL))
		token := signWithKID(t, jwt.SigningMethodRS256, newRSAKey(t), "k1")

		for call := 1; call <= 3; call++ {
			assertServiceUnavailable(t, s.get(token), call)
		}
		assert.Equal(t, 0, s.handlerCalls, "handler must not run while the signing key cannot be resolved")
		assert.Equal(t, 0, s.groupRepoCall, "GroupRepo must not be called while the signing key cannot be resolved")
	})

	// B-2: JWKS は取得できるが未知の kid のトークンは、連続したリクエストがすべて 503
	t.Run("unknown_kid_returns_503_for_consecutive_requests", func(t *testing.T) {
		keyA := newRSAKey(t)
		keyB := newRSAKey(t)
		srv := newJWKSServer(t, map[string]any{"a": &keyA.PublicKey}, "")
		s := newKeyfuncTestServer(newProductionKeyfunc(t, srv.URL))
		token := signWithKID(t, jwt.SigningMethodRS256, keyB, "b")

		for call := 1; call <= 2; call++ {
			assertServiceUnavailable(t, s.get(token), call)
		}
		assert.Equal(t, 0, s.handlerCalls)
	})

	// B-2 の対照: 同じ構成で既知の kid のトークンは 200（fixture が正しく組めていることの確認）
	t.Run("known_kid_returns_200", func(t *testing.T) {
		keyA := newRSAKey(t)
		srv := newJWKSServer(t, map[string]any{"a": &keyA.PublicKey}, "")
		s := newKeyfuncTestServer(newProductionKeyfunc(t, srv.URL))
		token := signWithKID(t, jwt.SigningMethodRS256, keyA, "a")

		rec := s.get(token)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, 1, s.handlerCalls)
	})
}

// B-3: 鍵は解決できるがトークンや鍵の内容に問題があるときは 401 のまま。
// 「keyfunc のエラーをすべて 503 にする」実装をここで弾く
func TestJWTAuth_ResolvableKeyButInvalidToken(t *testing.T) {
	t.Run("signature_invalid_returns_401", func(t *testing.T) {
		keyA := newRSAKey(t)
		srv := newJWKSServer(t, map[string]any{"a": &keyA.PublicKey}, "")
		s := newKeyfuncTestServer(newProductionKeyfunc(t, srv.URL))
		token := signWithKID(t, jwt.SigningMethodRS256, newRSAKey(t), "a")

		rec := s.get(token)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
		assert.Equal(t, 0, s.handlerCalls)
	})

	t.Run("alg_mismatch_with_jwk_returns_401", func(t *testing.T) {
		// JWK は alg: RS256。トークンは許可リスト内の別の alg（ES256）で署名する。
		// RS384 などの許可リスト外の alg だと jwt.WithValidMethods で弾かれ keyfunc を通らない
		keyA := newRSAKey(t)
		srv := newJWKSServer(t, map[string]any{"a": &keyA.PublicKey}, jwkset.AlgRS256)
		s := newKeyfuncTestServer(newProductionKeyfunc(t, srv.URL))
		ecKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		require.NoError(t, err)
		token := signWithKID(t, jwt.SigningMethodES256, ecKey, "a")

		rec := s.get(token)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
		assert.Equal(t, 0, s.handlerCalls)
	})

	t.Run("non_string_kid_returns_401", func(t *testing.T) {
		keyA := newRSAKey(t)
		srv := newJWKSServer(t, map[string]any{"a": &keyA.PublicKey}, "")
		s := newKeyfuncTestServer(newProductionKeyfunc(t, srv.URL))
		token := signWithKID(t, jwt.SigningMethodRS256, keyA, 123)

		rec := s.get(token)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
		assert.Equal(t, 0, s.handlerCalls)
	})
}

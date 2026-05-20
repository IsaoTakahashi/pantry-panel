# Group Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add group name editing (owner only) and multiple group creation/switching to Pantry Panel.

**Architecture:** Backend adds `FindMembershipsByUserID` (plural), `UpdateGroupName`, and `PATCH /api/groups/:id`. The JWT group middleware (`jwtGroupMW`) validates membership via `X-Active-Group-ID` request header instead of auto-selecting the user's single group. Frontend adds `groups[]` + `switchGroup` to AuthContext with localStorage persistence, and a new `GroupSwitcher` dropdown component replaces the plain group name text in the header.

**Tech Stack:** Go (Echo, pgx, testcontainers), TypeScript (Next.js, Vitest, React Testing Library, Tailwind CSS)

---

## File Map

| File | Change |
|------|--------|
| `backend/repository/group.go` | Remove `FindMembershipByUserID`, add `FindMembershipsByUserID` + `UpdateGroupName` |
| `backend/repository/group_pg.go` | Replace `FindMembershipByUserID` impl, add `FindMembershipsByUserID` + `UpdateGroupName` |
| `backend/repository/group_test.go` | Update tests for new interface |
| `backend/middleware/auth.go` | `jwtGroupMW` reads `X-Active-Group-ID` header; `jwtOnlyMW` no longer queries DB |
| `backend/middleware/auth_test.go` | Update mock + add header tests |
| `backend/handler/group.go` | `GetMyGroup`→`GetMyGroups`, remove 409 check, add `UpdateGroup` |
| `backend/handler/group_test.go` | Update mock + tests |
| `backend/main.go` | Add `PATCH /api/groups/:id` route |
| `frontend/src/lib/authApi.ts` | `fetchMyGroup`→`fetchMyGroups`, add `updateGroupName`, update `createInvitation` signature |
| `frontend/src/lib/authApi.test.ts` | Update tests |
| `frontend/src/lib/api.ts` | `bearerHeaders`→`apiHeaders`, add `activeGroupId` param to all functions |
| `frontend/src/lib/api.test.ts` | Update tests |
| `frontend/src/contexts/AuthContext.tsx` | Add `groups[]`, `switchGroup`, localStorage, `applyGroups` |
| `frontend/src/contexts/AuthContext.test.tsx` | Update tests |
| `frontend/src/components/GroupSwitcher.tsx` | New component |
| `frontend/src/components/GroupSwitcher.test.tsx` | New tests |
| `frontend/src/components/ImageSelectionModal.tsx` | Add `activeGroupId` prop |
| `frontend/src/components/ImageSelectionModal.test.tsx` | Update tests |
| `frontend/src/app/stock-items/page.tsx` | Use `GroupSwitcher`, pass `activeGroupId` to all API calls |
| `frontend/src/app/invite/page.tsx` | Pass `group?.groupId` to `createInvitation` |

---

### Task 1: Create GitHub Issue + branch

**Files:** none (setup only)

- [ ] **Step 1: Create GitHub Issue**

```bash
gh issue create \
  --title "グループ名編集 / 複数グループ作成・切り替え" \
  --body "## 概要
1. グループ名の編集機能（オーナーのみ）
2. 複数グループの作成・切り替え機能（ヘッダードロップダウン）

## 設計ドキュメント
\`docs/superpowers/specs/2026-05-20-group-management-design.md\`

## 変更範囲
- Backend: GroupRepository インターフェース変更（FindMembershipsByUserID / UpdateGroupName）、JWT ミドルウェア X-Active-Group-ID 対応、PATCH /api/groups/:id 追加
- Frontend: AuthContext 複数グループ対応（localStorage）、GroupSwitcher コンポーネント新規作成"
```

Note the issue number from the output (e.g. `#85`). Use it in the next step.

- [ ] **Step 2: Create branch**

```bash
git checkout -b {ISSUE_NUMBER}-group-management
```

- [ ] **Step 3: Commit design doc and plan**

```bash
git add docs/superpowers/specs/2026-05-20-group-management-design.md \
        docs/superpowers/plans/2026-05-20-group-management.md
git commit -m "docs: add group management design spec and implementation plan"
```

---

### Task 2: Update GroupRepository interface

**Files:**
- Modify: `backend/repository/group.go`

- [ ] **Step 1: Replace the `GroupRepository` interface**

In `backend/repository/group.go`, replace the `GroupRepository` interface (lines 37–53) with:

```go
type GroupRepository interface {
	// FindMembershipsByUserID はユーザーが所属する全グループを返す。未所属なら空スライスを返す。
	FindMembershipsByUserID(ctx context.Context, userID uuid.UUID) ([]GroupMembership, error)

	// CreateGroup は新しいグループを作成し、ownerID を owner として追加する。
	CreateGroup(ctx context.Context, name string, ownerID uuid.UUID) (*Group, error)

	// UpdateGroupName はグループ名を更新し、更新後の Group を返す。見つからなければ ErrNotFound を返す。
	UpdateGroupName(ctx context.Context, groupID uuid.UUID, name string) (*Group, error)

	// CreateInvitation は有効期限付き招待トークンを生成する。
	CreateInvitation(ctx context.Context, groupID, createdBy uuid.UUID, ttl time.Duration) (*Invitation, error)

	// FindInvitation はトークンで招待を検索する。見つからなければ ErrNotFound を返す。
	FindInvitation(ctx context.Context, token uuid.UUID) (*Invitation, error)

	// AcceptInvitation は招待を承認してユーザーをグループに追加する。
	// 既にメンバーなら冪等（エラーなし）。期限切れなら ErrInvitationExpired を返す。
	AcceptInvitation(ctx context.Context, token, userID uuid.UUID) error
}
```

- [ ] **Step 2: Verify compile errors (expected)**

```bash
cd backend && go build ./... 2>&1 | head -30
```

Expected: compile errors because `PgGroupRepository` and test mocks don't yet implement the new interface. This is expected — fix in subsequent tasks.

---

### Task 3: Implement FindMembershipsByUserID

**Files:**
- Modify: `backend/repository/group_pg.go`

- [ ] **Step 1: Replace `FindMembershipByUserID` method with `FindMembershipsByUserID`**

In `backend/repository/group_pg.go`, replace lines 20–42 (the `FindMembershipByUserID` method):

```go
func (r *PgGroupRepository) FindMembershipsByUserID(ctx context.Context, userID uuid.UUID) ([]GroupMembership, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT g.id, g.name, gm.role
		 FROM group_members gm
		 JOIN groups g ON g.id = gm.group_id
		 WHERE gm.user_id = $1
		 ORDER BY gm.joined_at`,
		userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type row struct {
		GroupID uuid.UUID `db:"id"`
		Name    string    `db:"name"`
		Role    string    `db:"role"`
	}
	rs, err := pgx.CollectRows(rows, pgx.RowToStructByName[row])
	if err != nil {
		return nil, err
	}

	memberships := make([]GroupMembership, len(rs))
	for i, r2 := range rs {
		memberships[i] = GroupMembership{GroupID: r2.GroupID, Name: r2.Name, Role: r2.Role}
	}
	return memberships, nil
}
```

---

### Task 4: Implement UpdateGroupName

**Files:**
- Modify: `backend/repository/group_pg.go`

- [ ] **Step 1: Add `UpdateGroupName` after `CreateGroup` method**

In `backend/repository/group_pg.go`, add this method after the `CreateGroup` method (around line 67):

```go
func (r *PgGroupRepository) UpdateGroupName(ctx context.Context, groupID uuid.UUID, name string) (*Group, error) {
	var group Group
	err := r.pool.QueryRow(ctx,
		"UPDATE groups SET name = $1 WHERE id = $2 RETURNING id, name, created_at",
		name, groupID).Scan(&group.ID, &group.Name, &group.CreatedAt)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &group, nil
}
```

---

### Task 5: Update repository tests

**Files:**
- Modify: `backend/repository/group_test.go`

- [ ] **Step 1: Replace entire `backend/repository/group_test.go`**

```go
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

	memberships, err := repo.FindMembershipsByUserID(context.Background(), ownerID)
	require.NoError(t, err)
	require.Len(t, memberships, 1)
	assert.Equal(t, group.ID, memberships[0].GroupID)
	assert.Equal(t, "owner", memberships[0].Role)
}

func TestFindMembershipsByUserID_NotMember(t *testing.T) {
	repo := setupGroupTestDB(t)

	memberships, err := repo.FindMembershipsByUserID(context.Background(), uuid.New())
	require.NoError(t, err)
	assert.Empty(t, memberships)
}

func TestFindMembershipsByUserID_MultipleGroups(t *testing.T) {
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
}

func TestUpdateGroupName_Success(t *testing.T) {
	repo := setupGroupTestDB(t)
	ownerID := uuid.New()
	group, err := repo.CreateGroup(context.Background(), "旧名前", ownerID)
	require.NoError(t, err)

	updated, err := repo.UpdateGroupName(context.Background(), group.ID, "新しい名前")
	require.NoError(t, err)
	assert.Equal(t, group.ID, updated.ID)
	assert.Equal(t, "新しい名前", updated.Name)
}

func TestUpdateGroupName_NotFound(t *testing.T) {
	repo := setupGroupTestDB(t)

	_, err := repo.UpdateGroupName(context.Background(), uuid.New(), "名前")
	assert.ErrorIs(t, err, ErrNotFound)
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

	memberships, err := repo.FindMembershipsByUserID(context.Background(), newMemberID)
	require.NoError(t, err)
	require.Len(t, memberships, 1)
	assert.Equal(t, group.ID, memberships[0].GroupID)
	assert.Equal(t, "member", memberships[0].Role)

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
	require.NoError(t, repo.AcceptInvitation(context.Background(), inv.Token, memberID))
}

func TestAcceptInvitation_Expired(t *testing.T) {
	repo := setupGroupTestDB(t)
	ownerID := uuid.New()
	group, _ := repo.CreateGroup(context.Background(), "テスト家族", ownerID)
	inv, _ := repo.CreateInvitation(context.Background(), group.ID, ownerID, -time.Hour)

	err := repo.AcceptInvitation(context.Background(), inv.Token, uuid.New())
	assert.ErrorIs(t, err, ErrInvitationExpired)
}
```

---

### Task 6: Update JWT middleware

**Files:**
- Modify: `backend/middleware/auth.go`

- [ ] **Step 1: Replace entire `backend/middleware/auth.go`**

Key changes: `jwtGroupMW` (RequireGroup=true) reads `X-Active-Group-ID` header and verifies membership; `jwtOnlyMW` (RequireGroup=false) only validates JWT (no DB call).

```go
package middleware

import (
	"net/http"
	"strings"

	"github.com/IsaoTakahashi/pantry-panel/backend/repository"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
)

const authInfoKey = "authInfo"

type AuthInfo struct {
	UserID  uuid.UUID
	GroupID uuid.UUID // アクティブグループ未設定なら uuid.Nil
	Role    string    // アクティブグループ未設定なら ""
}

type JWTAuthConfig struct {
	KeyFunc      jwt.Keyfunc
	GroupRepo    repository.GroupRepository
	RequireGroup bool
}

func NewJWTAuth(cfg JWTAuthConfig) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			authHeader := c.Request().Header.Get("Authorization")
			if !strings.HasPrefix(authHeader, "Bearer ") {
				return c.JSON(http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
			}
			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

			token, err := jwt.Parse(tokenStr, cfg.KeyFunc,
				jwt.WithValidMethods([]string{"RS256", "HS256", "ES256"}))
			if err != nil || !token.Valid {
				return c.JSON(http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
			}

			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				return c.JSON(http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
			}
			subStr, err := claims.GetSubject()
			if err != nil {
				return c.JSON(http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
			}
			userID, err := uuid.Parse(subStr)
			if err != nil {
				return c.JSON(http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
			}

			info := &AuthInfo{UserID: userID}

			if cfg.RequireGroup {
				activeGroupHeader := c.Request().Header.Get("X-Active-Group-ID")
				if activeGroupHeader == "" {
					return c.JSON(http.StatusForbidden, map[string]string{"message": "X-Active-Group-ID header is required"})
				}
				activeGroupID, err := uuid.Parse(activeGroupHeader)
				if err != nil {
					return c.JSON(http.StatusForbidden, map[string]string{"message": "Invalid X-Active-Group-ID"})
				}

				memberships, err := cfg.GroupRepo.FindMembershipsByUserID(c.Request().Context(), userID)
				if err != nil {
					return c.JSON(http.StatusInternalServerError, map[string]string{"message": "Internal Server Error"})
				}

				var found *repository.GroupMembership
				for i := range memberships {
					if memberships[i].GroupID == activeGroupID {
						found = &memberships[i]
						break
					}
				}
				if found == nil {
					return c.JSON(http.StatusForbidden, map[string]string{"message": "Not a member of the specified group"})
				}

				info.GroupID = found.GroupID
				info.Role = found.Role
			}

			c.Set(authInfoKey, info)
			return next(c)
		}
	}
}

func GetAuthInfo(c *echo.Context) (*AuthInfo, bool) {
	v, ok := c.Get(authInfoKey).(*AuthInfo)
	return v, ok
}

// SetAuthInfo はテスト用のヘルパー。handler テストで AuthInfo をコンテキストに注入する。
func SetAuthInfo(c *echo.Context, info *AuthInfo) {
	c.Set(authInfoKey, info)
}
```

---

### Task 7: Update middleware tests

**Files:**
- Modify: `backend/middleware/auth_test.go`

- [ ] **Step 1: Replace entire `backend/middleware/auth_test.go`**

```go
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

func TestJWTAuth_NoHeader(t *testing.T) {
	e, rec := setupMiddlewareTest(middleware.JWTAuthConfig{
		KeyFunc: testKeyFunc, GroupRepo: &mockGroupRepo{}, RequireGroup: true,
	})
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	e.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestJWTAuth_InvalidToken(t *testing.T) {
	e, rec := setupMiddlewareTest(middleware.JWTAuthConfig{
		KeyFunc: testKeyFunc, GroupRepo: &mockGroupRepo{}, RequireGroup: false,
	})
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer not-a-jwt")
	e.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestJWTAuth_ExpiredToken(t *testing.T) {
	userID := uuid.New()
	token := makeToken(t, userID.String(), time.Now().Add(-time.Hour))
	e, rec := setupMiddlewareTest(middleware.JWTAuthConfig{
		KeyFunc: testKeyFunc, GroupRepo: &mockGroupRepo{}, RequireGroup: false,
	})
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	e.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestJWTAuth_ValidToken_NoGroupRequired(t *testing.T) {
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
}

func TestJWTAuth_RequireGroup_MissingHeader(t *testing.T) {
	userID := uuid.New()
	token := makeToken(t, userID.String(), time.Now().Add(time.Hour))
	e, rec := setupMiddlewareTest(middleware.JWTAuthConfig{
		KeyFunc: testKeyFunc, GroupRepo: &mockGroupRepo{}, RequireGroup: true,
	})
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	e.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusForbidden, rec.Code)
}

func TestJWTAuth_RequireGroup_InvalidGroupID(t *testing.T) {
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
}

func TestJWTAuth_RequireGroup_NotMember(t *testing.T) {
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
}

func TestJWTAuth_RequireGroup_ValidMember(t *testing.T) {
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
}
```

- [ ] **Step 2: Run middleware tests**

```bash
cd backend && go test ./middleware/... -v
```

Expected: PASS.

---

### Task 8: Update group handler

**Files:**
- Modify: `backend/handler/group.go`

- [ ] **Step 1: Replace entire `backend/handler/group.go`**

```go
package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/IsaoTakahashi/pantry-panel/backend/middleware"
	"github.com/IsaoTakahashi/pantry-panel/backend/repository"
	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
)

type GroupHandler struct {
	repo repository.GroupRepository
}

func NewGroupHandler(repo repository.GroupRepository) *GroupHandler {
	return &GroupHandler{repo: repo}
}

type CreateGroupRequest struct {
	Name string `json:"name"`
}

type UpdateGroupRequest struct {
	Name string `json:"name"`
}

func (h *GroupHandler) CreateGroup(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, ErrorResponse{Message: "Unauthorized"})
	}

	var req CreateGroupRequest
	if err := c.Bind(&req); err != nil || req.Name == "" {
		return c.JSON(http.StatusBadRequest, ErrorResponse{Message: "name is required"})
	}

	group, err := h.repo.CreateGroup(c.Request().Context(), req.Name, authInfo.UserID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorResponse{Message: "Internal Server Error"})
	}
	return c.JSON(http.StatusCreated, group)
}

func (h *GroupHandler) GetMyGroups(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, ErrorResponse{Message: "Unauthorized"})
	}

	memberships, err := h.repo.FindMembershipsByUserID(c.Request().Context(), authInfo.UserID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorResponse{Message: "Internal Server Error"})
	}
	return c.JSON(http.StatusOK, memberships)
}

func (h *GroupHandler) UpdateGroup(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, ErrorResponse{Message: "Unauthorized"})
	}

	groupID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, ErrorResponse{Message: "Invalid group ID"})
	}

	if groupID != authInfo.GroupID {
		return c.JSON(http.StatusForbidden, ErrorResponse{Message: "Forbidden"})
	}
	if authInfo.Role != "owner" {
		return c.JSON(http.StatusForbidden, ErrorResponse{Message: "Forbidden"})
	}

	var req UpdateGroupRequest
	if err := c.Bind(&req); err != nil || req.Name == "" {
		return c.JSON(http.StatusBadRequest, ErrorResponse{Message: "name is required"})
	}

	group, err := h.repo.UpdateGroupName(c.Request().Context(), groupID, req.Name)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return c.JSON(http.StatusNotFound, ErrorResponse{Message: "Group not found"})
		}
		return c.JSON(http.StatusInternalServerError, ErrorResponse{Message: "Internal Server Error"})
	}
	return c.JSON(http.StatusOK, group)
}

func (h *GroupHandler) CreateInvitation(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, ErrorResponse{Message: "Unauthorized"})
	}
	if authInfo.GroupID == uuid.Nil {
		return c.JSON(http.StatusForbidden, ErrorResponse{Message: "Not a member of any group"})
	}

	inv, err := h.repo.CreateInvitation(c.Request().Context(),
		authInfo.GroupID, authInfo.UserID, 7*24*time.Hour)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorResponse{Message: "Internal Server Error"})
	}
	return c.JSON(http.StatusCreated, inv)
}

func (h *GroupHandler) AcceptInvitation(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, ErrorResponse{Message: "Unauthorized"})
	}

	token, err := uuid.Parse(c.Param("token"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, ErrorResponse{Message: "Invalid token"})
	}

	if err := h.repo.AcceptInvitation(c.Request().Context(), token, authInfo.UserID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return c.JSON(http.StatusNotFound, ErrorResponse{Message: "Invitation not found"})
		}
		if errors.Is(err, repository.ErrInvitationExpired) {
			return c.JSON(http.StatusGone, ErrorResponse{Message: "Invitation has expired"})
		}
		return c.JSON(http.StatusInternalServerError, ErrorResponse{Message: "Internal Server Error"})
	}

	memberships, err := h.repo.FindMembershipsByUserID(c.Request().Context(), authInfo.UserID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorResponse{Message: "Internal Server Error"})
	}
	return c.JSON(http.StatusOK, memberships)
}
```

---

### Task 9: Update handler tests

**Files:**
- Modify: `backend/handler/group_test.go`

- [ ] **Step 1: Replace entire `backend/handler/group_test.go`**

```go
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
	findMembershipsFn  func(ctx context.Context, userID uuid.UUID) ([]repository.GroupMembership, error)
	createGroupFn      func(ctx context.Context, name string, ownerID uuid.UUID) (*repository.Group, error)
	updateGroupNameFn  func(ctx context.Context, groupID uuid.UUID, name string) (*repository.Group, error)
	createInvitationFn func(ctx context.Context, groupID, createdBy uuid.UUID, ttl time.Duration) (*repository.Invitation, error)
	findInvitationFn   func(ctx context.Context, token uuid.UUID) (*repository.Invitation, error)
	acceptInvitationFn func(ctx context.Context, token, userID uuid.UUID) error
}

func (m *mockGroupRepo) FindMembershipsByUserID(ctx context.Context, userID uuid.UUID) ([]repository.GroupMembership, error) {
	if m.findMembershipsFn != nil {
		return m.findMembershipsFn(ctx, userID)
	}
	return nil, nil
}
func (m *mockGroupRepo) CreateGroup(ctx context.Context, name string, ownerID uuid.UUID) (*repository.Group, error) {
	return m.createGroupFn(ctx, name, ownerID)
}
func (m *mockGroupRepo) UpdateGroupName(ctx context.Context, groupID uuid.UUID, name string) (*repository.Group, error) {
	return m.updateGroupNameFn(ctx, groupID, name)
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
	e.GET("/api/groups/me", h.GetMyGroups)
	e.PATCH("/api/groups/:id", h.UpdateGroup)
	e.POST("/api/invitations", h.CreateInvitation)
	e.POST("/api/invitations/:token/accept", h.AcceptInvitation)
	return e
}

func TestCreateGroup_Success(t *testing.T) {
	userID := uuid.New()
	groupID := uuid.New()
	mock := &mockGroupRepo{
		createGroupFn: func(_ context.Context, name string, _ uuid.UUID) (*repository.Group, error) {
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

func TestCreateGroup_AlreadyMember_StillSucceeds(t *testing.T) {
	// 既存メンバーでも新しいグループを作成できる（409 は返さない）
	userID := uuid.New()
	groupID := uuid.New()
	mock := &mockGroupRepo{
		createGroupFn: func(_ context.Context, name string, _ uuid.UUID) (*repository.Group, error) {
			return &repository.Group{ID: groupID, Name: name}, nil
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

	assert.Equal(t, http.StatusCreated, rec.Code)
}

func TestGetMyGroups_ReturnsAll(t *testing.T) {
	userID := uuid.New()
	groupID1 := uuid.New()
	groupID2 := uuid.New()
	mock := &mockGroupRepo{
		findMembershipsFn: func(_ context.Context, _ uuid.UUID) ([]repository.GroupMembership, error) {
			return []repository.GroupMembership{
				{GroupID: groupID1, Name: "我が家", Role: "owner"},
				{GroupID: groupID2, Name: "実家", Role: "member"},
			}, nil
		},
	}
	h := NewGroupHandler(mock)
	e := setupGroupRouter(h)

	req := httptest.NewRequest(http.MethodGet, "/api/groups/me", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	middleware.SetAuthInfo(c, &middleware.AuthInfo{UserID: userID})
	require.NoError(t, h.GetMyGroups(c))

	assert.Equal(t, http.StatusOK, rec.Code)
	var resp []repository.GroupMembership
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
	require.Len(t, resp, 2)
	assert.Equal(t, groupID1, resp[0].GroupID)
	assert.Equal(t, groupID2, resp[1].GroupID)
}

func TestUpdateGroup_Owner_Success(t *testing.T) {
	groupID := uuid.New()
	mock := &mockGroupRepo{
		updateGroupNameFn: func(_ context.Context, gID uuid.UUID, name string) (*repository.Group, error) {
			return &repository.Group{ID: gID, Name: name}, nil
		},
	}
	h := NewGroupHandler(mock)
	e := setupGroupRouter(h)

	body := `{"name":"新しい名前"}`
	req := httptest.NewRequest(http.MethodPatch, "/api/groups/"+groupID.String(), strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPathValues(echo.PathValues{{Name: "id", Value: groupID.String()}})
	middleware.SetAuthInfo(c, &middleware.AuthInfo{UserID: uuid.New(), GroupID: groupID, Role: "owner"})
	require.NoError(t, h.UpdateGroup(c))

	assert.Equal(t, http.StatusOK, rec.Code)
	var resp repository.Group
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
	assert.Equal(t, "新しい名前", resp.Name)
}

func TestUpdateGroup_Member_Forbidden(t *testing.T) {
	groupID := uuid.New()
	mock := &mockGroupRepo{}
	h := NewGroupHandler(mock)
	e := setupGroupRouter(h)

	body := `{"name":"名前"}`
	req := httptest.NewRequest(http.MethodPatch, "/api/groups/"+groupID.String(), strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPathValues(echo.PathValues{{Name: "id", Value: groupID.String()}})
	middleware.SetAuthInfo(c, &middleware.AuthInfo{UserID: uuid.New(), GroupID: groupID, Role: "member"})
	require.NoError(t, h.UpdateGroup(c))

	assert.Equal(t, http.StatusForbidden, rec.Code)
}

func TestUpdateGroup_WrongGroup_Forbidden(t *testing.T) {
	groupID := uuid.New()
	otherGroupID := uuid.New()
	mock := &mockGroupRepo{}
	h := NewGroupHandler(mock)
	e := setupGroupRouter(h)

	body := `{"name":"名前"}`
	req := httptest.NewRequest(http.MethodPatch, "/api/groups/"+otherGroupID.String(), strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPathValues(echo.PathValues{{Name: "id", Value: otherGroupID.String()}})
	middleware.SetAuthInfo(c, &middleware.AuthInfo{UserID: uuid.New(), GroupID: groupID, Role: "owner"})
	require.NoError(t, h.UpdateGroup(c))

	assert.Equal(t, http.StatusForbidden, rec.Code)
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
	groupID := uuid.New()
	mock := &mockGroupRepo{
		acceptInvitationFn: func(_ context.Context, tok, uid uuid.UUID) error {
			assert.Equal(t, token, tok)
			assert.Equal(t, userID, uid)
			return nil
		},
		findMembershipsFn: func(_ context.Context, _ uuid.UUID) ([]repository.GroupMembership, error) {
			return []repository.GroupMembership{{GroupID: groupID, Name: "家", Role: "member"}}, nil
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
	var resp []repository.GroupMembership
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
	require.Len(t, resp, 1)
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
```

- [ ] **Step 2: Run all backend unit tests**

```bash
cd backend && go test ./repository/... ./middleware/... ./handler/... -v 2>&1 | tail -40
```

Expected: all pass. Fix any issues before proceeding.

---

### Task 10: Update main.go

**Files:**
- Modify: `backend/main.go`

- [ ] **Step 1: Update route registration in `main.go`**

Find the group/invitation route block (around lines 100–103) and replace with:

```go
e.POST("/api/groups", groupHandler.CreateGroup, jwtOnlyMW)
e.GET("/api/groups/me", groupHandler.GetMyGroups, jwtOnlyMW)
e.PATCH("/api/groups/:id", groupHandler.UpdateGroup, jwtGroupMW)
e.POST("/api/invitations", groupHandler.CreateInvitation, jwtGroupMW)
e.POST("/api/invitations/:token/accept", groupHandler.AcceptInvitation, jwtOnlyMW)
```

- [ ] **Step 2: Build and run all backend tests**

```bash
cd backend && go build ./... && go test ./... -count=1 2>&1 | tail -20
```

Expected: builds cleanly, all unit tests pass.

- [ ] **Step 3: Commit backend changes**

```bash
git add backend/repository/group.go backend/repository/group_pg.go backend/repository/group_test.go \
        backend/middleware/auth.go backend/middleware/auth_test.go \
        backend/handler/group.go backend/handler/group_test.go \
        backend/main.go
git commit -m "feat(backend): multi-group support, group rename endpoint, X-Active-Group-ID middleware"
```

---

### Task 11: Update authApi.ts

**Files:**
- Modify: `frontend/src/lib/authApi.ts`
- Modify: `frontend/src/lib/authApi.test.ts`

- [ ] **Step 1: Replace `frontend/src/lib/authApi.ts`**

```ts
import type {
  GroupCreateResponse,
  GroupInfo,
  InvitationResponse,
} from "@/types/group";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

function authHeaders(accessToken: string, activeGroupId?: string): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  if (activeGroupId) headers["X-Active-Group-ID"] = activeGroupId;
  return headers;
}

async function fetchMyGroups(accessToken: string): Promise<GroupInfo[]> {
  const response = await fetch(`${API_BASE_URL}/api/groups/me`, {
    headers: authHeaders(accessToken),
  });
  if (response.status === 403 || response.status === 404) return [];
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function createGroup(
  name: string,
  accessToken: string,
): Promise<GroupCreateResponse> {
  const response = await fetch(`${API_BASE_URL}/api/groups`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function updateGroupName(
  groupId: string,
  name: string,
  accessToken: string,
  activeGroupId: string,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}`, {
    method: "PATCH",
    headers: authHeaders(accessToken, activeGroupId),
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

async function createInvitation(
  accessToken: string,
  activeGroupId: string,
): Promise<InvitationResponse> {
  const response = await fetch(`${API_BASE_URL}/api/invitations`, {
    method: "POST",
    headers: authHeaders(accessToken, activeGroupId),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function acceptInvitation(
  inviteToken: string,
  accessToken: string,
): Promise<GroupInfo[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/invitations/${inviteToken}/accept`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
    },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export {
  acceptInvitation,
  createGroup,
  createInvitation,
  fetchMyGroups,
  updateGroupName,
};
```

- [ ] **Step 2: Replace `frontend/src/lib/authApi.test.ts`**

Read the current file first to understand its structure:

```bash
cat frontend/src/lib/authApi.test.ts
```

Then replace with:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGroup,
  createInvitation,
  fetchMyGroups,
  updateGroupName,
} from "./authApi";

describe("fetchMyGroups", () => {
  beforeEach(() => vi.spyOn(globalThis, "fetch"));
  afterEach(() => vi.restoreAllMocks());

  it("returns group list on success", async () => {
    const groups = [{ groupId: "g1", name: "我が家", role: "owner" }];
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(groups), { status: 200 }),
    );
    const result = await fetchMyGroups("token");
    expect(result).toEqual(groups);
  });

  it("returns empty array on 404", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await fetchMyGroups("token")).toEqual([]);
  });

  it("returns empty array on 403", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 403 }));
    expect(await fetchMyGroups("token")).toEqual([]);
  });
});

describe("createGroup", () => {
  beforeEach(() => vi.spyOn(globalThis, "fetch"));
  afterEach(() => vi.restoreAllMocks());

  it("sends POST and returns created group", async () => {
    const created = { id: "g1", name: "我が家", createdAt: "2024-01-01T00:00:00Z" };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(created), { status: 201 }),
    );
    const result = await createGroup("我が家", "token");
    expect(result).toEqual(created);
    expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBe("POST");
  });
});

describe("updateGroupName", () => {
  beforeEach(() => vi.spyOn(globalThis, "fetch"));
  afterEach(() => vi.restoreAllMocks());

  it("sends PATCH with X-Active-Group-ID header", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    await updateGroupName("g1", "新名前", "token", "g1");
    const call = vi.mocked(fetch).mock.calls[0];
    expect(String(call[0])).toContain("/api/groups/g1");
    expect(call[1]?.method).toBe("PATCH");
    const headers = call[1]?.headers as Record<string, string>;
    expect(headers["X-Active-Group-ID"]).toBe("g1");
  });

  it("throws on error response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(updateGroupName("g1", "名前", "token", "g1")).rejects.toThrow("HTTP 403");
  });
});

describe("createInvitation", () => {
  beforeEach(() => vi.spyOn(globalThis, "fetch"));
  afterEach(() => vi.restoreAllMocks());

  it("sends X-Active-Group-ID header", async () => {
    const inv = { token: "t1", groupId: "g1", createdBy: "u1", expiresAt: "", useCount: 0, createdAt: "" };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(inv), { status: 201 }),
    );
    await createInvitation("token", "g1");
    const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["X-Active-Group-ID"]).toBe("g1");
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd frontend && npx vitest run src/lib/authApi.test.ts
```

Expected: PASS.

---

### Task 12: Update api.ts

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/api.test.ts`

- [ ] **Step 1: Replace `frontend/src/lib/api.ts`**

```ts
import type { HealthResponse } from "@/types/health";
import type {
  CreateStockItemRequest,
  ImageSearchResult,
  StockItem,
  UpdateStockItemRequest,
} from "@/types/stockItem";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

function apiHeaders(accessToken?: string, activeGroupId?: string): HeadersInit {
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  if (activeGroupId) headers["X-Active-Group-ID"] = activeGroupId;
  return headers;
}

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchStockItems(
  accessToken?: string,
  activeGroupId?: string,
): Promise<StockItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/stock-items`, {
    headers: apiHeaders(accessToken, activeGroupId),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function createStockItem(
  req: CreateStockItemRequest,
  accessToken?: string,
  activeGroupId?: string,
): Promise<StockItem> {
  const response = await fetch(`${API_BASE_URL}/api/stock-items`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...apiHeaders(accessToken, activeGroupId) },
    body: JSON.stringify(req),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function updateStockItem(
  id: string,
  req: UpdateStockItemRequest,
  accessToken?: string,
  activeGroupId?: string,
): Promise<StockItem> {
  const response = await fetch(`${API_BASE_URL}/api/stock-items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...apiHeaders(accessToken, activeGroupId) },
    body: JSON.stringify(req),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function deleteStockItem(
  id: string,
  accessToken?: string,
  activeGroupId?: string,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/stock-items/${id}`, {
    method: "DELETE",
    headers: apiHeaders(accessToken, activeGroupId),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

export type ImageSearchErrorKind = "quota" | "upstream" | "unavailable" | "unknown";

export class ImageSearchError extends Error {
  kind: ImageSearchErrorKind;
  constructor(kind: ImageSearchErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "ImageSearchError";
    this.kind = kind;
  }
}

async function searchImages(
  query: string,
  num = 10,
  accessToken?: string,
  activeGroupId?: string,
): Promise<ImageSearchResult[]> {
  const params = new URLSearchParams({ q: query, num: String(num) });
  const response = await fetch(`${API_BASE_URL}/api/image-search?${params}`, {
    headers: apiHeaders(accessToken, activeGroupId),
  });
  if (!response.ok) {
    if (response.status === 429) throw new ImageSearchError("quota");
    if (response.status === 502) throw new ImageSearchError("upstream");
    if (response.status === 503) throw new ImageSearchError("unavailable");
    throw new ImageSearchError("unknown", `HTTP ${response.status}`);
  }
  const body = await response.json();
  return body.items as ImageSearchResult[];
}

export {
  createStockItem,
  deleteStockItem,
  fetchHealth,
  fetchStockItems,
  searchImages,
  updateStockItem,
};
```

- [ ] **Step 2: Run existing api tests and fix signature-related failures**

```bash
cd frontend && npx vitest run src/lib/api.test.ts
```

Look at failures — they'll be from `bearerHeaders` being renamed or missing `activeGroupId`. Update `api.test.ts` to use `apiHeaders` behavior. In particular, add this test case to the relevant describe block:

```ts
it("sends X-Active-Group-ID header when activeGroupId provided", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify([]), { status: 200 }),
  );
  await fetchStockItems("access-token", "group-uuid");
  const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
  expect(headers["X-Active-Group-ID"]).toBe("group-uuid");
});
```

- [ ] **Step 3: Run all lib tests and commit**

```bash
cd frontend && npx vitest run src/lib/
```

Expected: PASS.

```bash
git add frontend/src/lib/authApi.ts frontend/src/lib/authApi.test.ts \
        frontend/src/lib/api.ts frontend/src/lib/api.test.ts
git commit -m "feat(frontend): update API layer for multi-group (activeGroupId, fetchMyGroups)"
```

---

### Task 13: Update AuthContext

**Files:**
- Modify: `frontend/src/contexts/AuthContext.tsx`
- Modify: `frontend/src/contexts/AuthContext.test.tsx`

- [ ] **Step 1: Replace `frontend/src/contexts/AuthContext.tsx`**

```tsx
"use client";

import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { fetchMyGroups } from "@/lib/authApi";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { GroupInfo } from "@/types/group";

const ACTIVE_GROUP_KEY = "pantry-panel:active-group-id";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  groups: GroupInfo[];
  group: GroupInfo | null;
  loading: boolean;
  signInWithGoogle: (redirectTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshGroup: () => Promise<void>;
  switchGroup: (groupId: string) => void;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  groups: [],
  group: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  refreshGroup: async () => {},
  switchGroup: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const applyGroups = useCallback((gs: GroupInfo[]) => {
    setGroups(gs);
    const savedId =
      typeof window !== "undefined"
        ? localStorage.getItem(ACTIVE_GROUP_KEY)
        : null;
    const active = gs.find((g) => g.groupId === savedId) ?? gs[0] ?? null;
    setGroup(active);
    if (active && typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_GROUP_KEY, active.groupId);
    }
  }, []);

  const loadGroups = useCallback(
    async (accessToken: string) => {
      const gs = await fetchMyGroups(accessToken).catch(() => []);
      applyGroups(gs);
    },
    [applyGroups],
  );

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) {
      setLoading(false);
      return;
    }
    client.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s) {
        loadGroups(s.access_token).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
  }, [loadGroups]);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s) {
        loadGroups(s.access_token);
      } else {
        setGroups([]);
        setGroup(null);
      }
    });
    return () => subscription.unsubscribe();
  }, [loadGroups]);

  const signInWithGoogle = async (redirectTo?: string) => {
    const client = getSupabaseClient();
    if (!client) return;
    await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          redirectTo ??
          (typeof window !== "undefined"
            ? `${window.location.origin}/stock-items`
            : undefined),
      },
    });
  };

  const signOut = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    await client.auth.signOut();
    setSession(null);
    setUser(null);
    setGroups([]);
    setGroup(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(ACTIVE_GROUP_KEY);
    }
  };

  const refreshGroup = useCallback(async () => {
    if (!session) return;
    await loadGroups(session.access_token);
  }, [session, loadGroups]);

  const switchGroup = useCallback(
    (groupId: string) => {
      const target = groups.find((g) => g.groupId === groupId);
      if (!target) return;
      setGroup(target);
      if (typeof window !== "undefined") {
        localStorage.setItem(ACTIVE_GROUP_KEY, groupId);
      }
    },
    [groups],
  );

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        groups,
        group,
        loading,
        signInWithGoogle,
        signOut,
        refreshGroup,
        switchGroup,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
```

- [ ] **Step 2: Run existing AuthContext tests and fix failures**

```bash
cd frontend && npx vitest run src/contexts/AuthContext.test.tsx
```

The existing tests mock `fetchMyGroup` (singular). Update mocks to use `fetchMyGroups` (plural). Also update any assertions that check `group` shape to account for the new `groups` field.

Open `frontend/src/contexts/AuthContext.test.tsx` and update:
- `vi.mock("@/lib/authApi", ...)` to mock `fetchMyGroups` instead of `fetchMyGroup`
- Any mock return value from `fetchMyGroup: vi.fn().mockResolvedValue(groupInfo)` → `fetchMyGroups: vi.fn().mockResolvedValue([groupInfo])`
- Tests that check `result.current.group` should still work (it's still a `GroupInfo | null`)

After fixing, run again:

```bash
cd frontend && npx vitest run src/contexts/AuthContext.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/contexts/AuthContext.tsx frontend/src/contexts/AuthContext.test.tsx
git commit -m "feat(frontend): add multi-group state, switchGroup, localStorage persistence to AuthContext"
```

---

### Task 14: Create GroupSwitcher component

**Files:**
- Create: `frontend/src/components/GroupSwitcher.tsx`
- Create: `frontend/src/components/GroupSwitcher.test.tsx`

- [ ] **Step 1: Write failing test (`GroupSwitcher.test.tsx`)**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { GroupInfo } from "@/types/group";
import GroupSwitcher from "./GroupSwitcher";

const groups: GroupInfo[] = [
  { groupId: "g1", name: "我が家", role: "owner" },
  { groupId: "g2", name: "実家", role: "member" },
];

describe("GroupSwitcher", () => {
  it("shows active group name in trigger button", () => {
    render(
      <GroupSwitcher
        groups={groups}
        activeGroup={groups[0]}
        onSwitch={vi.fn()}
        onCreateGroup={vi.fn()}
        onRenameGroup={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /我が家/ })).toBeInTheDocument();
  });

  it("opens dropdown and shows all groups on click", async () => {
    render(
      <GroupSwitcher
        groups={groups}
        activeGroup={groups[0]}
        onSwitch={vi.fn()}
        onCreateGroup={vi.fn()}
        onRenameGroup={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /我が家/ }));
    expect(screen.getByText("実家")).toBeInTheDocument();
    expect(screen.getByText("新しいグループを作成")).toBeInTheDocument();
  });

  it("calls onSwitch when a non-active group is clicked", async () => {
    const onSwitch = vi.fn();
    render(
      <GroupSwitcher
        groups={groups}
        activeGroup={groups[0]}
        onSwitch={onSwitch}
        onCreateGroup={vi.fn()}
        onRenameGroup={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /我が家/ }));
    await userEvent.click(screen.getByText("実家"));
    expect(onSwitch).toHaveBeenCalledWith("g2");
  });

  it("shows text input when owner clicks active group name to rename", async () => {
    render(
      <GroupSwitcher
        groups={groups}
        activeGroup={groups[0]}
        onSwitch={vi.fn()}
        onCreateGroup={vi.fn()}
        onRenameGroup={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /我が家/ }));
    // Click the active group name span (not the trigger button)
    await userEvent.click(screen.getByTestId("group-name-g1"));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("calls onRenameGroup on Enter with new name", async () => {
    const onRenameGroup = vi.fn().mockResolvedValue(undefined);
    render(
      <GroupSwitcher
        groups={groups}
        activeGroup={groups[0]}
        onSwitch={vi.fn()}
        onCreateGroup={vi.fn()}
        onRenameGroup={onRenameGroup}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /我が家/ }));
    await userEvent.click(screen.getByTestId("group-name-g1"));
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "新しい名前");
    await userEvent.keyboard("{Enter}");
    expect(onRenameGroup).toHaveBeenCalledWith("g1", "新しい名前");
  });

  it("shows input and calls onCreateGroup on Enter", async () => {
    const onCreateGroup = vi.fn().mockResolvedValue(undefined);
    render(
      <GroupSwitcher
        groups={groups}
        activeGroup={groups[0]}
        onSwitch={vi.fn()}
        onCreateGroup={onCreateGroup}
        onRenameGroup={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /我が家/ }));
    await userEvent.click(screen.getByText("新しいグループを作成"));
    const input = screen.getByPlaceholderText("グループ名");
    await userEvent.type(input, "新グループ");
    await userEvent.keyboard("{Enter}");
    expect(onCreateGroup).toHaveBeenCalledWith("新グループ");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend && npx vitest run src/components/GroupSwitcher.test.tsx 2>&1 | tail -10
```

Expected: FAIL — `GroupSwitcher` module not found.

- [ ] **Step 3: Create `frontend/src/components/GroupSwitcher.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { GroupInfo } from "@/types/group";

type Props = {
  groups: GroupInfo[];
  activeGroup: GroupInfo | null;
  onSwitch: (groupId: string) => void;
  onCreateGroup: (name: string) => Promise<void>;
  onRenameGroup: (groupId: string, name: string) => Promise<void>;
};

export default function GroupSwitcher({
  groups,
  activeGroup,
  onSwitch,
  onCreateGroup,
  onRenameGroup,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setEditingGroupId(null);
        setCreatingNew(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleRename = async (groupId: string) => {
    const trimmed = editingName.trim();
    if (trimmed) await onRenameGroup(groupId, trimmed);
    setEditingGroupId(null);
  };

  const handleCreateGroup = async () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    await onCreateGroup(trimmed);
    setNewGroupName("");
    setCreatingNew(false);
    setOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 opacity-80 hover:opacity-100 text-sm text-white"
      >
        {activeGroup?.name ?? "グループなし"}
        <span className="text-xs">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
          {groups.map((g) => {
            const isActive = g.groupId === activeGroup?.groupId;
            const isOwner = g.role === "owner";
            const isEditing = editingGroupId === g.groupId;

            return (
              <div
                key={g.groupId}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                onClick={() => {
                  if (!isEditing && !isActive) {
                    onSwitch(g.groupId);
                    setOpen(false);
                  }
                }}
              >
                <span className="w-4 text-[#00d1b2] text-sm flex-shrink-0">
                  {isActive ? "✓" : ""}
                </span>

                {isEditing ? (
                  <input
                    type="text"
                    autoFocus
                    value={editingName}
                    className="flex-1 border border-gray-300 rounded px-1 py-0.5 text-sm text-gray-900"
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(g.groupId);
                      if (e.key === "Escape") setEditingGroupId(null);
                    }}
                    onBlur={() => handleRename(g.groupId)}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    data-testid={`group-name-${g.groupId}`}
                    className={`flex-1 text-sm text-gray-800 ${isActive && isOwner ? "cursor-text hover:underline" : ""}`}
                    onClick={(e) => {
                      if (isActive && isOwner) {
                        e.stopPropagation();
                        setEditingGroupId(g.groupId);
                        setEditingName(g.name);
                      }
                    }}
                  >
                    {g.name}
                    {isOwner && (
                      <span className="ml-1 text-xs text-gray-400">
                        (オーナー)
                      </span>
                    )}
                  </span>
                )}
              </div>
            );
          })}

          <div className="border-t border-gray-100 mt-1 pt-1">
            {creatingNew ? (
              <div className="px-3 py-2">
                <input
                  type="text"
                  autoFocus
                  placeholder="グループ名"
                  value={newGroupName}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateGroup();
                    if (e.key === "Escape") {
                      setCreatingNew(false);
                      setNewGroupName("");
                    }
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-[#00d1b2] hover:bg-gray-50 flex items-center gap-1"
                onClick={() => setCreatingNew(true)}
              >
                <span>＋</span> 新しいグループを作成
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run GroupSwitcher tests**

```bash
cd frontend && npx vitest run src/components/GroupSwitcher.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/GroupSwitcher.tsx frontend/src/components/GroupSwitcher.test.tsx
git commit -m "feat(frontend): add GroupSwitcher dropdown component with inline rename"
```

---

### Task 15: Update ImageSelectionModal

**Files:**
- Modify: `frontend/src/components/ImageSelectionModal.tsx`
- Modify: `frontend/src/components/ImageSelectionModal.test.tsx`

- [ ] **Step 1: Add `activeGroupId` prop to `ImageSelectionModal`**

Read current file:

```bash
grep -n "accessToken\|searchImages\|Props\|type " frontend/src/components/ImageSelectionModal.tsx | head -20
```

Find the Props type definition and add `activeGroupId?: string`. Find the `searchImages` call and add `activeGroupId` as the 4th argument.

The props type should become:

```tsx
type Props = {
  // ... existing props ...
  accessToken?: string;
  activeGroupId?: string;  // add this line
};
```

The `searchImages` call should become:

```tsx
const results = await searchImages(q, 10, accessToken, activeGroupId);
```

- [ ] **Step 2: Run ImageSelectionModal tests**

```bash
cd frontend && npx vitest run src/components/ImageSelectionModal.test.tsx
```

Fix any test failures (add `activeGroupId` prop to test renders if required).

---

### Task 16: Update stock-items/page.tsx

**Files:**
- Modify: `frontend/src/app/stock-items/page.tsx`

- [ ] **Step 1: Update imports**

Add to the imports section:

```tsx
import GroupSwitcher from "@/components/GroupSwitcher";
import { createGroup, updateGroupName } from "@/lib/authApi";
```

- [ ] **Step 2: Update `useAuth` destructuring**

```tsx
const { session, group, groups, switchGroup, signOut, loading: authLoading, refreshGroup } = useAuth();
const accessToken = session?.access_token;
const activeGroupId = group?.groupId;
```

- [ ] **Step 3: Add group management handlers** (inside component, after `handleImageSelect`)

```tsx
const handleRenameGroup = async (groupId: string, name: string) => {
  if (!accessToken || !activeGroupId) return;
  await updateGroupName(groupId, name, accessToken, activeGroupId);
  await refreshGroup();
};

const handleCreateNewGroup = async (name: string) => {
  if (!accessToken) return;
  await createGroup(name, accessToken);
  await refreshGroup();
};
```

- [ ] **Step 4: Pass `activeGroupId` to all API calls**

Update every call in the file:

```tsx
// fetchStockItems (two places: useEffect and handleRealtimeChange)
fetchStockItems(accessToken, activeGroupId)

// handleCreate
await createStockItem({ name, category, wantToBuy }, accessToken, activeGroupId);
const data = await fetchStockItems(accessToken, activeGroupId);

// handleSave
await updateStockItem(editingItem.id, { name, category }, accessToken, activeGroupId);
const data = await fetchStockItems(accessToken, activeGroupId);

// handleToggleWantToBuy
await updateStockItem(item.id, { wantToBuy: !item.wantToBuy }, accessToken, activeGroupId);
const data = await fetchStockItems(accessToken, activeGroupId);

// handleDelete
await deleteStockItem(id, accessToken, activeGroupId);
const data = await fetchStockItems(accessToken, activeGroupId);

// handleImageSelect
await updateStockItem(imageEditingItem.id, { imageUrl }, accessToken, activeGroupId);
const data = await fetchStockItems(accessToken, activeGroupId);
```

- [ ] **Step 5: Pass `activeGroupId` to `ImageSelectionModal`**

```tsx
<ImageSelectionModal
  item={...}
  isOpen={!!imageEditingItem}
  onClose={() => setImageEditingItem(null)}
  onSelect={handleImageSelect}
  accessToken={accessToken}
  activeGroupId={activeGroupId}
/>
```

- [ ] **Step 6: Replace header with `GroupSwitcher`**

Replace the current header `<div className="flex items-center gap-3 text-sm">` block:

```tsx
<div className="flex items-center gap-3 text-sm">
  <GroupSwitcher
    groups={groups}
    activeGroup={group}
    onSwitch={switchGroup}
    onCreateGroup={handleCreateNewGroup}
    onRenameGroup={handleRenameGroup}
  />
  {group?.role === "owner" && (
    <a
      href="/invite"
      className="opacity-80 hover:opacity-100 underline"
    >
      招待
    </a>
  )}
  <button
    type="button"
    onClick={() => signOut()}
    className="opacity-80 hover:opacity-100"
  >
    サインアウト
  </button>
</div>
```

- [ ] **Step 7: Run page tests**

```bash
cd frontend && npx vitest run src/app/stock-items/
```

Fix any failures from the API signature changes.

---

### Task 17: Update invite/page.tsx

**Files:**
- Modify: `frontend/src/app/invite/page.tsx`

- [ ] **Step 1: Update `createInvitation` call to pass `activeGroupId`**

In `invite/page.tsx`, update the `useAuth` destructuring and `handleGenerate`:

```tsx
const { session, group, loading } = useAuth();
```

Update `handleGenerate`:

```tsx
const handleGenerate = async () => {
  if (!session || !group) return;
  setGenerating(true);
  setError(null);
  try {
    const inv = await createInvitation(session.access_token, group.groupId);
    setInvitation(inv);
  } catch {
    setError("招待リンクの生成に失敗しました");
  } finally {
    setGenerating(false);
  }
};
```

---

### Task 18: Full test pass and cleanup

**Files:** none (verification only)

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && go test ./... -count=1 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 2: Run all frontend tests**

```bash
cd frontend && npx vitest run
```

Expected: all pass.

- [ ] **Step 3: TypeScript type check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Biome lint**

```bash
cd frontend && npx biome check src/
```

Fix any warnings.

- [ ] **Step 5: Commit any remaining fixes**

```bash
git add -p
git commit -m "fix: resolve type and lint issues in group management feature"
```

(Skip this step if there are no changes.)

---

### Task 19: Archive, push, and PR

- [ ] **Step 1: Run `opsx:archive`**

Use the `opsx:archive` skill to sync specs and archive the change on the feature branch.

- [ ] **Step 2: Push branch**

```bash
git push -u origin $(git branch --show-current)
```

- [ ] **Step 3: Create PR**

```bash
gh pr create \
  --title "グループ名編集 / 複数グループ作成・切り替え" \
  --body "$(cat <<'EOF'
## Summary
- グループ名のインライン編集（オーナーのみ、ヘッダードロップダウン内）
- 複数グループへの同時所属・ヘッダードロップダウンでの切り替え
- アクティブグループを localStorage で永続化
- Backend: `PATCH /api/groups/:id`、`X-Active-Group-ID` ミドルウェア、`FindMembershipsByUserID` 複数グループ対応

## Test plan
- [ ] `cd backend && go test ./... -count=1` passes
- [ ] `cd frontend && npx vitest run` passes
- [ ] `cd frontend && npx tsc --noEmit` clean
- [ ] `cd frontend && npx biome check src/` clean

Closes #ISSUE_NUMBER
EOF
)"
```

Replace `ISSUE_NUMBER` with the actual issue number from Task 1.

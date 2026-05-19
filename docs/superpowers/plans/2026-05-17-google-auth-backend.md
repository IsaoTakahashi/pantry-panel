# Google 認証 — Plan A: Backend Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note for this project:** Per `.claude/rules/general.md`, **the user writes test/production code; Claude proposes and reviews**. This is Plan A (Backend Auth) of a 3-part series (A: Backend / B: Frontend / C: Data Migration).

**Goal:** バックエンドに JWT 認証ミドルウェア・グループ管理 API を追加し、`stock_items` の CRUD をグループ単位にスコープする。

**Architecture:** JWT 検証に `golang-jwt/jwt/v5` + `MicahParks/keyfunc/v3` (JWKS) を使用。Echo ミドルウェアで API に認証を適用し `AuthInfo{UserID, GroupID, Role}` を Echo コンテキストに格納する。stock_items CRUD は `group_id` でフィルタリング。`SUPABASE_JWKS_URL` 未設定時は認証ミドルウェアをスキップし既存動作を維持（開発時後方互換）。

**Tech Stack:** Go (Echo v5 fork) / golang-jwt/jwt/v5 / MicahParks/keyfunc/v3 / pgx v5 / testify / testcontainers

**Spec:** `docs/superpowers/specs/2026-05-17-google-auth-design.md`

**Issue:** #79

---

## File Structure

### DB Migrations (new)
- `backend/db/migrations/005_add_groups.sql` — groups / group_members / invitations テーブル
- `backend/db/migrations/006_add_group_id_to_stock_items.sql` — stock_items に group_id カラム追加
- `backend/db/migrations/007_update_rls_policies.sql` — RLS ポリシー更新（Supabase 手動適用）

### Backend (new)
- `backend/middleware/auth.go` — `AuthInfo` 型 / JWT 検証ミドルウェア / `GetAuthInfo` / `SetAuthInfo`
- `backend/middleware/auth_test.go` — ミドルウェア単体テスト（HS256 テストキーで代替）
- `backend/repository/group.go` — `Group` / `GroupMembership` / `Invitation` 型 + `GroupRepository` インターフェース + sentinel errors
- `backend/repository/group_pg.go` — PostgreSQL 実装
- `backend/repository/group_test.go` — 統合テスト（testcontainers、既存 testPool 共有）
- `backend/handler/group.go` — グループ・招待ハンドラ
- `backend/handler/group_test.go` — ユニットテスト（mock）

### Backend (modify)
- `backend/go.mod` / `go.sum` — golang-jwt/jwt/v5 + MicahParks/keyfunc/v3 追加
- `backend/repository/stock_item.go` — `StockItem` に `GroupID` 追加; 全メソッドに `groupID uuid.UUID` 追加
- `backend/repository/stock_item_pg.go` — SQL に group_id フィルタ/セット追加
- `backend/repository/stock_item_test.go` — TestMain に migration 005/006 追加; 全テストに groupID を追加
- `backend/handler/stock_item.go` — 各ハンドラで `GetAuthInfo(c)` から groupID を取得
- `backend/handler/stock_item_test.go` — mock シグネチャ更新; `SetAuthInfo` でテスト用 AuthInfo をセット
- `backend/main.go` — JWT ミドルウェア条件付き登録 + 新規ルート + `SUPABASE_JWKS_URL`

---

## Task 1: DB Migration 005 — グループテーブル作成

**Files:**
- Create: `backend/db/migrations/005_add_groups.sql`

- [ ] **Step 1: マイグレーション SQL を作成する**

`backend/db/migrations/005_add_groups.sql`:

```sql
CREATE TABLE groups (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- user_id FK は auth.users を参照するが、auth スキーマがない環境 (testcontainers/local) では
-- FK 制約を追加しない。Supabase 環境のみ DO ブロックで追加する。
CREATE TABLE group_members (
    group_id  UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id   UUID NOT NULL,
    role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);

CREATE TABLE invitations (
    token      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id   UUID        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_by UUID        NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    use_count  INT         NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supabase 環境のみ auth.users への FK を追加
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'auth') THEN
    ALTER TABLE group_members
      ADD CONSTRAINT group_members_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    ALTER TABLE invitations
      ADD CONSTRAINT invitations_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $$;
```

- [ ] **Step 2: Supabase Dashboard の SQL Editor で実行する**

Supabase Dashboard → SQL Editor に上記 SQL を貼り付けて実行。ローカル開発用 compose Postgres がある場合はそちらにも適用する。

- [ ] **Step 3: コミット**

```bash
git add backend/db/migrations/005_add_groups.sql
git commit -m "Add groups, group_members, invitations tables (migration 005)"
```

---

## Task 2: DB Migration 006 — stock_items に group_id 追加

**Files:**
- Create: `backend/db/migrations/006_add_group_id_to_stock_items.sql`

- [ ] **Step 1: マイグレーション SQL を作成する**

`backend/db/migrations/006_add_group_id_to_stock_items.sql`:

```sql
-- group_id を nullable で追加（既存行は Plan C のデータ移行で埋める）
ALTER TABLE stock_items
    ADD COLUMN group_id UUID REFERENCES groups(id);
```

- [ ] **Step 2: Supabase Dashboard の SQL Editor で実行する**

- [ ] **Step 3: コミット**

```bash
git add backend/db/migrations/006_add_group_id_to_stock_items.sql
git commit -m "Add group_id column to stock_items (migration 006)"
```

---

## Task 3: JWT ライブラリの依存追加

**Files:**
- Modify: `backend/go.mod`, `backend/go.sum`

- [ ] **Step 1: 最新バージョンを確認して追加する**

```bash
cd backend
go get github.com/golang-jwt/jwt/v5@latest
go get github.com/MicahParks/keyfunc/v3@latest
```

実行後 `go.mod` に以下が追加されていることを確認:
```
github.com/golang-jwt/jwt/v5 vX.X.X
github.com/MicahParks/keyfunc/v3 vX.X.X
```

- [ ] **Step 2: ビルドが通ることを確認する**

```bash
go build ./...
```

Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add go.mod go.sum
git commit -m "Add golang-jwt/jwt/v5 and MicahParks/keyfunc/v3 dependencies"
```

---

## Task 4: グループリポジトリの型・インターフェース定義

**Files:**
- Create: `backend/repository/group.go`

- [ ] **Step 1: 型・インターフェース・sentinel errors を定義する**

`backend/repository/group.go`:

```go
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
```

- [ ] **Step 2: コンパイル確認**

```bash
go build ./...
```

Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add backend/repository/group.go
git commit -m "Add GroupRepository interface and types"
```

---

## Task 5: グループリポジトリの統合テスト作成

**Files:**
- Create: `backend/repository/group_test.go`
- Modify: `backend/repository/stock_item_test.go` (TestMain に migration 005/006 追加)

- [ ] **Step 1: TestMain に migration 005/006 を追加する**

`backend/repository/stock_item_test.go` の `TestMain` 内、migration 適用ループを以下に差し替える:

```go
for _, migration := range []string{
    "../db/migrations/001_create_stock_items.sql",
    "../db/migrations/004_add_sorted_at_to_stock_items.sql",
    "../db/migrations/005_add_groups.sql",
    "../db/migrations/006_add_group_id_to_stock_items.sql",
} {
```

- [ ] **Step 2: 統合テストを作成する**

`backend/repository/group_test.go`:

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
```

- [ ] **Step 3: テストが失敗することを確認する（実装前）**

```bash
cd backend
go test ./repository/... -run TestCreateGroup
```

Expected: FAIL (コンパイルエラー or `PgGroupRepository` が未実装)

---

## Task 6: グループリポジトリの PostgreSQL 実装

**Files:**
- Create: `backend/repository/group_pg.go`

- [ ] **Step 1: PostgreSQL 実装を作成する**

`backend/repository/group_pg.go`:

```go
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
	defer tx.Rollback(ctx)

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
	defer tx.Rollback(ctx)

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
```

- [ ] **Step 2: テストを実行して全て通ることを確認する**

```bash
cd backend
go test ./repository/... -v -run "TestCreateGroup|TestFindMembership|TestCreateInvitation|TestFindInvitation|TestAcceptInvitation"
```

Expected: PASS（全テスト）

- [ ] **Step 3: コミット**

```bash
git add backend/repository/group.go backend/repository/group_pg.go backend/repository/group_test.go backend/repository/stock_item_test.go
git commit -m "Add GroupRepository interface and PostgreSQL implementation"
```

---

## Task 7: JWT 認証ミドルウェアのテスト作成

**Files:**
- Create: `backend/middleware/auth_test.go`

- [ ] **Step 1: テストを作成する**

`backend/middleware/auth_test.go`:

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
```

- [ ] **Step 2: テストが失敗することを確認する（実装前）**

```bash
cd backend
go test ./middleware/... -v
```

Expected: FAIL（コンパイルエラー）

---

## Task 8: JWT 認証ミドルウェアの実装

**Files:**
- Create: `backend/middleware/auth.go`

- [ ] **Step 1: ミドルウェアを実装する**

`backend/middleware/auth.go`:

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
	GroupID uuid.UUID // グループ未所属なら uuid.Nil
	Role    string    // グループ未所属なら ""
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
				jwt.WithValidMethods([]string{"RS256", "HS256"}))
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

			membership, err := cfg.GroupRepo.FindMembershipByUserID(c.Request().Context(), userID)
			if err != nil {
				return c.JSON(http.StatusInternalServerError, map[string]string{"message": "Internal Server Error"})
			}
			if membership != nil {
				info.GroupID = membership.GroupID
				info.Role = membership.Role
			} else if cfg.RequireGroup {
				return c.JSON(http.StatusForbidden, map[string]string{"message": "Not a member of any group"})
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

- [ ] **Step 2: テストを実行して全て通ることを確認する**

```bash
cd backend
go test ./middleware/... -v
```

Expected: PASS（全テスト）

- [ ] **Step 3: コミット**

```bash
git add backend/middleware/auth.go backend/middleware/auth_test.go
git commit -m "Add JWT authentication middleware with group lookup"
```

---

## Task 9: グループハンドラのテスト作成

**Files:**
- Create: `backend/handler/group_test.go`

- [ ] **Step 1: テストを作成する**

`backend/handler/group_test.go`:

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
	c.SetParamNames("token")
	c.SetParamValues(token.String())
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
	c.SetParamNames("token")
	c.SetParamValues(token.String())
	middleware.SetAuthInfo(c, &middleware.AuthInfo{UserID: userID})
	require.NoError(t, h.AcceptInvitation(c))

	assert.Equal(t, http.StatusGone, rec.Code)
}
```

- [ ] **Step 2: テストが失敗することを確認する（実装前）**

```bash
cd backend
go test ./handler/... -run "TestCreateGroup|TestGetMyGroup|TestCreateInvitation|TestAcceptInvitation"
```

Expected: FAIL（コンパイルエラー）

---

## Task 10: グループハンドラの実装

**Files:**
- Create: `backend/handler/group.go`

- [ ] **Step 1: ハンドラを実装する**

`backend/handler/group.go`:

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

func (h *GroupHandler) CreateGroup(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, ErrorResponse{Message: "Unauthorized"})
	}

	// 既にグループに所属しているか確認
	existing, err := h.repo.FindMembershipByUserID(c.Request().Context(), authInfo.UserID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorResponse{Message: "Internal Server Error"})
	}
	if existing != nil {
		return c.JSON(http.StatusConflict, ErrorResponse{Message: "Already a member of a group"})
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

func (h *GroupHandler) GetMyGroup(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, ErrorResponse{Message: "Unauthorized"})
	}

	membership, err := h.repo.FindMembershipByUserID(c.Request().Context(), authInfo.UserID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, ErrorResponse{Message: "Internal Server Error"})
	}
	if membership == nil {
		return c.JSON(http.StatusNotFound, ErrorResponse{Message: "Not a member of any group"})
	}
	return c.JSON(http.StatusOK, membership)
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

	// 参加後のメンバーシップを返す
	membership, err := h.repo.FindMembershipByUserID(c.Request().Context(), authInfo.UserID)
	if err != nil || membership == nil {
		return c.JSON(http.StatusInternalServerError, ErrorResponse{Message: "Internal Server Error"})
	}
	return c.JSON(http.StatusOK, membership)
}
```

- [ ] **Step 2: テストを実行して全て通ることを確認する**

```bash
cd backend
go test ./handler/... -v -run "TestCreateGroup|TestGetMyGroup|TestCreateInvitation|TestAcceptInvitation"
```

Expected: PASS（全テスト）

- [ ] **Step 3: コミット**

```bash
git add backend/handler/group.go backend/handler/group_test.go
git commit -m "Add group and invitation handlers"
```

---

## Task 11: StockItem に GroupID を追加 + リポジトリインターフェース更新

**Files:**
- Modify: `backend/repository/stock_item.go`

- [ ] **Step 1: `StockItem` に GroupID を追加し、インターフェースを更新する**

`backend/repository/stock_item.go` を以下に置き換える:

```go
package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type StockItem struct {
	ID        uuid.UUID `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	Category  string    `json:"category" db:"category"`
	ImageURL  *string   `json:"imageUrl" db:"image_url"`
	WantToBuy bool      `json:"wantToBuy" db:"want_to_buy"`
	GroupID   uuid.UUID `json:"groupId" db:"group_id"`
	CreatedAt time.Time `json:"createdAt" db:"created_at"`
	UpdatedAt time.Time `json:"updatedAt" db:"updated_at"`
	SortedAt  time.Time `json:"sortedAt" db:"sorted_at"`
}

type StockItemRepository interface {
	List(ctx context.Context, groupID uuid.UUID) ([]StockItem, error)
	Get(ctx context.Context, id uuid.UUID, groupID uuid.UUID) (*StockItem, error)
	Create(ctx context.Context, groupID uuid.UUID, name, category string, wantToBuy *bool) (*StockItem, error)
	Update(ctx context.Context, id uuid.UUID, groupID uuid.UUID, params UpdateParams) (*StockItem, error)
	Delete(ctx context.Context, id uuid.UUID, groupID uuid.UUID) error
}

type UpdateParams struct {
	Name      *string
	Category  *string
	WantToBuy *bool
	ImageURL  *ImageURLUpdate
}

type ImageURLUpdate struct {
	Value *string
}
```

- [ ] **Step 2: ビルドエラーを確認する（次のタスクで修正）**

```bash
go build ./...
```

Expected: コンパイルエラー（PgStockItemRepository が古いシグネチャを実装しているため）

---

## Task 12: PgStockItemRepository を更新する

**Files:**
- Modify: `backend/repository/stock_item_pg.go`

- [ ] **Step 1: 全メソッドに groupID を追加してSQLを更新する**

`backend/repository/stock_item_pg.go` を以下に置き換える:

```go
package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PgStockItemRepository struct {
	pool *pgxpool.Pool
}

func NewPgStockItemRepository(pool *pgxpool.Pool) *PgStockItemRepository {
	return &PgStockItemRepository{pool: pool}
}

const stockItemColumns = "id, name, category, image_url, want_to_buy, group_id, created_at, updated_at, sorted_at"

func (r *PgStockItemRepository) List(ctx context.Context, groupID uuid.UUID) ([]StockItem, error) {
	rows, _ := r.pool.Query(ctx,
		"SELECT "+stockItemColumns+" FROM stock_items WHERE group_id = $1 ORDER BY sorted_at DESC",
		groupID)
	return pgx.CollectRows(rows, pgx.RowToStructByName[StockItem])
}

func (r *PgStockItemRepository) Get(ctx context.Context, id uuid.UUID, groupID uuid.UUID) (*StockItem, error) {
	rows, _ := r.pool.Query(ctx,
		"SELECT "+stockItemColumns+" FROM stock_items WHERE id = $1 AND group_id = $2",
		id, groupID)
	return pgx.CollectExactlyOneRow(rows, pgx.RowToAddrOfStructByName[StockItem])
}

func (r *PgStockItemRepository) Create(ctx context.Context, groupID uuid.UUID, name, category string, wantToBuy *bool) (*StockItem, error) {
	rows, _ := r.pool.Query(ctx,
		"INSERT INTO stock_items (name, category, want_to_buy, group_id, sorted_at) VALUES ($1, $2, COALESCE($3, false), $4, NOW()) RETURNING "+stockItemColumns,
		name, category, wantToBuy, groupID)
	return pgx.CollectExactlyOneRow(rows, pgx.RowToAddrOfStructByName[StockItem])
}

func (r *PgStockItemRepository) Update(ctx context.Context, id uuid.UUID, groupID uuid.UUID, params UpdateParams) (*StockItem, error) {
	var imageURLSet bool
	var imageURLValue *string
	if params.ImageURL != nil {
		imageURLSet = true
		imageURLValue = params.ImageURL.Value
	}

	rows, _ := r.pool.Query(ctx,
		`UPDATE stock_items SET
			name = COALESCE($3, name),
			category = COALESCE($4, category),
			want_to_buy = COALESCE($5, want_to_buy),
			image_url = CASE WHEN $6::boolean THEN $7 ELSE image_url END,
			updated_at = NOW(),
			sorted_at = CASE WHEN $5::boolean IS TRUE THEN NOW() ELSE sorted_at END
		WHERE id = $1 AND group_id = $2
		RETURNING `+stockItemColumns,
		id, groupID, params.Name, params.Category, params.WantToBuy, imageURLSet, imageURLValue)

	return pgx.CollectExactlyOneRow(rows, pgx.RowToAddrOfStructByName[StockItem])
}

func (r *PgStockItemRepository) Delete(ctx context.Context, id uuid.UUID, groupID uuid.UUID) error {
	result, err := r.pool.Exec(ctx,
		"DELETE FROM stock_items WHERE id = $1 AND group_id = $2",
		id, groupID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
```

- [ ] **Step 2: ビルドが通ることを確認する**

```bash
go build ./...
```

Expected: エラーなし（handler が古いシグネチャを呼んでいるためまだエラーが残る場合は Task 14 で修正）

---

## Task 13: StockItem リポジトリ統合テストを更新する

**Files:**
- Modify: `backend/repository/stock_item_test.go`

- [ ] **Step 1: `setupTestDB` で TRUNCATE 対象を更新する**

`stock_item_test.go` の `setupTestDB` 関数を以下に変更（group も TRUNCATE してから group を作成し、groupID を返す）:

```go
func setupTestDB(t *testing.T) (*pgxpool.Pool, uuid.UUID) {
	t.Helper()
	_, err := testPool.Exec(context.Background(),
		"TRUNCATE invitations, group_members, groups, stock_items CASCADE")
	require.NoError(t, err)

	// テスト用グループを作成
	var groupID uuid.UUID
	err = testPool.QueryRow(context.Background(),
		"INSERT INTO groups (name) VALUES ('テストグループ') RETURNING id").Scan(&groupID)
	require.NoError(t, err)

	return testPool, groupID
}
```

- [ ] **Step 2: 全テスト関数のシグネチャと呼び出しを更新する**

各テスト関数の先頭を `pool, groupID := setupTestDB(t)` に変更し、
`repo.List(ctx)` → `repo.List(ctx, groupID)` 、
`repo.Create(ctx, name, cat, wantToBuy)` → `repo.Create(ctx, groupID, name, cat, wantToBuy)` 、
`repo.Get(ctx, id)` → `repo.Get(ctx, id, groupID)` 、
`repo.Update(ctx, id, params)` → `repo.Update(ctx, id, groupID, params)` 、
`repo.Delete(ctx, id)` → `repo.Delete(ctx, id, groupID)` に更新する。

- [ ] **Step 3: テストを実行して全て通ることを確認する**

```bash
cd backend
go test ./repository/... -v
```

Expected: PASS（全テスト）

- [ ] **Step 4: コミット**

```bash
git add backend/repository/stock_item.go backend/repository/stock_item_pg.go backend/repository/stock_item_test.go
git commit -m "Update StockItemRepository to scope queries by group_id"
```

---

## Task 14: StockItem ハンドラを更新する

**Files:**
- Modify: `backend/handler/stock_item.go`
- Modify: `backend/handler/stock_item_test.go`

- [ ] **Step 1: 各ハンドラで GetAuthInfo を使って groupID を取得する**

`backend/handler/stock_item.go` — 各メソッドの先頭と repo 呼び出しを修正:

```go
// インポートに middleware を追加
import (
    ...
    "github.com/IsaoTakahashi/pantry-panel/backend/middleware"
    ...
)

func (h *StockItemHandler) List(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, ErrorResponse{Message: "Unauthorized"})
	}
	items, err := h.repo.List(c.Request().Context(), authInfo.GroupID)
	// ... 以降は既存のまま
}

func (h *StockItemHandler) Create(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, ErrorResponse{Message: "Unauthorized"})
	}
	// ... バリデーション後
	item, err := h.repo.Create(c.Request().Context(), authInfo.GroupID, req.Name, req.Category, req.WantToBuy)
	// ...
}

func (h *StockItemHandler) Update(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, ErrorResponse{Message: "Unauthorized"})
	}
	// ... id parse 後
	item, err := h.repo.Update(c.Request().Context(), id, authInfo.GroupID, params)
	// ...
}

func (h *StockItemHandler) Delete(c *echo.Context) error {
	authInfo, ok := middleware.GetAuthInfo(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, ErrorResponse{Message: "Unauthorized"})
	}
	// ... id parse 後
	item, err := h.repo.Get(c.Request().Context(), id, authInfo.GroupID)
	// ...
	err = h.repo.Delete(c.Request().Context(), id, authInfo.GroupID)
	// ...
}
```

- [ ] **Step 2: テストの mock シグネチャを更新する**

`backend/handler/stock_item_test.go` — mock の関数シグネチャを更新:

```go
type mockStockItemRepo struct {
	listFn   func(ctx context.Context, groupID uuid.UUID) ([]repository.StockItem, error)
	getFn    func(ctx context.Context, id uuid.UUID, groupID uuid.UUID) (*repository.StockItem, error)
	createFn func(ctx context.Context, groupID uuid.UUID, name, category string, wantToBuy *bool) (*repository.StockItem, error)
	updateFn func(ctx context.Context, id uuid.UUID, groupID uuid.UUID, params repository.UpdateParams) (*repository.StockItem, error)
	deleteFn func(ctx context.Context, id uuid.UUID, groupID uuid.UUID) error
}

func (m *mockStockItemRepo) List(ctx context.Context, groupID uuid.UUID) ([]repository.StockItem, error) {
	return m.listFn(ctx, groupID)
}
func (m *mockStockItemRepo) Get(ctx context.Context, id uuid.UUID, groupID uuid.UUID) (*repository.StockItem, error) {
	return m.getFn(ctx, id, groupID)
}
func (m *mockStockItemRepo) Create(ctx context.Context, groupID uuid.UUID, name, category string, wantToBuy *bool) (*repository.StockItem, error) {
	return m.createFn(ctx, groupID, name, category, wantToBuy)
}
func (m *mockStockItemRepo) Update(ctx context.Context, id uuid.UUID, groupID uuid.UUID, params repository.UpdateParams) (*repository.StockItem, error) {
	return m.updateFn(ctx, id, groupID, params)
}
func (m *mockStockItemRepo) Delete(ctx context.Context, id uuid.UUID, groupID uuid.UUID) error {
	return m.deleteFn(ctx, id, groupID)
}
```

- [ ] **Step 3: 全テスト関数に `middleware.SetAuthInfo` の呼び出しを追加する**

各テストの Echo context セットアップ後（`c := e.NewContext(req, rec)` の直後）に:

```go
testGroupID := uuid.New()
middleware.SetAuthInfo(c, &middleware.AuthInfo{
    UserID:  uuid.New(),
    GroupID: testGroupID,
    Role:    "owner",
})
```

`listFn`, `createFn` 等のモックも `groupID` 引数を受け取るよう更新する。

- [ ] **Step 4: テストを実行して全て通ることを確認する**

```bash
cd backend
go test ./handler/... -v
```

Expected: PASS（全テスト）

- [ ] **Step 5: コミット**

```bash
git add backend/handler/stock_item.go backend/handler/stock_item_test.go
git commit -m "Update stock_item handler to use group_id from auth context"
```

---

## Task 15: main.go を更新する

**Files:**
- Modify: `backend/main.go`

- [ ] **Step 1: JWT ミドルウェアと新規ルートを追加する**

`backend/main.go` に以下の変更を加える:

```go
import (
    // 既存のインポートに追加:
    "context"
    "log"

    "github.com/IsaoTakahashi/pantry-panel/backend/middleware"
    "github.com/IsaoTakahashi/pantry-panel/backend/repository"
    "github.com/MicahParks/keyfunc/v3"
    "github.com/golang-jwt/jwt/v5"
)

func main() {
    // ... 既存の pool 初期化 ...

    stockItemRepo := repository.NewPgStockItemRepository(pool)
    stockItemHandler := handler.NewStockItemHandler(stockItemRepo)

    groupRepo := repository.NewPgGroupRepository(pool)  // 追加
    groupHandler := handler.NewGroupHandler(groupRepo)  // 追加

    // ... imageClient 初期化 ...

    // JWT ミドルウェアのセットアップ（SUPABASE_JWKS_URL 未設定時はスキップ）
    var jwtGroupMW echo.MiddlewareFunc
    var jwtOnlyMW echo.MiddlewareFunc
    jwksURL := os.Getenv("SUPABASE_JWKS_URL")
    if jwksURL != "" {
        given, err := keyfunc.NewDefaultCtx(context.Background(), []string{jwksURL})
        if err != nil {
            log.Fatal(err)
        }
        jwtGroupMW = middleware.NewJWTAuth(middleware.JWTAuthConfig{
            KeyFunc:      given.Keyfunc,
            GroupRepo:    groupRepo,
            RequireGroup: true,
        })
        jwtOnlyMW = middleware.NewJWTAuth(middleware.JWTAuthConfig{
            KeyFunc:      given.Keyfunc,
            GroupRepo:    groupRepo,
            RequireGroup: false,
        })
        log.Println("JWT authentication enabled")
    } else {
        log.Println("warning: SUPABASE_JWKS_URL not set; authentication disabled")
        // nil ミドルウェアは echo.Use に渡せないので、何もしないミドルウェアを使う
        noopMW := func(next echo.HandlerFunc) echo.HandlerFunc {
            return next
        }
        jwtGroupMW = noopMW
        jwtOnlyMW = noopMW
    }

    // ... Echo + CORS セットアップ ...

    e.GET("/health", handler.HealthCheck(pool))

    // グループ・招待エンドポイント（JWT 必須、グループ不要）
    e.POST("/api/groups", groupHandler.CreateGroup, jwtOnlyMW)
    e.GET("/api/groups/me", groupHandler.GetMyGroup, jwtOnlyMW)
    e.POST("/api/invitations", groupHandler.CreateInvitation, jwtGroupMW)
    e.POST("/api/invitations/:token/accept", groupHandler.AcceptInvitation, jwtOnlyMW)

    // stock_items エンドポイント（JWT + グループ必須）
    e.GET("/api/stock-items", stockItemHandler.List, jwtGroupMW)
    e.GET("/api/image-search", imageSearchHandler.Search, jwtGroupMW)
    e.POST("/api/stock-items", stockItemHandler.Create, jwtGroupMW)
    e.PATCH("/api/stock-items/:id", stockItemHandler.Update, jwtGroupMW)
    e.DELETE("/api/stock-items/:id", stockItemHandler.Delete, jwtGroupMW)

    // ...
}
```

- [ ] **Step 2: ビルドが通ることを確認する**

```bash
go build ./...
```

Expected: エラーなし

- [ ] **Step 3: ローカルで起動して /health が返ることを確認する**

```bash
go run .
# 別ターミナルで
curl http://localhost:8080/health
```

Expected: `{"status":"ok","db":"connected"}`

- [ ] **Step 4: コミット**

```bash
git add backend/main.go
git commit -m "Register JWT middleware and group/invitation routes in main.go"
```

---

## Task 16: RLS Migration 007 の作成

**Files:**
- Create: `backend/db/migrations/007_update_rls_policies.sql`

- [ ] **Step 1: RLS 更新 SQL を作成する**

`backend/db/migrations/007_update_rls_policies.sql`:

```sql
-- stock_items の既存ポリシーをグループ単位に更新
-- Apply via Supabase Dashboard SQL Editor.
-- Rollback:
--   DROP POLICY IF EXISTS "stock_items authenticated select" ON public.stock_items;
--   CREATE POLICY "stock_items authenticated select" ON public.stock_items FOR SELECT TO authenticated USING (true);
--   DROP POLICY "stock_items anon select" ON public.stock_items;（旧 anon ポリシーが必要な場合のみ）

-- 旧ポリシーを削除
DROP POLICY IF EXISTS "stock_items authenticated select" ON public.stock_items;
DROP POLICY IF EXISTS "stock_items anon select" ON public.stock_items;

-- authenticated: 自分のグループの行のみ SELECT
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE POLICY "stock_items authenticated select"
      ON public.stock_items FOR SELECT TO authenticated
      USING (
        group_id IN (
          SELECT group_id FROM group_members
          WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- group_members RLS
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE POLICY "group_members authenticated select"
      ON public.group_members FOR SELECT TO authenticated
      USING (
        group_id IN (
          SELECT group_id FROM group_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- invitations RLS
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE POLICY "invitations authenticated select"
      ON public.invitations FOR SELECT TO authenticated
      USING (
        group_id IN (
          SELECT group_id FROM group_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;
```

**注意:** この SQL は Supabase 固有（`auth.uid()`）のため、Supabase Dashboard の SQL Editor で手動適用する。CI の testcontainers では DO ブロックの条件（`authenticated` ロールが存在しない）でスキップされる。

- [ ] **Step 2: Supabase Dashboard の SQL Editor で実行する**

Plan A の全機能がテスト済みになってから適用すること（フロントエンド実装後が安全）。

- [ ] **Step 3: コミット**

```bash
git add backend/db/migrations/007_update_rls_policies.sql
git commit -m "Add migration 007: update RLS policies for group-based access"
```

---

## Task 17: CI テストの確認とプッシュ

- [ ] **Step 1: ローカルで全テストを実行する**

```bash
cd backend
go test ./... -v
```

Expected: PASS（全テスト）

- [ ] **Step 2: ブランチをプッシュして CI を確認する**

```bash
git push origin 79-google-auth
```

GitHub Actions の CI (golangci-lint + go test) が PASS することを確認する。

- [ ] **Step 3: Plan A 完了**

Plan B（Frontend Auth）に進む前に、このブランチの backend 実装をレビューする。
Plan C（Data Migration）は全 Plan 完了後に本番デプロイ直前に実施する。

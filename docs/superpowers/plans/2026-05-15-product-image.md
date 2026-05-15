# 商品画像設定 (Phase 4 機能I) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note for this project:** Per `.claude/rules/general.md` and project memory, **the user writes test/production code; Claude proposes and reviews**. This plan is a structured proposal — the user will hand-implement each step for language/framework learning. Subagent execution is NOT used for this project.

**Goal:** Phase 4 機能I「商品画像設定」を実装する。カード画像クリックで Google Custom Search 検索モーダルを開き、画像を選択して保存する。

**Architecture:** Frontend → Backend `/image-search` → Google Custom Search API のプロキシ構成。画像 URL は `stock_items.image_url` に直接保存。PATCH の partial update に `imageUrl` を追加（`json.RawMessage` で `null` 明示と未指定を判別）。

**Tech Stack:** Go (Echo v5 fork) / pgx / Next.js / React / Vitest / Playwright / Google Custom Search JSON API

**Spec:** `docs/superpowers/specs/2026-05-15-product-image-design.md`

**Issue:** #64

---

## File Structure

### Backend (new)
- `backend/imagesearch/client.go` — `Client` interface + `GoogleClient` 実装
- `backend/imagesearch/client_test.go` — Google API レスポンスの mock テスト
- `backend/handler/image_search.go` — `GET /api/image-search` ハンドラ
- `backend/handler/image_search_test.go` — ハンドラ単体テスト

### Backend (modify)
- `backend/repository/stock_item.go` — `UpdateParams` に `ImageURL *ImageURLUpdate` 追加
- `backend/repository/stock_item_pg.go` — Update SQL に `image_url` の条件付き更新を追加
- `backend/repository/stock_item_test.go` — Update with imageUrl 各ケース
- `backend/handler/stock_item.go` — `UpdateStockItemRequest` に `ImageURL json.RawMessage` 追加、null 判別ロジック
- `backend/handler/stock_item_test.go` — PATCH imageUrl 各ケース
- `backend/main.go` — `/api/image-search` ルート追加、env var 読み込み
- `backend/.env.local.example`（新規 or 既存に追記）

### Frontend (new)
- `frontend/src/components/ImageSelectionModal.tsx`
- `frontend/src/components/ImageSelectionModal.test.tsx`
- `frontend/e2e/image-selection.spec.ts`

### Frontend (modify)
- `frontend/src/types/stockItem.ts` — `UpdateStockItemRequest.imageUrl?: string | null`
- `frontend/src/lib/api.ts` — `searchImages()` 追加、`ImageSearchError` クラス追加
- `frontend/src/lib/api.test.ts` — 新 API のケース追加
- `frontend/src/components/ItemCard.tsx` — 画像領域追加
- `frontend/src/components/ItemCard.test.tsx` — ケース追加
- `frontend/src/components/ItemCardSimple.tsx` — 32px サムネイル
- `frontend/src/components/ItemCardSimple.test.tsx` — ケース追加
- `frontend/src/app/stock-items/page.tsx` — `imageEditingItem` state 統合

### Docs (modify)
- `specs/openapi.yml`
- `.claude/rules/backend.md`
- `specs/features.md`（PR マージ後）

---

## Task 1: Repository に ImageURL を追加

**Files:**
- Modify: `backend/repository/stock_item.go`
- Modify: `backend/repository/stock_item_pg.go`
- Test: `backend/repository/stock_item_test.go`

- [ ] **Step 1: `UpdateParams` に ImageURL を追加**

`backend/repository/stock_item.go`:

```go
type UpdateParams struct {
	Name      *string
	Category  *string
	WantToBuy *bool
	ImageURL  *ImageURLUpdate // nil = 未指定（不変）
}

// ImageURLUpdate は image_url の更新指示。
// Value == nil なら NULL に更新、Value != nil なら *Value に更新。
type ImageURLUpdate struct {
	Value *string
}
```

- [ ] **Step 2: Update SQL に image_url の条件付き更新を追加**

`backend/repository/stock_item_pg.go`:

```go
func (r *PgStockItemRepository) Update(ctx context.Context, id uuid.UUID, params UpdateParams) (*StockItem, error) {
	var imageURLSet bool
	var imageURLValue *string
	if params.ImageURL != nil {
		imageURLSet = true
		imageURLValue = params.ImageURL.Value
	}

	rows, _ := r.pool.Query(ctx,
		`UPDATE stock_items SET
			name = COALESCE($2, name),
			category = COALESCE($3, category),
			want_to_buy = COALESCE($4, want_to_buy),
			image_url = CASE WHEN $5::boolean THEN $6 ELSE image_url END,
			updated_at = NOW()
		WHERE id = $1
		RETURNING id, name, category, image_url, want_to_buy, created_at, updated_at`,
		id, params.Name, params.Category, params.WantToBuy, imageURLSet, imageURLValue)

	return pgx.CollectExactlyOneRow(rows, pgx.RowToAddrOfStructByName[StockItem])
}
```

- [ ] **Step 3: 失敗テストを追加（integration test）**

`backend/repository/stock_item_test.go` に追加:

```go
func TestUpdate_ImageURL(t *testing.T) {
	ctx := context.Background()
	pool := newTestPool(t)
	repo := NewPgStockItemRepository(pool)

	created, _ := repo.Create(ctx, "image-test", "★")

	t.Run("set imageUrl to value", func(t *testing.T) {
		url := "https://example.com/a.jpg"
		updated, err := repo.Update(ctx, created.ID, UpdateParams{
			ImageURL: &ImageURLUpdate{Value: &url},
		})
		require.NoError(t, err)
		require.NotNil(t, updated.ImageURL)
		assert.Equal(t, "https://example.com/a.jpg", *updated.ImageURL)
	})

	t.Run("clear imageUrl to NULL", func(t *testing.T) {
		updated, err := repo.Update(ctx, created.ID, UpdateParams{
			ImageURL: &ImageURLUpdate{Value: nil},
		})
		require.NoError(t, err)
		assert.Nil(t, updated.ImageURL)
	})

	t.Run("imageUrl unspecified keeps existing", func(t *testing.T) {
		url := "https://example.com/b.jpg"
		_, _ = repo.Update(ctx, created.ID, UpdateParams{
			ImageURL: &ImageURLUpdate{Value: &url},
		})
		newName := "renamed"
		updated, err := repo.Update(ctx, created.ID, UpdateParams{
			Name: &newName, // ImageURL は未指定
		})
		require.NoError(t, err)
		require.NotNil(t, updated.ImageURL)
		assert.Equal(t, "https://example.com/b.jpg", *updated.ImageURL)
	})
}
```

- [ ] **Step 4: テスト実行 → 緑を確認**

```bash
cd backend
go test ./repository/... -run TestUpdate_ImageURL -v
```
Expected: PASS（Step 1-2 を先に書いているので緑）

- [ ] **Step 5: commit**

```bash
git add backend/repository/
git commit -m "Add imageUrl support to stock_item repository"
```

---

## Task 2: Handler PATCH で imageUrl を受け付ける

**Files:**
- Modify: `backend/handler/stock_item.go`
- Test: `backend/handler/stock_item_test.go`

- [ ] **Step 1: 失敗テストを追加**

`backend/handler/stock_item_test.go` に追加（既存テストと同じスタイル / mockRepo を使用）:

```go
func TestUpdate_ImageURL_SetValue(t *testing.T) {
	repo := newMockRepo()
	h := NewStockItemHandler(repo)
	body := `{"imageUrl": "https://example.com/x.jpg"}`
	req, rec := newPATCHRequest(t, body)
	c := echo.New().NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues(testItemID)

	err := h.Update(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, rec.Code)

	require.NotNil(t, repo.lastUpdateParams.ImageURL)
	require.NotNil(t, repo.lastUpdateParams.ImageURL.Value)
	assert.Equal(t, "https://example.com/x.jpg", *repo.lastUpdateParams.ImageURL.Value)
}

func TestUpdate_ImageURL_ExplicitNull(t *testing.T) {
	repo := newMockRepo()
	h := NewStockItemHandler(repo)
	body := `{"imageUrl": null}`
	// ... 同様に
	require.NotNil(t, repo.lastUpdateParams.ImageURL)
	assert.Nil(t, repo.lastUpdateParams.ImageURL.Value) // null = clear
}

func TestUpdate_ImageURL_Unspecified(t *testing.T) {
	repo := newMockRepo()
	h := NewStockItemHandler(repo)
	body := `{"name": "new name"}`
	// ... 同様に
	assert.Nil(t, repo.lastUpdateParams.ImageURL) // 未指定なので nil
}
```

> 既存テストに mockRepo がない場合は最初に作る。lastUpdateParams フィールドで repo.Update に渡された params をキャプチャする。

- [ ] **Step 2: テスト実行 → fail を確認**

```bash
cd backend
go test ./handler/... -run TestUpdate_ImageURL -v
```
Expected: FAIL（フィールド未定義 or null と未指定の判別ができない）

- [ ] **Step 3: 実装**

`backend/handler/stock_item.go`:

```go
import (
	"bytes"
	"encoding/json"
	...
)

type UpdateStockItemRequest struct {
	Name      *string         `json:"name"`
	Category  *string         `json:"category"`
	WantToBuy *bool           `json:"wantToBuy"`
	ImageURL  json.RawMessage `json:"imageUrl"`
}

func (h *StockItemHandler) Update(c *echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, ErrorResponse{Message: "Invalid ID"})
	}

	var req UpdateStockItemRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, ErrorResponse{Message: "Invalid request body"})
	}

	imageURLPatch, err := parseImageURLPatch(req.ImageURL)
	if err != nil {
		return c.JSON(http.StatusBadRequest, ErrorResponse{Message: "Invalid imageUrl"})
	}

	params := repository.UpdateParams{
		Name:      req.Name,
		Category:  req.Category,
		WantToBuy: req.WantToBuy,
		ImageURL:  imageURLPatch,
	}

	// ... 既存の repo.Update 呼び出し以下はそのまま
}

func parseImageURLPatch(raw json.RawMessage) (*repository.ImageURLUpdate, error) {
	if len(raw) == 0 {
		return nil, nil // 未指定
	}
	if bytes.Equal(raw, []byte("null")) {
		return &repository.ImageURLUpdate{Value: nil}, nil // 明示的に null
	}
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil, err
	}
	return &repository.ImageURLUpdate{Value: &s}, nil
}
```

- [ ] **Step 4: テスト実行 → 緑を確認**

```bash
go test ./handler/... -run TestUpdate_ImageURL -v
```
Expected: PASS（3 ケース全て）

- [ ] **Step 5: commit**

```bash
git add backend/handler/
git commit -m "Accept imageUrl in PATCH /stock-items/:id with null/unspecified distinction"
```

---

## Task 3: imagesearch パッケージ（Client interface + Google 実装）

**Files:**
- Create: `backend/imagesearch/client.go`
- Test: `backend/imagesearch/client_test.go`

- [ ] **Step 1: テスト先行で client 仕様を固める**

`backend/imagesearch/client_test.go`:

```go
package imagesearch

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGoogleClient_Search_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "test-query", r.URL.Query().Get("q"))
		assert.Equal(t, "image", r.URL.Query().Get("searchType"))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{
			"items": [
				{"link": "https://x.com/a.jpg", "image": {"thumbnailLink": "https://x.com/a-thumb.jpg"}, "title": "Apple"}
			]
		}`))
	}))
	defer server.Close()

	c := &GoogleClient{HTTPClient: server.Client(), APIKey: "k", CSEID: "id", BaseURL: server.URL}
	results, err := c.Search(context.Background(), "test-query", 5)
	require.NoError(t, err)
	require.Len(t, results, 1)
	assert.Equal(t, "https://x.com/a.jpg", results[0].ImageURL)
	assert.Equal(t, "https://x.com/a-thumb.jpg", results[0].ThumbnailURL)
	assert.Equal(t, "Apple", results[0].Title)
}

func TestGoogleClient_Search_QuotaExceeded(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error": {"code": 429, "message": "quota exceeded"}}`))
	}))
	defer server.Close()

	c := &GoogleClient{HTTPClient: server.Client(), APIKey: "k", CSEID: "id", BaseURL: server.URL}
	_, err := c.Search(context.Background(), "q", 5)
	assert.ErrorIs(t, err, ErrQuotaExceeded)
}

func TestGoogleClient_Search_UpstreamFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	c := &GoogleClient{HTTPClient: server.Client(), APIKey: "k", CSEID: "id", BaseURL: server.URL}
	_, err := c.Search(context.Background(), "q", 5)
	assert.ErrorIs(t, err, ErrUpstreamFailure)
}
```

- [ ] **Step 2: テスト実行 → fail（パッケージ未作成）**

```bash
cd backend
go test ./imagesearch/... -v
```
Expected: FAIL (no Go files / unresolved imports)

- [ ] **Step 3: 実装**

`backend/imagesearch/client.go`:

```go
package imagesearch

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
)

var (
	ErrQuotaExceeded   = errors.New("imagesearch: quota exceeded")
	ErrUpstreamFailure = errors.New("imagesearch: upstream failure")
)

type Result struct {
	ImageURL     string `json:"imageUrl"`
	ThumbnailURL string `json:"thumbnailUrl"`
	Title        string `json:"title"`
}

type Client interface {
	Search(ctx context.Context, query string, num int) ([]Result, error)
}

type GoogleClient struct {
	HTTPClient *http.Client
	APIKey     string
	CSEID      string
	BaseURL    string // default: https://www.googleapis.com/customsearch/v1
}

func NewGoogleClient(apiKey, cseID string) *GoogleClient {
	return &GoogleClient{
		HTTPClient: http.DefaultClient,
		APIKey:     apiKey,
		CSEID:      cseID,
		BaseURL:    "https://www.googleapis.com/customsearch/v1",
	}
}

func (c *GoogleClient) Search(ctx context.Context, query string, num int) ([]Result, error) {
	if num <= 0 || num > 10 {
		num = 10
	}

	params := url.Values{}
	params.Set("key", c.APIKey)
	params.Set("cx", c.CSEID)
	params.Set("q", query)
	params.Set("searchType", "image")
	params.Set("num", strconv.Itoa(num))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"?"+params.Encode(), nil)
	if err != nil {
		return nil, fmt.Errorf("imagesearch: build request: %w", err)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUpstreamFailure, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, ErrQuotaExceeded
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: status %d", ErrUpstreamFailure, resp.StatusCode)
	}

	var body struct {
		Items []struct {
			Link  string `json:"link"`
			Title string `json:"title"`
			Image struct {
				ThumbnailLink string `json:"thumbnailLink"`
			} `json:"image"`
		} `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("%w: decode: %v", ErrUpstreamFailure, err)
	}

	results := make([]Result, 0, len(body.Items))
	for _, it := range body.Items {
		results = append(results, Result{
			ImageURL:     it.Link,
			ThumbnailURL: it.Image.ThumbnailLink,
			Title:        it.Title,
		})
	}
	return results, nil
}
```

- [ ] **Step 4: テスト実行 → 緑**

```bash
go test ./imagesearch/... -v
```
Expected: PASS（3 ケース）

- [ ] **Step 5: commit**

```bash
git add backend/imagesearch/
git commit -m "Add imagesearch package with Google Custom Search client"
```

---

## Task 4: image_search ハンドラ + main.go ルート追加

**Files:**
- Create: `backend/handler/image_search.go`
- Test: `backend/handler/image_search_test.go`
- Modify: `backend/main.go`

- [ ] **Step 1: ハンドラ単体テスト**

`backend/handler/image_search_test.go`:

```go
package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/IsaoTakahashi/pantry-panel/backend/imagesearch"
	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubImageClient struct {
	results []imagesearch.Result
	err     error
}

func (s *stubImageClient) Search(_ context.Context, _ string, _ int) ([]imagesearch.Result, error) {
	return s.results, s.err
}

func TestImageSearch_Success(t *testing.T) {
	h := NewImageSearchHandler(&stubImageClient{
		results: []imagesearch.Result{{ImageURL: "https://x/a.jpg", ThumbnailURL: "https://x/a-t.jpg", Title: "A"}},
	})
	req := httptest.NewRequest(http.MethodGet, "/api/image-search?q=apple", nil)
	rec := httptest.NewRecorder()
	c := echo.New().NewContext(req, rec)

	require.NoError(t, h.Search(c))
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Contains(t, rec.Body.String(), `"imageUrl":"https://x/a.jpg"`)
}

func TestImageSearch_MissingQuery(t *testing.T) {
	h := NewImageSearchHandler(&stubImageClient{})
	req := httptest.NewRequest(http.MethodGet, "/api/image-search", nil)
	rec := httptest.NewRecorder()
	c := echo.New().NewContext(req, rec)
	require.NoError(t, h.Search(c))
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestImageSearch_QuotaExceeded(t *testing.T) {
	h := NewImageSearchHandler(&stubImageClient{err: imagesearch.ErrQuotaExceeded})
	req := httptest.NewRequest(http.MethodGet, "/api/image-search?q=x", nil)
	rec := httptest.NewRecorder()
	c := echo.New().NewContext(req, rec)
	require.NoError(t, h.Search(c))
	assert.Equal(t, http.StatusTooManyRequests, rec.Code)
}

func TestImageSearch_UpstreamFailure(t *testing.T) {
	h := NewImageSearchHandler(&stubImageClient{err: errors.New("boom")})
	// stub のエラーが ErrUpstreamFailure を包んでなくても 502 にする実装
	// 実装側で errors.Is(err, ErrUpstreamFailure) は handler 外で起きるので
	// ここでは「Quota 以外のエラーは 502」のロジックを検証する
	req := httptest.NewRequest(http.MethodGet, "/api/image-search?q=x", nil)
	rec := httptest.NewRecorder()
	c := echo.New().NewContext(req, rec)
	require.NoError(t, h.Search(c))
	assert.Equal(t, http.StatusBadGateway, rec.Code)
}

func TestImageSearch_NilClient_ReturnsServiceUnavailable(t *testing.T) {
	h := NewImageSearchHandler(nil) // env 未設定時の挙動
	req := httptest.NewRequest(http.MethodGet, "/api/image-search?q=x", nil)
	rec := httptest.NewRecorder()
	c := echo.New().NewContext(req, rec)
	require.NoError(t, h.Search(c))
	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)
	assert.True(t, strings.Contains(rec.Body.String(), "not configured"))
}
```

- [ ] **Step 2: テスト実行 → fail**

```bash
cd backend
go test ./handler/... -run TestImageSearch -v
```
Expected: FAIL

- [ ] **Step 3: 実装**

`backend/handler/image_search.go`:

```go
package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/IsaoTakahashi/pantry-panel/backend/imagesearch"
	"github.com/labstack/echo/v5"
)

type ImageSearchHandler struct {
	client imagesearch.Client // nil = 機能無効（env 未設定）
}

func NewImageSearchHandler(client imagesearch.Client) *ImageSearchHandler {
	return &ImageSearchHandler{client: client}
}

type ImageSearchResponse struct {
	Items []imagesearch.Result `json:"items"`
}

func (h *ImageSearchHandler) Search(c *echo.Context) error {
	if h.client == nil {
		return c.JSON(http.StatusServiceUnavailable, ErrorResponse{Message: "image search is not configured"})
	}

	q := c.QueryParam("q")
	if q == "" {
		return c.JSON(http.StatusBadRequest, ErrorResponse{Message: "query parameter 'q' is required"})
	}

	num := 10
	if n := c.QueryParam("num"); n != "" {
		if parsed, err := strconv.Atoi(n); err == nil && parsed > 0 && parsed <= 10 {
			num = parsed
		}
	}

	results, err := h.client.Search(c.Request().Context(), q, num)
	if err != nil {
		if errors.Is(err, imagesearch.ErrQuotaExceeded) {
			return c.JSON(http.StatusTooManyRequests, ErrorResponse{Message: "quota exceeded"})
		}
		return c.JSON(http.StatusBadGateway, ErrorResponse{Message: "image search failed"})
	}

	return c.JSON(http.StatusOK, ImageSearchResponse{Items: results})
}
```

- [ ] **Step 4: テスト実行 → 緑**

```bash
go test ./handler/... -run TestImageSearch -v
```
Expected: PASS（5 ケース）

- [ ] **Step 5: main.go にルートと env 読み込み追加**

`backend/main.go` の関連箇所を修正:

```go
import (
	...
	"github.com/IsaoTakahashi/pantry-panel/backend/imagesearch"
)

func main() {
	// ... 既存の DB/pool セットアップ後 ...

	stockItemRepo := repository.NewPgStockItemRepository(pool)
	stockItemHandler := handler.NewStockItemHandler(stockItemRepo)

	// ▼ ここから追加
	var imageClient imagesearch.Client
	googleKey := os.Getenv("GOOGLE_CSE_API_KEY")
	googleCSE := os.Getenv("GOOGLE_CSE_ID")
	if googleKey != "" && googleCSE != "" {
		imageClient = imagesearch.NewGoogleClient(googleKey, googleCSE)
	} else {
		log.Println("warning: GOOGLE_CSE_API_KEY / GOOGLE_CSE_ID not set; image search disabled")
	}
	imageSearchHandler := handler.NewImageSearchHandler(imageClient)
	// ▲

	// ... 既存の echo セットアップ ...

	e.GET("/api/stock-items", stockItemHandler.List)
	e.POST("/api/stock-items", stockItemHandler.Create)
	e.PATCH("/api/stock-items/:id", stockItemHandler.Update)
	e.DELETE("/api/stock-items/:id", stockItemHandler.Delete)
	e.GET("/api/image-search", imageSearchHandler.Search) // ◀ 追加
	...
}
```

- [ ] **Step 6: ローカル起動で手動確認**

```bash
cd backend
export GOOGLE_CSE_API_KEY="<your-key>"
export GOOGLE_CSE_ID="<your-cse-id>"
export DATABASE_URL="postgres://pantry:pantry@localhost:5432/pantry_panel?sslmode=disable"
go run .
# 別タブで:
curl 'http://localhost:8080/api/image-search?q=apple' | jq .
```
Expected: `{ "items": [{ "imageUrl": "...", "thumbnailUrl": "...", "title": "..." }, ...] }`

env 未設定時は `503 image search is not configured` が返ること（既存 CRUD は動作することも確認）。

- [ ] **Step 7: commit**

```bash
git add backend/handler/image_search.go backend/handler/image_search_test.go backend/main.go
git commit -m "Add GET /image-search proxy endpoint"
```

---

## Task 5: Backend ドキュメント / 環境変数

**Files:**
- Modify: `specs/openapi.yml`
- Modify: `.claude/rules/backend.md`
- Create or Modify: `backend/.env.local.example`

- [ ] **Step 1: `specs/openapi.yml` に `/image-search` 追加 & `PATCH` の body に imageUrl 追加**

`specs/openapi.yml` 該当箇所:

```yaml
paths:
  /image-search:
    get:
      summary: Search images via Google Custom Search
      parameters:
        - name: q
          in: query
          required: true
          schema:
            type: string
        - name: num
          in: query
          required: false
          schema:
            type: integer
            minimum: 1
            maximum: 10
            default: 10
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  items:
                    type: array
                    items:
                      type: object
                      properties:
                        imageUrl: { type: string }
                        thumbnailUrl: { type: string }
                        title: { type: string }
        '400': { description: query missing }
        '429': { description: quota exceeded }
        '502': { description: upstream Google API failure }
        '503': { description: image search not configured }
```

PATCH の request schema に追加:

```yaml
        imageUrl:
          type: string
          nullable: true
          description: |
            未指定なら image_url を変更しない。
            null を明示送信すると image_url を NULL に更新。
```

- [ ] **Step 2: `.claude/rules/backend.md` に env vars と endpoint を追記**

「環境変数 (Lambda)」セクションに `GOOGLE_CSE_API_KEY` / `GOOGLE_CSE_ID` を追加。「API 設計」セクションに `GET /api/image-search` を追加。

- [ ] **Step 3: `backend/.env.local.example` を作成 / 更新**

```
DATABASE_URL=postgres://pantry:pantry@localhost:5432/pantry_panel?sslmode=disable
GOOGLE_CSE_API_KEY=
GOOGLE_CSE_ID=
```

- [ ] **Step 4: commit**

```bash
git add specs/openapi.yml .claude/rules/backend.md backend/.env.local.example
git commit -m "Document image search endpoint, env vars, and PATCH imageUrl"
```

---

## Task 6: Frontend types + api.ts に searchImages 追加

**Files:**
- Modify: `frontend/src/types/stockItem.ts`
- Modify: `frontend/src/lib/api.ts`
- Test: `frontend/src/lib/api.test.ts`

- [ ] **Step 1: types に imageUrl を追加**

`frontend/src/types/stockItem.ts`:

```ts
type UpdateStockItemRequest = {
  name?: string;
  category?: string;
  wantToBuy?: boolean;
  imageUrl?: string | null;
};

type ImageSearchResult = {
  imageUrl: string;
  thumbnailUrl: string;
  title: string;
};

export type {
  CreateStockItemRequest,
  ErrorResponse,
  ImageSearchResult,
  StockItem,
  UpdateStockItemRequest,
};
```

- [ ] **Step 2: api.test.ts に失敗テストを追加**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { searchImages, ImageSearchError } from "./api";

describe("searchImages", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns results on 200", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [{ imageUrl: "https://x/a.jpg", thumbnailUrl: "https://x/a-t.jpg", title: "A" }],
      }),
    });
    const results = await searchImages("apple");
    expect(results).toHaveLength(1);
    expect(results[0].imageUrl).toBe("https://x/a.jpg");
  });

  it("throws ImageSearchError with kind=quota on 429", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    await expect(searchImages("x")).rejects.toMatchObject({
      name: "ImageSearchError",
      kind: "quota",
    });
  });

  it("throws ImageSearchError with kind=upstream on 502", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 502 });
    await expect(searchImages("x")).rejects.toMatchObject({ kind: "upstream" });
  });

  it("throws ImageSearchError with kind=unavailable on 503", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(searchImages("x")).rejects.toMatchObject({ kind: "unavailable" });
  });
});

describe("updateStockItem with imageUrl", () => {
  it("sends imageUrl: string in body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "1", name: "x", category: "★", imageUrl: "https://x/a.jpg", wantToBuy: false, createdAt: "", updatedAt: "" }),
    });
    global.fetch = fetchMock;
    await updateStockItem("1", { imageUrl: "https://x/a.jpg" });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ imageUrl: "https://x/a.jpg" });
  });

  it("sends imageUrl: null in body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    global.fetch = fetchMock;
    await updateStockItem("1", { imageUrl: null });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ imageUrl: null });
  });
});
```

- [ ] **Step 3: テスト実行 → fail**

```bash
cd frontend
npx vitest run src/lib/api.test.ts
```
Expected: FAIL（searchImages 未定義）

- [ ] **Step 4: 実装**

`frontend/src/lib/api.ts`:

```ts
import type {
  CreateStockItemRequest,
  ImageSearchResult,
  StockItem,
  UpdateStockItemRequest,
} from "@/types/stockItem";

// ... 既存コード ...

export type ImageSearchErrorKind = "quota" | "upstream" | "unavailable" | "unknown";

export class ImageSearchError extends Error {
  kind: ImageSearchErrorKind;
  constructor(kind: ImageSearchErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "ImageSearchError";
    this.kind = kind;
  }
}

async function searchImages(query: string, num = 10): Promise<ImageSearchResult[]> {
  const params = new URLSearchParams({ q: query, num: String(num) });
  const response = await fetch(`${API_BASE_URL}/api/image-search?${params}`);
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

- [ ] **Step 5: テスト実行 → 緑**

```bash
npx vitest run src/lib/api.test.ts
```
Expected: PASS（updateStockItem 経由で imageUrl: null も正しく body に乗ること）

- [ ] **Step 6: commit**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/api.test.ts frontend/src/types/stockItem.ts
git commit -m "Add searchImages and imageUrl support to api client"
```

---

## Task 7: ImageSelectionModal コンポーネント

**Files:**
- Create: `frontend/src/components/ImageSelectionModal.tsx`
- Test: `frontend/src/components/ImageSelectionModal.test.tsx`

- [ ] **Step 1: 失敗テスト**

`frontend/src/components/ImageSelectionModal.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ImageSelectionModal from "./ImageSelectionModal";
import * as api from "@/lib/api";
import { ImageSearchError } from "@/lib/api";
import type { StockItem } from "@/types/stockItem";

const item: StockItem = {
  id: "1",
  name: "りんご",
  category: "★",
  imageUrl: null,
  wantToBuy: false,
  createdAt: "",
  updatedAt: "",
};

const searchSpy = vi.spyOn(api, "searchImages");

afterEach(() => searchSpy.mockReset());

describe("ImageSelectionModal", () => {
  it("auto-searches with item.name when opened", async () => {
    searchSpy.mockResolvedValue([
      { imageUrl: "https://x/a.jpg", thumbnailUrl: "https://x/a-t.jpg", title: "A" },
    ]);
    render(<ImageSelectionModal item={item} isOpen onClose={() => {}} onSelect={() => {}} />);
    await waitFor(() => expect(searchSpy).toHaveBeenCalledWith("りんご", expect.any(Number)));
    expect(await screen.findByAltText("A")).toBeInTheDocument();
  });

  it("calls onSelect(imageUrl) when result is clicked", async () => {
    searchSpy.mockResolvedValue([
      { imageUrl: "https://x/a.jpg", thumbnailUrl: "https://x/a-t.jpg", title: "A" },
    ]);
    const onSelect = vi.fn();
    render(<ImageSelectionModal item={item} isOpen onClose={() => {}} onSelect={onSelect} />);
    const img = await screen.findByAltText("A");
    fireEvent.click(img);
    expect(onSelect).toHaveBeenCalledWith("https://x/a.jpg");
  });

  it("shows 'clear image' button only when item.imageUrl is non-null and calls onSelect(null)", async () => {
    searchSpy.mockResolvedValue([]);
    const onSelect = vi.fn();
    const withImage = { ...item, imageUrl: "https://x/a.jpg" };
    render(<ImageSelectionModal item={withImage} isOpen onClose={() => {}} onSelect={onSelect} />);
    const clearBtn = await screen.findByRole("button", { name: /画像を解除/ });
    fireEvent.click(clearBtn);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("hides clear button when item.imageUrl is null", async () => {
    searchSpy.mockResolvedValue([]);
    render(<ImageSelectionModal item={item} isOpen onClose={() => {}} onSelect={() => {}} />);
    await waitFor(() => expect(searchSpy).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /画像を解除/ })).not.toBeInTheDocument();
  });

  it("shows 'no results' message on empty array", async () => {
    searchSpy.mockResolvedValue([]);
    render(<ImageSelectionModal item={item} isOpen onClose={() => {}} onSelect={() => {}} />);
    expect(await screen.findByText(/画像が見つかりませんでした/)).toBeInTheDocument();
  });

  it("shows quota message on ImageSearchError(kind=quota)", async () => {
    searchSpy.mockRejectedValue(new ImageSearchError("quota"));
    render(<ImageSelectionModal item={item} isOpen onClose={() => {}} onSelect={() => {}} />);
    expect(await screen.findByText(/本日の検索上限/)).toBeInTheDocument();
  });

  it("shows retry on generic failure", async () => {
    searchSpy.mockRejectedValueOnce(new ImageSearchError("upstream"));
    render(<ImageSelectionModal item={item} isOpen onClose={() => {}} onSelect={() => {}} />);
    expect(await screen.findByText(/画像検索に失敗しました/)).toBeInTheDocument();

    searchSpy.mockResolvedValueOnce([
      { imageUrl: "https://x/b.jpg", thumbnailUrl: "https://x/b-t.jpg", title: "B" },
    ]);
    fireEvent.click(screen.getByRole("button", { name: /再試行/ }));
    expect(await screen.findByAltText("B")).toBeInTheDocument();
  });

  it("closes on Escape and on cancel button", async () => {
    searchSpy.mockResolvedValue([]);
    const onClose = vi.fn();
    render(<ImageSelectionModal item={item} isOpen onClose={onClose} onSelect={() => {}} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    onClose.mockReset();
    fireEvent.click(screen.getByRole("button", { name: /キャンセル/ }));
    expect(onClose).toHaveBeenCalled();
  });

  it("manual re-search updates query and triggers fetch", async () => {
    searchSpy.mockResolvedValue([]);
    render(<ImageSelectionModal item={item} isOpen onClose={() => {}} onSelect={() => {}} />);
    await waitFor(() => expect(searchSpy).toHaveBeenCalled());
    searchSpy.mockClear();

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "もも" } });
    fireEvent.click(screen.getByRole("button", { name: /検索/ }));
    await waitFor(() => expect(searchSpy).toHaveBeenCalledWith("もも", expect.any(Number)));
  });
});
```

- [ ] **Step 2: テスト実行 → fail**

```bash
cd frontend
npx vitest run src/components/ImageSelectionModal.test.tsx
```
Expected: FAIL（コンポーネント未作成）

- [ ] **Step 3: 実装**

`frontend/src/components/ImageSelectionModal.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { MdClose } from "react-icons/md";
import { ImageSearchError, searchImages } from "@/lib/api";
import type { ImageSearchResult, StockItem } from "@/types/stockItem";

type Props = {
  item: StockItem;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (imageUrl: string | null) => void;
};

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; results: ImageSearchResult[] }
  | { status: "error"; kind: "quota" | "other" };

export default function ImageSelectionModal({ item, isOpen, onClose, onSelect }: Props) {
  const [query, setQuery] = useState(item.name);
  const [state, setState] = useState<FetchState>({ status: "idle" });

  const runSearch = useCallback(async (q: string) => {
    setState({ status: "loading" });
    try {
      const results = await searchImages(q, 10);
      setState({ status: "success", results });
    } catch (err) {
      const kind = err instanceof ImageSearchError && err.kind === "quota" ? "quota" : "other";
      setState({ status: "error", kind });
    }
  }, []);

  // open 時に自動検索
  useEffect(() => {
    if (!isOpen) return;
    setQuery(item.name);
    void runSearch(item.name);
  }, [isOpen, item.name, runSearch]);

  // Escape で閉じる
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="画像を選択"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">画像を選択</h2>
          <button type="button" aria-label="閉じる" onClick={onClose}>
            <MdClose size={24} />
          </button>
        </div>

        <form
          className="flex gap-2 mb-4"
          onSubmit={(e) => { e.preventDefault(); void runSearch(query); }}
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 border rounded px-3 py-2"
          />
          <button
            type="submit"
            className="bg-[#00d1b2] hover:bg-[#00c4a7] text-white px-4 py-2 rounded"
          >
            検索
          </button>
        </form>

        {state.status === "loading" && <p className="text-center py-8 text-gray-600">検索中...</p>}

        {state.status === "success" && state.results.length === 0 && (
          <p className="text-center py-8 text-gray-600">画像が見つかりませんでした</p>
        )}

        {state.status === "success" && state.results.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {state.results.map((r) => (
              <button
                key={r.imageUrl}
                type="button"
                onClick={() => onSelect(r.imageUrl)}
                className="border rounded overflow-hidden hover:ring-2 hover:ring-[#00d1b2] focus:outline-none focus:ring-2 focus:ring-[#00d1b2]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.thumbnailUrl} alt={r.title} className="w-full h-32 object-cover" />
              </button>
            ))}
          </div>
        )}

        {state.status === "error" && state.kind === "quota" && (
          <p className="text-center py-8 text-red-600">本日の検索上限に達しました</p>
        )}

        {state.status === "error" && state.kind === "other" && (
          <div className="text-center py-8">
            <p className="text-red-600 mb-3">画像検索に失敗しました</p>
            <button
              type="button"
              onClick={() => void runSearch(query)}
              className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded"
            >
              再試行
            </button>
          </div>
        )}

        <div className="flex justify-between mt-6">
          {item.imageUrl != null ? (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="text-red-600 hover:underline"
            >
              画像を解除
            </button>
          ) : <span />}
          <button
            type="button"
            onClick={onClose}
            className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: テスト実行 → 緑**

```bash
npx vitest run src/components/ImageSelectionModal.test.tsx
```
Expected: PASS（全 9 ケース）

- [ ] **Step 5: commit**

```bash
git add frontend/src/components/ImageSelectionModal.tsx frontend/src/components/ImageSelectionModal.test.tsx
git commit -m "Add ImageSelectionModal component for Google image search"
```

---

## Task 8: ItemCard に画像領域を追加

**Files:**
- Modify: `frontend/src/components/ItemCard.tsx`
- Test: `frontend/src/components/ItemCard.test.tsx`

- [ ] **Step 1: 失敗テスト追加**

`frontend/src/components/ItemCard.test.tsx` に追加:

```tsx
it("renders <img> when imageUrl is set", () => {
  const item = { ...baseItem, imageUrl: "https://x/a.jpg" };
  render(<ItemCard item={item} onEdit={() => {}} onToggleWantToBuy={() => {}} onDelete={() => {}} onImageEdit={() => {}} />);
  const img = screen.getByAltText(item.name);
  expect(img).toHaveAttribute("src", "https://x/a.jpg");
});

it("renders placeholder when imageUrl is null", () => {
  render(<ItemCard item={baseItem} onEdit={() => {}} onToggleWantToBuy={() => {}} onDelete={() => {}} onImageEdit={() => {}} />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByLabelText(/画像を設定/)).toBeInTheDocument();
});

it("calls onImageEdit when image area is clicked", () => {
  const onImageEdit = vi.fn();
  render(<ItemCard item={baseItem} onEdit={() => {}} onToggleWantToBuy={() => {}} onDelete={() => {}} onImageEdit={onImageEdit} />);
  fireEvent.click(screen.getByLabelText(/画像を設定/));
  expect(onImageEdit).toHaveBeenCalledWith(baseItem);
});
```

- [ ] **Step 2: テスト実行 → fail**

```bash
npx vitest run src/components/ItemCard.test.tsx
```

- [ ] **Step 3: ItemCard 実装変更**

`frontend/src/components/ItemCard.tsx`:

```tsx
import { MdDelete, MdImage, MdShoppingCart } from "react-icons/md";
import type { StockItem } from "@/types/stockItem";

type ItemCardProps = {
  item: StockItem;
  onEdit: (item: StockItem) => void;
  onToggleWantToBuy: (item: StockItem) => void;
  onDelete: (id: string) => void;
  onImageEdit: (item: StockItem) => void;
};

export default function ItemCard({
  item,
  onEdit,
  onToggleWantToBuy,
  onDelete,
  onImageEdit,
}: ItemCardProps) {
  return (
    <article
      aria-label={item.name}
      className="flex items-center gap-3 rounded-lg border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <button
        type="button"
        aria-label={item.imageUrl ? `${item.name} の画像を変更` : `${item.name} の画像を設定`}
        onClick={() => onImageEdit(item)}
        className="shrink-0 w-16 h-16 rounded overflow-hidden bg-gray-100 flex items-center justify-center hover:ring-2 hover:ring-[#00d1b2] focus:outline-none focus:ring-2 focus:ring-[#00d1b2]"
      >
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <MdImage size={28} className="text-gray-400" aria-hidden />
        )}
      </button>
      <button
        type="button"
        className="flex-1 text-left focus:outline-none focus:ring-2 focus:ring-[#00d1b2] focus:ring-offset-2 rounded"
        onClick={() => onEdit(item)}
      >
        <span className="inline-block bg-[#ebfffc] text-[#00947e] text-xs px-2 py-0.5 rounded-full mb-1">
          {item.category}
        </span>
        <h3 className="text-lg font-bold text-gray-900">{item.name}</h3>
      </button>
      {/* 既存の wantToBuy / delete ボタンはそのまま */}
      ...
    </article>
  );
}
```

- [ ] **Step 4: テスト実行 → 緑**

- [ ] **Step 5: commit**

```bash
git add frontend/src/components/ItemCard.tsx frontend/src/components/ItemCard.test.tsx
git commit -m "Add image area to ItemCard with placeholder fallback"
```

---

## Task 9: ItemCardSimple に 32px サムネイル追加

**Files:**
- Modify: `frontend/src/components/ItemCardSimple.tsx`
- Test: `frontend/src/components/ItemCardSimple.test.tsx`

ItemCard と同じパターン。サイズ違い（32px）、`onImageEdit` prop 追加、画像 or プレースホルダー表示。

- [ ] **Step 1**: テストを Task 8 と同じパターンで 3 ケース追加（imageUrl あり / null / クリック）

- [ ] **Step 2**: 実装。画像 button は `w-8 h-8` Tailwind class、その他は ItemCard と並行

- [ ] **Step 3**: テスト緑

- [ ] **Step 4: commit**

```bash
git add frontend/src/components/ItemCardSimple.tsx frontend/src/components/ItemCardSimple.test.tsx
git commit -m "Add image thumbnail to ItemCardSimple"
```

---

## Task 10: page.tsx でモーダル統合

**Files:**
- Modify: `frontend/src/app/stock-items/page.tsx`

- [ ] **Step 1: state 追加 + ハンドラ + モーダル描画**

`frontend/src/app/stock-items/page.tsx` の変更点:

```tsx
import ImageSelectionModal from "@/components/ImageSelectionModal";

// state
const [imageEditingItem, setImageEditingItem] = useState<StockItem | null>(null);

// handlers
const handleOpenImageEdit = (item: StockItem) => setImageEditingItem(item);
const handleCloseImageEdit = () => setImageEditingItem(null);

const handleImageSelect = async (imageUrl: string | null) => {
  if (!imageEditingItem) return;
  await updateStockItem(imageEditingItem.id, { imageUrl });
  const data = await fetchStockItems();
  setItems(data);
  setImageEditingItem(null);
};

// in JSX, after <EditItemModal />:
<ImageSelectionModal
  item={imageEditingItem ?? { id: "", name: "", category: "", imageUrl: null, wantToBuy: false, createdAt: "", updatedAt: "" }}
  isOpen={!!imageEditingItem}
  onClose={handleCloseImageEdit}
  onSelect={handleImageSelect}
/>

// in Card prop list:
<Card
  key={item.id}
  item={item}
  onDelete={handleDelete}
  onEdit={handleOpenEdit}
  onToggleWantToBuy={handleToggleWantToBuy}
  onImageEdit={handleOpenImageEdit}
/>
```

- [ ] **Step 2: ローカル起動で手動確認**

```bash
cd frontend
npm run dev
# 別タブで backend を起動済みなこと
# ブラウザで http://localhost:3000/stock-items を開き、画像クリック → モーダル → 検索 → 選択 → カードに反映
# 画像を解除 → プレースホルダーに戻る
```

CLAUDE.md の Step 4.5 動作確認に該当。

- [ ] **Step 3: commit**

```bash
git add frontend/src/app/stock-items/page.tsx
git commit -m "Wire ImageSelectionModal into stock-items page"
```

---

## Task 11: E2E テスト（Playwright）

**Files:**
- Create: `frontend/e2e/image-selection.spec.ts`

- [ ] **Step 1: スペック作成**

`frontend/e2e/image-selection.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("画像選択フロー: 検索 → 選択 → 解除", async ({ page }) => {
  // backend の image-search を route stub
  await page.route("**/api/image-search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          { imageUrl: "https://placehold.co/300x300/png?text=A", thumbnailUrl: "https://placehold.co/100x100/png?text=A", title: "A" },
          { imageUrl: "https://placehold.co/300x300/png?text=B", thumbnailUrl: "https://placehold.co/100x100/png?text=B", title: "B" },
          { imageUrl: "https://placehold.co/300x300/png?text=C", thumbnailUrl: "https://placehold.co/100x100/png?text=C", title: "C" },
        ],
      }),
    });
  });

  await page.goto("/stock-items");
  // 1. 商品作成
  await page.getByRole("button", { name: "商品を追加" }).click();
  await page.getByLabel("商品名").fill("テスト商品");
  await page.getByRole("button", { name: "作成" }).click();

  // 2. プレースホルダー確認
  const card = page.locator("article", { hasText: "テスト商品" });
  await expect(card.getByLabel(/画像を設定/)).toBeVisible();

  // 3. 画像領域クリック → モーダル
  await card.getByLabel(/画像を設定/).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // 4. 結果 3 枚表示
  await expect(page.getByAltText("A")).toBeVisible();
  await expect(page.getByAltText("B")).toBeVisible();
  await expect(page.getByAltText("C")).toBeVisible();

  // 5. 1 枚目クリック
  await page.getByAltText("A").click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  // 6. カードに画像反映
  await expect(card.getByAltText("テスト商品")).toHaveAttribute("src", /placehold\.co\/300x300\/png\?text=A/);

  // 7. 再度クリック → 解除
  await card.getByAltText("テスト商品").click();
  await page.getByRole("button", { name: "画像を解除" }).click();
  await expect(card.getByLabel(/画像を設定/)).toBeVisible();
});
```

- [ ] **Step 2: ローカル実行 → 緑**

```bash
cd frontend
# backend が起動している前提
npx playwright test e2e/image-selection.spec.ts
```

- [ ] **Step 3: commit**

```bash
git add frontend/e2e/image-selection.spec.ts
git commit -m "Add Playwright E2E for image selection flow"
```

---

## Task 12: PR 作成 → CI 通過 → マージ後の features.md 更新

- [ ] **Step 1: branch push & Draft PR 作成**

```bash
git push -u origin 64-phase4-product-image
gh pr create --draft --title "Phase 4 機能I: 商品画像設定" --body "$(cat <<'EOF'
## Summary
- Add `GET /api/image-search` proxy to Google Custom Search
- Extend `PATCH /api/stock-items/:id` to accept `imageUrl` (string | null)
- Add `ImageSelectionModal` with auto-search on open
- Add image area to `ItemCard` (64px) and `ItemCardSimple` (32px) with placeholder
- E2E: search → select → clear flow with `route` stub

Closes #64

Spec: `docs/superpowers/specs/2026-05-15-product-image-design.md`
Plan: `docs/superpowers/plans/2026-05-15-product-image.md`

## Test plan
- [x] Backend unit (handler / imagesearch / repository) — `go test ./...`
- [x] Backend integration (testcontainers PG) — `go test ./repository -tags=integration`
- [x] Frontend unit (Vitest) — `npx vitest run`
- [x] E2E (Playwright) — `npx playwright test e2e/image-selection.spec.ts`
- [x] Manual: ローカル起動で検索 / 選択 / 解除 / Realtime 反映を確認
EOF
)"
```

- [ ] **Step 2: CI が green になるまで待つ**

```bash
gh pr checks --watch
```

CI が落ちたら原因を修正してコミット → 再 push。

- [ ] **Step 3: ready for review → セルフレビュー → マージ**

```bash
gh pr ready
# レビュー後
gh pr merge --squash --delete-branch
```

- [ ] **Step 4: マージ後 main で `features.md` 更新**

```bash
git checkout main
git pull
```

`specs/features.md` の Phase 4 表を更新:

```markdown
| 9 | I. 商品画像設定 | ✅ 完了（issue #64） | 外部 API 連携が必要。コアではないため最後 |
```

```bash
git add specs/features.md
git commit -m "Mark Phase 4 feature I (product image) as complete"
git push
```

- [ ] **Step 5: 本番デプロイ後の env 設定**

AWS Console → Lambda `pantry-panel-backend` → Configuration → Environment variables に追加:
- `GOOGLE_CSE_API_KEY` (KMS 暗号化)
- `GOOGLE_CSE_ID` (KMS 暗号化、機微度低)

設定後 Function URL に curl で動作確認:

```bash
curl 'https://<function-url>/api/image-search?q=apple' | jq .
```

---

## Self-Review

### Spec coverage check
- 画像表示（カード）→ Task 8 / 9 ✅
- 画像クリックでモーダル → Task 7 ✅
- 自動検索 → Task 7 (Step 1 ケース 1) ✅
- 手動再検索 → Task 7 (manual re-search ケース) ✅
- 画像を解除 → Task 7 (clear button ケース) + Task 10 (page.tsx で imageUrl=null PATCH) ✅
- 通常 / シンプルビュー両対応 → Task 8 / 9 ✅
- backend プロキシ → Task 3 / 4 ✅
- PATCH imageUrl 拡張 → Task 1 / 2 ✅
- json.RawMessage で null / 未指定の判別 → Task 2 ✅
- 環境変数（GOOGLE_CSE_*）→ Task 4 / 5 ✅
- エラーハンドリング（0 件 / quota / 一般 + 再試行）→ Task 7 ✅
- E2E → Task 11 ✅
- ドキュメント（openapi / backend.md / .env.local.example）→ Task 5 ✅
- features.md 更新 → Task 12 ✅
- Realtime 経由の他端末伝播 → 既存 `useStockItemsRealtime` 経路で自動的に賄われる（spec 通り追加実装なし）✅

### Type consistency
- `imageUrl: string | null` — types / api / モーダル / ItemCard で一貫
- `ImageURLUpdate{ Value *string }` — repository / handler で一貫
- `ImageSearchResult { imageUrl, thumbnailUrl, title }` — backend response と frontend type で一貫

### Placeholder scan
- 全 step に具体的コード / コマンドが書かれている
- 「Similar to」のような曖昧参照なし
- Task 9 だけ ItemCardSimple の詳細を Task 8 と同パターン と記述（短さのため）。実装時は ItemCard と同一の構造を踏襲する

---

## Execution

Per project rule (`.claude/rules/general.md` + memory `feedback_tdd_workflow.md`):
**ユーザーが各 Task の test/production コードを実装**、Claude はレビューとフォローアップ提案を行う。subagent-driven-development は使用しない。

ユーザー側の進め方:
1. Task ごとに上から順番に実装
2. テストが通ったら commit して次の Task へ
3. 詰まったら Claude にレビューや代替案を相談
4. 全 Task 完了 → PR 作成 → CI 通過 → マージ

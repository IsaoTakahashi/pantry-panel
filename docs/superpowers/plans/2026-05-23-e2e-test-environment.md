# E2E テスト環境整備 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2つの E2E テスト環境を整備する。① Vercel preview に対してフル検証する `preview` 環境（`deployment_status` トリガー）、② CI とローカルで動く外部 API モック付き `mock` 環境（毎 PR）。

**Architecture:** Playwright `projects` で `preview` / `mock` の2環境を定義する。共通の `globalSetup` で Supabase email/password ログイン → storageState を `.auth/user.json` に保存し、全テストが認証済み状態から開始できるようにする。外部 API（CSE・Claude URL 抽出）は `mock` 環境で `page.route()` によりスタブ化する。`globalTeardown` でテスト用グループの stock_items をクリーンアップする。

**Tech Stack:** `@playwright/test ^1.59`、`@supabase/supabase-js ^2`、GitHub Actions `deployment_status` トリガー、`gh` CLI

---

## ファイル構成

| ファイル | 変更種別 | 役割 |
|---------|---------|------|
| `frontend/.gitignore` | 更新 | `.auth/` を除外 |
| `frontend/.env.local.example` | 更新 | E2E 用環境変数を追記 |
| `frontend/package.json` | 更新 | `test:e2e` を `--project=mock` に変更 |
| `frontend/playwright.config.ts` | 更新 | `projects`・`globalSetup`・`globalTeardown` 追加 |
| `frontend/e2e/global-setup.ts` | 新規 | Supabase 認証 → `.auth/user.json` 書き出し |
| `frontend/e2e/global-teardown.ts` | 新規 | テスト group の stock_items を削除 |
| `frontend/e2e/fixtures/mock-routes.ts` | 新規 | `mockExtractFromUrl`・`mockImageSearch` fixture |
| `frontend/e2e/stock-items.spec.ts` | 更新 | `hasSupabase` ガード削除 |
| `frontend/e2e/url-registration.spec.ts` | 更新 | `hasSupabase` ガード削除 |
| `frontend/e2e/image-selection.spec.ts` | 更新 | `hasSupabase`・`hasGoogleCSE` 削除、mock モード対応 |
| `frontend/e2e/realtime-sync.spec.ts` | 更新 | `hasSupabase` 削除、`newContext` に `storageState` 渡す |
| `.github/workflows/e2e.yml` | 更新 | postgres service 削除、Supabase 接続、`--project=mock` |
| `.github/workflows/e2e-preview.yml` | 新規 | `deployment_status` トリガー、preview E2E |

---

## 事前作業（手作業・一回限り、実装前に完了させる）

以下は Supabase Dashboard での手作業。実装タスクとは独立。

1. Supabase Dashboard → Authentication → Providers → Email を有効化
2. Supabase Dashboard → Authentication → Users → 「Add user」でテストユーザー作成（例: `e2e-test@example.com`）
3. そのユーザーで `/join` または `/api/groups` 経由でテスト用グループを1つ作成し、UUID をメモ
4. GitHub Secrets に以下を追加：
   - `E2E_TEST_EMAIL` — テストユーザーのメール
   - `E2E_TEST_PASSWORD` — テストユーザーのパスワード
   - `E2E_TEST_GROUP_ID` — テスト用グループの UUID
   - `E2E_SUPABASE_URL` — Supabase project URL（`NEXT_PUBLIC_SUPABASE_URL` と同じ値）
   - `E2E_SUPABASE_ANON_KEY` — Supabase anon key（`NEXT_PUBLIC_SUPABASE_ANON_KEY` と同じ値）
   - `E2E_SUPABASE_DATABASE_URL` — Supabase Session Pooler URL（backend の `DATABASE_URL`）
5. ローカルの `frontend/.env.local` に上記 5 変数を追記

---

## Task 1: Playwright インフラ設定

**Files:**
- Modify: `frontend/.gitignore`
- Modify: `frontend/.env.local.example`
- Modify: `frontend/package.json`
- Modify: `frontend/playwright.config.ts`

- [ ] **Step 1: `.gitignore` に `.auth/` を追記**

`frontend/.gitignore` の `# testing` セクションに追加：

```
# testing
/coverage
/test-results
/playwright-report
/.auth
```

- [ ] **Step 2: `.env.local.example` に E2E 変数を追記**

`frontend/.env.local.example` の末尾に追加：

```
# E2E テスト用（globalSetup / globalTeardown で使用）
# GitHub Secrets と同じ値をローカルの .env.local に設定する
E2E_SUPABASE_URL=
E2E_SUPABASE_ANON_KEY=
E2E_TEST_EMAIL=
E2E_TEST_PASSWORD=
E2E_TEST_GROUP_ID=
```

- [ ] **Step 3: `package.json` の `test:e2e` スクリプトを更新**

`frontend/package.json` の `"test:e2e"` を変更：

```json
"test:e2e": "playwright test --project=mock",
"test:e2e:preview": "playwright test --project=preview",
```

- [ ] **Step 4: `playwright.config.ts` を更新**

`frontend/playwright.config.ts` を以下に書き換える：

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  webServer: process.env.PREVIEW_URL
    ? undefined
    : {
        command: "npm run dev",
        port: 3000,
        reuseExistingServer: true,
      },
  use: {
    baseURL: process.env.PREVIEW_URL || "http://localhost:3000",
  },
  projects: [
    {
      name: "preview",
      use: { storageState: ".auth/user.json" },
    },
    {
      name: "mock",
      use: { storageState: ".auth/user.json" },
    },
  ],
});
```

- [ ] **Step 5: 型チェックが通ることを確認**

```bash
cd frontend && npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add frontend/.gitignore frontend/.env.local.example frontend/package.json frontend/playwright.config.ts
git commit -m "feat: configure playwright projects and global setup/teardown hooks"
```

---

## Task 2: globalSetup — Supabase 認証 → storageState 保存

**Files:**
- Create: `frontend/e2e/global-setup.ts`

- [ ] **Step 1: `global-setup.ts` を作成**

```typescript
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

async function globalSetup() {
  const supabaseUrl = process.env.E2E_SUPABASE_URL;
  const supabaseAnonKey = process.env.E2E_SUPABASE_ANON_KEY;
  const testEmail = process.env.E2E_TEST_EMAIL;
  const testPassword = process.env.E2E_TEST_PASSWORD;
  const testGroupId = process.env.E2E_TEST_GROUP_ID;

  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    !testEmail ||
    !testPassword ||
    !testGroupId
  ) {
    throw new Error(
      "E2E env vars not set: E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, " +
        "E2E_TEST_EMAIL, E2E_TEST_PASSWORD, E2E_TEST_GROUP_ID",
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });
  if (error || !data.session) {
    throw new Error(
      `Supabase sign-in failed: ${error?.message ?? "no session returned"}`,
    );
  }

  // Supabase JS v2 のローカルストレージキー: sb-{project-ref}-auth-token
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const sessionKey = `sb-${projectRef}-auth-token`;
  const baseURL = process.env.PREVIEW_URL || "http://localhost:3000";

  const storageState = {
    cookies: [],
    origins: [
      {
        origin: baseURL,
        localStorage: [
          { name: sessionKey, value: JSON.stringify(data.session) },
          { name: "pantry-panel:active-group-id", value: testGroupId },
        ],
      },
    ],
  };

  const authDir = path.join(process.cwd(), ".auth");
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(
    path.join(authDir, "user.json"),
    JSON.stringify(storageState, null, 2),
  );
}

export default globalSetup;
```

- [ ] **Step 2: 型チェック**

```bash
cd frontend && npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add frontend/e2e/global-setup.ts
git commit -m "feat: add globalSetup - Supabase email/password auth to storageState"
```

---

## Task 3: globalTeardown — stock_items クリーンアップ

**Files:**
- Create: `frontend/e2e/global-teardown.ts`

- [ ] **Step 1: `global-teardown.ts` を作成**

```typescript
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

async function globalTeardown() {
  const supabaseUrl = process.env.E2E_SUPABASE_URL;
  const supabaseAnonKey = process.env.E2E_SUPABASE_ANON_KEY;
  const testEmail = process.env.E2E_TEST_EMAIL;
  const testPassword = process.env.E2E_TEST_PASSWORD;
  const testGroupId = process.env.E2E_TEST_GROUP_ID;
  const backendUrl =
    process.env.PREVIEW_BACKEND_URL || "http://localhost:8080";

  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    !testEmail ||
    !testPassword ||
    !testGroupId
  ) {
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { session },
    error,
  } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });
  if (error || !session) {
    console.warn(
      "globalTeardown: auth failed, skipping cleanup:",
      error?.message,
    );
    return;
  }

  const headers: HeadersInit = {
    Authorization: `Bearer ${session.access_token}`,
    "X-Active-Group-ID": testGroupId,
    "Content-Type": "application/json",
  };

  const listResp = await fetch(`${backendUrl}/api/stock-items`, { headers });
  if (!listResp.ok) {
    console.warn(
      "globalTeardown: GET /api/stock-items failed:",
      listResp.status,
    );
    return;
  }

  const items: { id: string; wantToBuy: boolean }[] = await listResp.json();

  for (const item of items) {
    // DELETE は wantToBuy=false が必要なため、先に PATCH する
    if (item.wantToBuy) {
      await fetch(`${backendUrl}/api/stock-items/${item.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ wantToBuy: false }),
      });
    }
    await fetch(`${backendUrl}/api/stock-items/${item.id}`, {
      method: "DELETE",
      headers,
    });
  }

  try {
    fs.rmSync(path.join(process.cwd(), ".auth"), { recursive: true });
  } catch {}
}

export default globalTeardown;
```

- [ ] **Step 2: 型チェック**

```bash
cd frontend && npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add frontend/e2e/global-teardown.ts
git commit -m "feat: add globalTeardown - cleanup test group stock_items via backend API"
```

---

## Task 4: Mock routes fixture

**Files:**
- Create: `frontend/e2e/fixtures/mock-routes.ts`

- [ ] **Step 1: `fixtures/mock-routes.ts` を作成**

```typescript
import type { Page } from "@playwright/test";

type ImageSearchItem = {
  imageUrl: string;
  thumbnailUrl: string;
  title: string;
};

export async function mockExtractFromUrl(
  page: Page,
  options: { status: number; body: Record<string, unknown> },
): Promise<void> {
  await page.route("**/api/extract-from-url", (route) =>
    route.fulfill({
      status: options.status,
      contentType: "application/json",
      body: JSON.stringify(options.body),
    }),
  );
}

export async function mockImageSearch(
  page: Page,
  options: { status?: number; items: ImageSearchItem[] },
): Promise<void> {
  await page.route("**/api/image-search**", (route) =>
    route.fulfill({
      status: options.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify({ items: options.items }),
    }),
  );
}

export const STUB_IMAGES: ImageSearchItem[] = [
  {
    imageUrl: "https://picsum.photos/seed/e2e1/400/400",
    thumbnailUrl: "https://picsum.photos/seed/e2e1/80/80",
    title: "Mock Image 1",
  },
  {
    imageUrl: "https://picsum.photos/seed/e2e2/400/400",
    thumbnailUrl: "https://picsum.photos/seed/e2e2/80/80",
    title: "Mock Image 2",
  },
];
```

- [ ] **Step 2: 型チェック**

```bash
cd frontend && npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add frontend/e2e/fixtures/mock-routes.ts
git commit -m "feat: add mock-routes fixture for extract-from-url and image-search"
```

---

## Task 5: 既存 spec ファイルの更新

**Files:**
- Modify: `frontend/e2e/stock-items.spec.ts`
- Modify: `frontend/e2e/url-registration.spec.ts`
- Modify: `frontend/e2e/image-selection.spec.ts`
- Modify: `frontend/e2e/realtime-sync.spec.ts`

### 5a: stock-items.spec.ts

- [ ] **Step 1: `hasSupabase` ガードを削除**

`frontend/e2e/stock-items.spec.ts` の先頭から以下を削除：

```typescript
const hasSupabase = !!(
  process.env.PLAYWRIGHT_SUPABASE_URL &&
  process.env.PLAYWRIGHT_SUPABASE_ANON_KEY
);
```

テスト本文から以下を削除：

```typescript
test.skip(!hasSupabase, "PLAYWRIGHT_SUPABASE_URL / _ANON_KEY not set");
```

### 5b: url-registration.spec.ts

- [ ] **Step 2: `hasSupabase` ガードを削除**

`frontend/e2e/url-registration.spec.ts` の先頭から以下を削除：

```typescript
const hasSupabase = !!(
  process.env.PLAYWRIGHT_SUPABASE_URL &&
  process.env.PLAYWRIGHT_SUPABASE_ANON_KEY
);
```

`test.describe` 内の以下も削除：

```typescript
test.beforeEach(() => {
  test.skip(!hasSupabase, "PLAYWRIGHT_SUPABASE_URL / _ANON_KEY not set");
});
```

### 5c: image-selection.spec.ts

- [ ] **Step 3: `image-selection.spec.ts` を書き換え**

`frontend/e2e/image-selection.spec.ts` を以下に置き換える：

```typescript
import { expect, test } from "@playwright/test";
import { mockImageSearch, STUB_IMAGES } from "./fixtures/mock-routes";

const isMockMode = !process.env.PREVIEW_URL;

test.describe("画像設定", () => {
  let itemName: string;

  test.beforeEach(async ({ page }) => {
    itemName = `テスト商品-${Date.now()}`;
    await page.goto("/stock-items");
    await page.getByRole("button", { name: "商品を追加" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("名前").fill(itemName);
    await dialog.getByLabel("カテゴリ", { exact: true }).selectOption("調味料");
    await dialog.getByRole("button", { name: "追加", exact: true }).click();
    await expect(page.getByText(itemName)).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await page.keyboard.press("Escape");
    const article = page.getByRole("article", { name: itemName });
    if (await article.isVisible()) {
      page.once("dialog", (d) => d.accept());
      await article.getByRole("button", { name: "削除" }).click();
    }
  });

  test("画像ボタンをクリックするとモーダルが開き、キャンセルで閉じる", async ({
    page,
  }) => {
    if (isMockMode) {
      await mockImageSearch(page, { items: STUB_IMAGES });
    }
    await page
      .getByRole("article", { name: itemName })
      .getByRole("button", { name: "画像を設定" })
      .click();

    const modal = page.getByRole("dialog", { name: "画像を選択" });
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: /キャンセル/ }).click();
    await expect(modal).not.toBeVisible();
  });

  test("Escape キーでモーダルが閉じる", async ({ page }) => {
    if (isMockMode) {
      await mockImageSearch(page, { items: STUB_IMAGES });
    }
    await page
      .getByRole("article", { name: itemName })
      .getByRole("button", { name: "画像を設定" })
      .click();

    const modal = page.getByRole("dialog", { name: "画像を選択" });
    await expect(modal).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible();
  });

  test("画像検索エラー時に再試行ボタンが表示される", async ({ page }) => {
    // preview mode では CSE が設定済みのためスキップ
    test.skip(!isMockMode, "mock mode only");
    await mockImageSearch(page, { status: 503, items: [] });

    await page
      .getByRole("article", { name: itemName })
      .getByRole("button", { name: "画像を設定" })
      .click();

    const modal = page.getByRole("dialog", { name: "画像を選択" });
    await expect(modal.getByText(/画像検索に失敗しました/)).toBeVisible({
      timeout: 10000,
    });
    await expect(modal.getByRole("button", { name: /再試行/ })).toBeVisible();
  });

  test("画像を選択するとカードに画像が表示される", async ({ page }) => {
    if (isMockMode) {
      await mockImageSearch(page, { items: STUB_IMAGES });
    }

    const article = page.getByRole("article", { name: itemName });
    await article.getByRole("button", { name: "画像を設定" }).click();

    const modal = page.getByRole("dialog", { name: "画像を選択" });
    const firstImageButton = modal
      .locator("button")
      .filter({ has: page.locator("img") })
      .first();
    await expect(firstImageButton).toBeVisible({ timeout: 15000 });
    await firstImageButton.click();

    await expect(modal).not.toBeVisible();
    await expect(article.locator("img")).toBeVisible();
  });

  test("画像を解除するとプレースホルダーに戻る", async ({ page }) => {
    if (isMockMode) {
      await mockImageSearch(page, { items: STUB_IMAGES });
    }

    const article = page.getByRole("article", { name: itemName });
    await article.getByRole("button", { name: "画像を設定" }).click();
    const modal = page.getByRole("dialog", { name: "画像を選択" });
    const firstImageButton = modal
      .locator("button")
      .filter({ has: page.locator("img") })
      .first();
    await expect(firstImageButton).toBeVisible({ timeout: 15000 });
    await firstImageButton.click();
    await expect(modal).not.toBeVisible();
    await expect(article.locator("img")).toBeVisible();

    if (isMockMode) {
      await mockImageSearch(page, { items: STUB_IMAGES });
    }
    await article.getByRole("button", { name: "画像を変更" }).click();
    const modal2 = page.getByRole("dialog", { name: "画像を選択" });
    await expect(
      modal2.getByRole("button", { name: /画像を解除/ }),
    ).toBeVisible({ timeout: 15000 });
    await modal2.getByRole("button", { name: /画像を解除/ }).click();
    await expect(modal2).not.toBeVisible();
    await expect(
      article.getByRole("button", { name: "画像を設定" }),
    ).toBeVisible();
  });
});
```

### 5d: realtime-sync.spec.ts

- [ ] **Step 4: `realtime-sync.spec.ts` を更新**

`frontend/e2e/realtime-sync.spec.ts` の先頭を以下に書き換える：

```typescript
import path from "path";
import { expect, type Page, test } from "@playwright/test";

const AUTH_FILE = path.join(__dirname, "../.auth/user.json");
```

`hasSupabase` 関連の行（先頭 5 行）を削除：

```typescript
// 削除対象:
const supabaseUrl = process.env.PLAYWRIGHT_SUPABASE_URL;
const supabaseAnonKey = process.env.PLAYWRIGHT_SUPABASE_ANON_KEY;
const hasSupabase = !!(supabaseUrl && supabaseAnonKey);
```

`test.skip(!hasSupabase, ...)` 行を削除。

各テスト内の `browser.newContext()` に `storageState` を追加：

```typescript
// 変更前:
const ctxA = await browser.newContext();
const ctxB = await browser.newContext();

// 変更後:
const ctxA = await browser.newContext({ storageState: AUTH_FILE });
const ctxB = await browser.newContext({ storageState: AUTH_FILE });
```

（3つのテストすべてに同じ変更を適用する）

- [ ] **Step 5: 型チェック**

```bash
cd frontend && npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add frontend/e2e/stock-items.spec.ts \
        frontend/e2e/url-registration.spec.ts \
        frontend/e2e/image-selection.spec.ts \
        frontend/e2e/realtime-sync.spec.ts
git commit -m "feat: update e2e specs - remove hasSupabase guards, add mock mode support"
```

---

## Task 6: e2e.yml 更新（Mock E2E CI）

**Files:**
- Modify: `.github/workflows/e2e.yml`

- [ ] **Step 1: `e2e.yml` を書き換え**

`.github/workflows/e2e.yml` を以下に置き換える：

```yaml
name: E2E

on:
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-go@v5
        with:
          go-version-file: backend/go.mod
          cache-dependency-path: backend/go.sum

      - uses: actions/setup-node@v6
        with:
          node-version: "24"
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install frontend dependencies
        run: npm ci
        working-directory: frontend

      - name: Install Playwright browsers
        run: npx playwright install chromium
        working-directory: frontend

      - name: Start backend
        run: go run . &
        working-directory: backend
        env:
          DATABASE_URL: ${{ secrets.E2E_SUPABASE_DATABASE_URL }}
          SUPABASE_JWKS_URL: "${{ secrets.E2E_SUPABASE_URL }}/auth/v1/.well-known/jwks.json"
          SUPABASE_ANON_KEY: ${{ secrets.E2E_SUPABASE_ANON_KEY }}
          PORT: "8080"

      - name: Wait for backend
        run: |
          for i in $(seq 1 30); do
            if curl -s http://localhost:8080/health > /dev/null 2>&1; then
              echo "Backend is ready"
              exit 0
            fi
            sleep 1
          done
          echo "Backend failed to start"
          exit 1

      - name: Run E2E tests (mock)
        run: npx playwright test --project=mock
        working-directory: frontend
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.E2E_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.E2E_SUPABASE_ANON_KEY }}
          NEXT_PUBLIC_API_BASE_URL: http://localhost:8080
          E2E_SUPABASE_URL: ${{ secrets.E2E_SUPABASE_URL }}
          E2E_SUPABASE_ANON_KEY: ${{ secrets.E2E_SUPABASE_ANON_KEY }}
          E2E_TEST_EMAIL: ${{ secrets.E2E_TEST_EMAIL }}
          E2E_TEST_PASSWORD: ${{ secrets.E2E_TEST_PASSWORD }}
          E2E_TEST_GROUP_ID: ${{ secrets.E2E_TEST_GROUP_ID }}
```

- [ ] **Step 2: YAML 構文チェック**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/e2e.yml'))" && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: コミット**

```bash
git add .github/workflows/e2e.yml
git commit -m "feat: update e2e.yml - use Supabase DB and mock playwright project"
```

---

## Task 7: e2e-preview.yml 新規作成（Preview E2E CI）

**Files:**
- Create: `.github/workflows/e2e-preview.yml`

- [ ] **Step 1: `e2e-preview.yml` を作成**

```yaml
name: E2E Preview

on:
  deployment_status:

permissions:
  actions: read

jobs:
  e2e-preview:
    if: >
      github.event.deployment_status.state == 'success' &&
      github.event.deployment.environment != 'Production'
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v6

      - name: Wait for preview-backend if running
        run: |
          sleep 15
          ACTIVE=$(gh run list \
            --workflow=preview-backend.yml \
            --commit "${{ github.sha }}" \
            --json databaseId,status \
            --jq '.[] | select(.status=="in_progress" or .status=="queued" or .status=="waiting") | .databaseId' \
            | head -1)
          if [ -n "$ACTIVE" ]; then
            echo "Waiting for preview-backend run $ACTIVE..."
            gh run watch "$ACTIVE" --exit-status
          else
            FAILED=$(gh run list \
              --workflow=preview-backend.yml \
              --commit "${{ github.sha }}" \
              --json conclusion \
              --jq '.[] | select(.conclusion=="failure" or .conclusion=="cancelled") | .conclusion' \
              | head -1)
            if [ -n "$FAILED" ]; then
              echo "preview-backend workflow $FAILED" && exit 1
            fi
          fi
        env:
          GH_TOKEN: ${{ github.token }}

      - name: Check backend health
        run: |
          curl -fsS \
            --retry 10 \
            --retry-delay 5 \
            --retry-all-errors \
            "${{ vars.PREVIEW_LAMBDA_FUNCTION_URL }}/health"

      - uses: actions/setup-node@v6
        with:
          node-version: "24"
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install frontend dependencies
        run: npm ci
        working-directory: frontend

      - name: Install Playwright browsers
        run: npx playwright install chromium
        working-directory: frontend

      - name: Run E2E tests (preview)
        run: npx playwright test --project=preview
        working-directory: frontend
        env:
          PREVIEW_URL: ${{ github.event.deployment_status.environment_url }}
          PREVIEW_BACKEND_URL: ${{ vars.PREVIEW_LAMBDA_FUNCTION_URL }}
          E2E_SUPABASE_URL: ${{ secrets.E2E_SUPABASE_URL }}
          E2E_SUPABASE_ANON_KEY: ${{ secrets.E2E_SUPABASE_ANON_KEY }}
          E2E_TEST_EMAIL: ${{ secrets.E2E_TEST_EMAIL }}
          E2E_TEST_PASSWORD: ${{ secrets.E2E_TEST_PASSWORD }}
          E2E_TEST_GROUP_ID: ${{ secrets.E2E_TEST_GROUP_ID }}
```

- [ ] **Step 2: YAML 構文チェック**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/e2e-preview.yml'))" && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: 型チェック（frontend）**

```bash
cd frontend && npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add .github/workflows/e2e-preview.yml
git commit -m "feat: add e2e-preview.yml - deployment_status trigger with backend wait"
```

---

## 動作確認チェックリスト（実装後）

実装完了後にユーザーが確認する手順：

1. **事前作業完了確認**: Supabase に email 認証有効・テストユーザー作成・グループ作成・GitHub Secrets 設定済みか
2. **ローカル mock E2E**: `frontend/.env.local` に E2E 変数を設定して `npm run test:e2e` を実行
3. **CI mock E2E**: PR を作成して `E2E` ワークフローが通るか確認
4. **CI preview E2E**: PR 作成後に Vercel preview が deploy されると `E2E Preview` ワークフローが自動起動するか確認

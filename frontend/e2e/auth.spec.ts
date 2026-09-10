import { expect, test } from "@playwright/test";

test.describe("認証・セッション", () => {
  // Scenario: S-4
  //
  // NOTE: `browser.newContext()` inherits the project's `storageState`
  // (".auth/user.json") by default — it is NOT a blank, unauthenticated
  // context unless `storageState` is explicitly overridden. Verified
  // empirically: without the override below, this test's context carried
  // the authenticated `sb-*-auth-token` cookie and the goto landed on
  // `/stock-items`, never `/login`.
  test("S-4: JS無効でも middleware が /login へリダイレクトする", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto("/stock-items");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  // Scenario: S-4 (regression)
  test("S-4回帰: JS有効でも同じ結果になる", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto("/stock-items");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  // Scenario: S-5
  test("S-5: 認証済み・グループ未所属のとき /no-group へリダイレクトする", async ({
    page,
  }) => {
    let stubHitCount = 0;
    await page.route("**/api/groups/me", (route) => {
      stubHitCount++;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    });
    await page.goto("/stock-items");
    await expect(page).toHaveURL(/\/no-group/);
    // Guard against a false-positive pass: authApi.ts's fetchMyGroups() also
    // returns [] on a real 403/404 from the backend, so if the route glob
    // never matched (and the backend happened to 403), this test would land
    // on /no-group for the wrong reason. Confirm the stub actually fired.
    expect(stubHitCount).toBeGreaterThan(0);
  });

  // Scenario: S-6
  test("S-6: cookie セッションはリロード・ナビゲーションをまたいで維持される", async ({
    page,
  }) => {
    await page.goto("/stock-items");
    await expect(
      page.getByRole("button", { name: "商品を追加" }),
    ).toBeVisible();

    await page.reload();
    await expect(page).not.toHaveURL(/\/login/);
    await expect(
      page.getByRole("button", { name: "商品を追加" }),
    ).toBeVisible();

    await page.goto("/invite");
    await expect(page).not.toHaveURL(/\/login/);
    // The e2e test user is the owner of the ephemeral test group created in
    // global-setup.ts, so /invite should render its content rather than
    // client-side redirecting to /stock-items (which would also satisfy the
    // weaker "not /login" check above without proving the page loaded).
    await expect(
      page.getByRole("heading", { name: "招待リンクを生成" }),
    ).toBeVisible();
  });

  // Scenario: S-6
  test("S-6: localStorage にセッション関連のキーが存在しない", async ({
    page,
  }) => {
    await page.goto("/stock-items");
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(
      keys.some((k) => k.startsWith("sb-") && k.includes("auth-token")),
    ).toBe(false);
  });
});

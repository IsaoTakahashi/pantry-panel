import { expect, test } from "@playwright/test";

// Helper: create a single stock item via the UI
async function createItem(
  page: import("@playwright/test").Page,
  name: string,
  category: string,
) {
  await page.getByRole("button", { name: "商品を追加" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("名前").fill(name);
  await dialog.getByLabel("カテゴリ", { exact: true }).selectOption(category);
  await dialog.getByRole("button", { name: "追加", exact: true }).click();
  await expect(page.getByRole("article", { name })).toBeVisible();
  // Wait for the modal exit animation to finish so its DOM elements don't
  // interfere with subsequent locator queries.
  await expect(page.getByRole("dialog")).not.toBeAttached();
}

// Helper: delete a single stock item via the UI
// Caller must ensure wantToBuy is false before calling (delete button is disabled when wantToBuy=true)
async function deleteItem(page: import("@playwright/test").Page, name: string) {
  const article = page.getByRole("article", { name });
  if (!(await article.isVisible())) return;
  page.once("dialog", (d) => d.accept());
  await article.getByRole("button", { name: "削除" }).click();
  await expect(page.getByRole("article", { name })).not.toBeVisible();
}

// Helper: toggle wantToBuy on an item (used to turn it off before deleting)
async function setWantToBuy(
  page: import("@playwright/test").Page,
  name: string,
  desired: boolean,
) {
  const article = page.getByRole("article", { name });
  const btn = article.getByRole("button", { name: "want to buy" });
  const pressed = await btn.getAttribute("aria-pressed");
  const current = pressed === "true";
  if (current !== desired) {
    await btn.click();
    await expect(btn).toHaveAttribute(
      "aria-pressed",
      desired ? "true" : "false",
    );
  }
}

test.describe("フィルタリング", () => {
  // Scenario: F-1
  test("F-1: 検索テキストで商品名が絞り込まれる", async ({ page }) => {
    const suffix = Date.now();
    const item1 = { name: `牛乳-${suffix}`, category: "飲み物" };
    const item2 = { name: `醤油-${suffix}`, category: "調味料" };

    await page.goto("/stock-items");
    await createItem(page, item1.name, item1.category);
    await createItem(page, item2.name, item2.category);

    // Apply search filter
    await page.getByLabel("検索").fill("牛乳");

    // Only item1 should be visible
    await expect(page.getByRole("article", { name: item1.name })).toBeVisible();
    await expect(
      page.getByRole("article", { name: item2.name }),
    ).not.toBeVisible();

    // Cleanup: clear filter then delete items
    await page.getByRole("button", { name: "クリア" }).click();
    await deleteItem(page, item1.name);
    await deleteItem(page, item2.name);
  });

  // Scenario: F-2
  test("F-2: 検索をクリアすると全商品が再表示される", async ({ page }) => {
    const suffix = Date.now();
    const item1 = { name: `牛乳-${suffix}`, category: "飲み物" };
    const item2 = { name: `醤油-${suffix}`, category: "調味料" };

    await page.goto("/stock-items");
    await createItem(page, item1.name, item1.category);
    await createItem(page, item2.name, item2.category);

    // Apply search filter to hide item2
    await page.getByLabel("検索").fill("牛乳");
    await expect(
      page.getByRole("article", { name: item2.name }),
    ).not.toBeVisible();

    // Clear the search
    await page.getByRole("button", { name: "クリア" }).click();

    // Both items should be visible again
    await expect(page.getByRole("article", { name: item1.name })).toBeVisible();
    await expect(page.getByRole("article", { name: item2.name })).toBeVisible();

    // Cleanup
    await deleteItem(page, item1.name);
    await deleteItem(page, item2.name);
  });

  // Scenario: F-3
  test("F-3: 「買いたいものだけ」フィルターで wantToBuy=true の商品のみ表示される", async ({
    page,
  }) => {
    const suffix = Date.now();
    const item1 = { name: `牛乳-${suffix}`, category: "飲み物" }; // will be wantToBuy=true
    const item2 = { name: `醤油-${suffix}`, category: "調味料" }; // wantToBuy=false

    await page.goto("/stock-items");
    await createItem(page, item1.name, item1.category);
    await createItem(page, item2.name, item2.category);

    // Toggle item1 to wantToBuy=true
    await setWantToBuy(page, item1.name, true);

    // Apply wantToBuy filter
    await page.getByRole("button", { name: "買いたいものだけ" }).click();

    // Only item1 (wantToBuy=true) should be visible
    await expect(page.getByRole("article", { name: item1.name })).toBeVisible();
    await expect(
      page.getByRole("article", { name: item2.name }),
    ).not.toBeVisible();

    // Cleanup: turn off filter, reset wantToBuy, then delete
    await page.getByRole("button", { name: "買いたいものだけ" }).click();
    await expect(page.getByRole("article", { name: item1.name })).toBeVisible();
    await expect(page.getByRole("article", { name: item2.name })).toBeVisible();
    await setWantToBuy(page, item1.name, false);
    await deleteItem(page, item1.name);
    await deleteItem(page, item2.name);
  });

  // Scenario: F-4
  test("F-4: カテゴリフィルターで選択カテゴリの商品のみ表示される", async ({
    page,
  }) => {
    const suffix = Date.now();
    const item1 = { name: `牛乳-${suffix}`, category: "飲み物" };
    const item2 = { name: `醤油-${suffix}`, category: "調味料" };

    await page.goto("/stock-items");
    await createItem(page, item1.name, item1.category);
    await createItem(page, item2.name, item2.category);

    // Apply category filter for "飲み物"
    await page.getByLabel("カテゴリ", { exact: true }).selectOption("飲み物");

    // Only item1 (飲み物) should be visible
    await expect(page.getByRole("article", { name: item1.name })).toBeVisible();
    await expect(
      page.getByRole("article", { name: item2.name }),
    ).not.toBeVisible();

    // Cleanup: reset category filter then delete
    await page.getByLabel("カテゴリ", { exact: true }).selectOption("");
    await deleteItem(page, item1.name);
    await deleteItem(page, item2.name);
  });

  // Scenario: F-5
  test("F-5: 検索テキストとカテゴリの複合フィルターで両条件に一致する商品のみ表示される", async ({
    page,
  }) => {
    const suffix = Date.now();
    const item1 = { name: `牛乳-${suffix}`, category: "飲み物" }; // matches search + category
    const item2 = { name: `ビール-${suffix}`, category: "飲み物" }; // same category, different name
    const item3 = { name: `醤油-${suffix}`, category: "調味料" }; // different category

    await page.goto("/stock-items");
    await createItem(page, item1.name, item1.category);
    await createItem(page, item2.name, item2.category);
    await createItem(page, item3.name, item3.category);

    // Apply search filter for "牛乳" AND category filter for "飲み物"
    await page.getByLabel("検索").fill("牛乳");
    await page.getByLabel("カテゴリ", { exact: true }).selectOption("飲み物");

    // Only item1 matches both conditions
    await expect(page.getByRole("article", { name: item1.name })).toBeVisible();
    await expect(
      page.getByRole("article", { name: item2.name }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("article", { name: item3.name }),
    ).not.toBeVisible();

    // Cleanup: reset filters then delete
    await page.getByRole("button", { name: "クリア" }).click();
    await page.getByLabel("カテゴリ", { exact: true }).selectOption("");
    await deleteItem(page, item1.name);
    await deleteItem(page, item2.name);
    await deleteItem(page, item3.name);
  });
});

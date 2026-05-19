import { expect, test } from "@playwright/test";

const hasSupabase = !!(
  process.env.PLAYWRIGHT_SUPABASE_URL &&
  process.env.PLAYWRIGHT_SUPABASE_ANON_KEY
);

test("商品を登録して削除できる", async ({ page }) => {
  test.skip(!hasSupabase, "PLAYWRIGHT_SUPABASE_URL / _ANON_KEY not set");
  const itemName = `醤油-${Date.now()}`;

  await page.goto("/stock-items");

  // 商品登録
  await page.getByRole("button", { name: "商品を追加" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("名前").fill(itemName);
  await dialog.getByLabel("カテゴリ", { exact: true }).selectOption("調味料");
  await dialog.getByRole("button", { name: "追加", exact: true }).click();

  // 登録した商品が表示されていることを確認
  await expect(page.getByText(itemName)).toBeVisible();

  // 商品を削除
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("article", { name: itemName })
    .getByRole("button", { name: "削除" })
    .click();

  // 商品が削除されていることを確認
  await expect(page.getByText(itemName)).not.toBeVisible();
});

import { expect, test } from "@playwright/test";

test("商品を登録して削除できる", async ({ page }) => {
  const itemName = `醤油-${Date.now()}`;

  await page.goto("/stock-items");

  // 商品登録
  await page.getByRole("button", { name: "商品を追加" }).click();
  await page.getByLabel("名前").fill(itemName);
  await page.getByLabel("カテゴリ").selectOption("調味料");
  await page.getByRole("button", { name: "追加", exact: true }).click();

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

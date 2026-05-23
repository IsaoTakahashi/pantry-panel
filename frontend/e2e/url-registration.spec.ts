import { expect, test } from "@playwright/test";

test.describe("URL からの商品登録", () => {
  test("URLから追加ボタンをクリックするとモーダルが開く", async ({ page }) => {
    await page.goto("/stock-items");
    await page.getByRole("button", { name: "URLから追加" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("422 時に「手動で入力してください」が表示される", async ({ page }) => {
    await page.route("**/api/extract-from-url", (route) => {
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ message: "extraction failed" }),
      });
    });
    await page.goto("/stock-items");
    await page.getByRole("button", { name: "URLから追加" }).click();
    const modal = page.getByRole("dialog");
    await modal.getByRole("textbox").fill("https://example.com/product");
    await modal.getByRole("button", { name: "抽出" }).click();
    await expect(
      modal.getByText("商品情報を取得できませんでした。手動で入力してください"),
    ).toBeVisible();
    await expect(
      modal.getByRole("button", { name: "手動で入力する" }),
    ).toBeVisible();
  });

  test("フルフロー: URL 入力 → 商品名が確認モーダルに表示される", async ({
    page,
  }) => {
    await page.route("**/api/extract-from-url", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ name: "テスト商品", imageUrl: null }),
      });
    });
    await page.goto("/stock-items");
    await page.getByRole("button", { name: "URLから追加" }).click();
    const urlModal = page.getByRole("dialog");
    await urlModal.getByRole("textbox").fill("https://example.com/product");
    await urlModal.getByRole("button", { name: "抽出" }).click();
    // URL modal closes and CreateItemModal opens with pre-filled name
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel("名前")).toHaveValue("テスト商品");
  });
});

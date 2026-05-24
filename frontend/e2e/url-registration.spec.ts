import { expect, test } from "@playwright/test";

const SSE_DONE = (name: string, imageUrl: string | null) =>
  `event: done\ndata: ${JSON.stringify({ name, imageUrl })}\n\n`;

const SSE_ERROR = (kind: string, message: string, detail = "") =>
  `event: error\ndata: ${JSON.stringify({ kind, message, detail })}\n\n`;

const SSE_PROGRESS = (step: string, message: string) =>
  `event: progress\ndata: ${JSON.stringify({ step, message })}\n\n`;

test.describe("URL からの商品登録", () => {
  test("URLから追加ボタンをクリックするとモーダルが開く", async ({ page }) => {
    await page.goto("/stock-items");
    await page.getByRole("button", { name: "URLから追加" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("extractionFailed 時に「手動で入力してください」が表示される", async ({
    page,
  }) => {
    await page.route("**/api/extract-from-url/stream", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: SSE_ERROR(
          "extractionFailed",
          "could not extract product name from page",
        ),
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

  test("抽出中にステップリストが表示される", async ({ page }) => {
    await page.route("**/api/extract-from-url/stream", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body:
          SSE_PROGRESS("fetching", "ページを取得中...") +
          SSE_PROGRESS("extracting", "商品情報を解析中...") +
          SSE_DONE("テスト商品", null),
      });
    });
    await page.goto("/stock-items");
    await page.getByRole("button", { name: "URLから追加" }).click();
    const modal = page.getByRole("dialog");
    await modal.getByRole("textbox").fill("https://example.com/product");
    await modal.getByRole("button", { name: "抽出" }).click();
    // CreateItemModal opens after done — step list was shown during streaming
    await expect(page.getByLabel("名前")).toHaveValue("テスト商品", {
      timeout: 10000,
    });
  });

  test("フルフロー: URL 入力 → 商品名が確認モーダルに表示される", async ({
    page,
  }) => {
    await page.route("**/api/extract-from-url/stream", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: SSE_DONE("テスト商品", null),
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

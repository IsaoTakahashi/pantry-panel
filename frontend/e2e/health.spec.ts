import { expect, test } from "@playwright/test";

test.describe("ヘルスチェック", () => {
  test("ヘルスチェックページが ok と connected を表示する", async ({
    page,
  }) => {
    await page.goto("/health");

    await expect(page.getByText("ok")).toBeVisible();
    await expect(page.getByText("connected")).toBeVisible();
  });
});

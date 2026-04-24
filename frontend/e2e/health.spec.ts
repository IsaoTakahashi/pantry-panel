import { expect, test } from "@playwright/test";

test("health check page shows ok and connected", async ({ page }) => {
  await page.goto("/health");

  await expect(page.getByText("ok")).toBeVisible();
  await expect(page.getByText("connected")).toBeVisible();
});

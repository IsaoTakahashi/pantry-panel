import path from "node:path";

import { expect, type Page, test } from "@playwright/test";

const AUTH_FILE = path.join(__dirname, "../.auth/user.json");

// networkidle は Realtime の phx_join ハンドシェイクを捉えない（既に開いている
// WebSocket 上を流れるため）。実際の購読完了シグナルとして window フラグを待つ。
async function waitForRealtimeSubscription(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      (window as unknown as Record<string, unknown>)
        .__supabaseRealtimeSubscribed === true,
    { timeout: 30000 },
  );
}

test.describe
  .serial("Realtime sync", () => {
    const itemName = "Realtime Test Item";

    test("Context A で INSERT → Context B にカードが出現する", async ({
      browser,
    }) => {
      const ctxA = await browser.newContext({ storageState: AUTH_FILE });
      const ctxB = await browser.newContext({ storageState: AUTH_FILE });
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      // TEMP DEBUG (Issue #247 investigation, remove before merge)
      pageA.on("console", (msg) => console.log("[pageA console]", msg.text()));
      pageB.on("console", (msg) => console.log("[pageB console]", msg.text()));

      await pageA.goto("/stock-items");
      await pageB.goto("/stock-items");
      await Promise.all([
        waitForRealtimeSubscription(pageA),
        waitForRealtimeSubscription(pageB),
      ]);

      // Context A で新規作成
      await pageA.getByRole("button", { name: "商品を追加" }).click();
      const dialog = pageA.getByRole("dialog");
      await dialog.getByLabel("名前").fill(itemName);
      await dialog
        .getByLabel("カテゴリ", { exact: true })
        .selectOption("調味料");
      await dialog.getByRole("button", { name: "追加", exact: true }).click();
      await expect(pageA.getByText(itemName)).toBeVisible();
      // TEMP DEBUG: timeout widened to 25s to check if the event is merely
      // delayed (Realtime cold-start on the job's first subscription) vs.
      // truly never delivered (Issue #247 investigation, revert before merge)
      await expect(pageB.getByText(itemName)).toBeVisible({
        timeout: 25000,
      });

      await ctxA.close();
      await ctxB.close();
    });

    test("Context A で wantToBuy トグル → Context B で aria-pressed が変化する", async ({
      browser,
    }) => {
      const ctxA = await browser.newContext({ storageState: AUTH_FILE });
      const ctxB = await browser.newContext({ storageState: AUTH_FILE });
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      // TEMP DEBUG (Issue #247 investigation, remove before merge)
      pageA.on("console", (msg) => console.log("[pageA console]", msg.text()));
      pageB.on("console", (msg) => console.log("[pageB console]", msg.text()));

      await pageA.goto("/stock-items");
      await pageB.goto("/stock-items");
      await Promise.all([
        waitForRealtimeSubscription(pageA),
        waitForRealtimeSubscription(pageB),
      ]);

      await expect(pageA.getByText(itemName)).toBeVisible();
      await expect(pageB.getByText(itemName)).toBeVisible();

      const toggleButton = (page: Page) =>
        page
          .getByRole("article", {
            name: itemName,
          })
          .getByRole("button", {
            name: "want to buy",
          });

      const pageAToggleButton = toggleButton(pageA);
      await expect(pageAToggleButton).toHaveAttribute("aria-pressed", "false");
      const pageBToggleButton = toggleButton(pageB);
      await expect(pageBToggleButton).toHaveAttribute("aria-pressed", "false");

      await pageAToggleButton.click();
      await expect(pageAToggleButton).toHaveAttribute("aria-pressed", "true");
      await expect(pageBToggleButton).toHaveAttribute("aria-pressed", "true", {
        timeout: 10000,
      });

      await pageAToggleButton.click();
      await expect(pageAToggleButton).toHaveAttribute("aria-pressed", "false");
      await expect(pageBToggleButton).toHaveAttribute("aria-pressed", "false", {
        timeout: 10000,
      });

      await ctxA.close();
      await ctxB.close();
    });

    test("Context A で DELETE → Context B からカードが消える", async ({
      browser,
    }) => {
      const ctxA = await browser.newContext({ storageState: AUTH_FILE });
      const ctxB = await browser.newContext({ storageState: AUTH_FILE });
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      await pageA.goto("/stock-items");
      await pageB.goto("/stock-items");
      await Promise.all([
        waitForRealtimeSubscription(pageA),
        waitForRealtimeSubscription(pageB),
      ]);

      await expect(pageA.getByText(itemName)).toBeVisible();
      await expect(pageB.getByText(itemName)).toBeVisible();

      await pageA
        .getByRole("article", {
          name: itemName,
        })
        .getByRole("button", { name: "削除" })
        .click();
      // ConfirmDialog opens — click the confirm button
      await pageA.getByRole("button", { name: "確認" }).click();
      await expect(pageA.getByRole("dialog")).not.toBeAttached();
      await expect(pageA.getByText(itemName)).not.toBeVisible();

      await expect(pageB.getByText(itemName)).not.toBeVisible({
        timeout: 10000,
      });

      await ctxA.close();
      await ctxB.close();
    });
  });

import { expect, type Page, test } from "@playwright/test";

const supabaseUrl = process.env.PLAYWRIGHT_SUPABASE_URL;
const supabaseAnonKey = process.env.PLAYWRIGHT_SUPABASE_ANON_KEY;
const hasSupabase = !!(supabaseUrl && supabaseAnonKey);

test.describe
  .serial("Realtime sync", () => {
    test.skip(!hasSupabase, "PLAYWRIGHT_SUPABASE_URL / _ANON_KEY not set");

    const itemName = "Realtime Test Item";

    test("Context A で INSERT → Context B にカードが出現する", async ({
      browser,
    }) => {
      const ctxA = await browser.newContext();
      const ctxB = await browser.newContext();
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      await pageA.goto("/stock-items");
      await pageB.goto("/stock-items");
      await pageB.waitForLoadState("networkidle");

      // Context A で新規作成
      await pageA.getByRole("button", { name: "商品を追加" }).click();
      const dialog = pageA.getByRole("dialog");
      await dialog.getByLabel("名前").fill(itemName);
      await dialog
        .getByLabel("カテゴリ", { exact: true })
        .selectOption("調味料");
      await dialog.getByRole("button", { name: "追加", exact: true }).click();
      await expect(pageA.getByText(itemName)).toBeVisible();
      await expect(pageB.getByText(itemName)).toBeVisible({
        timeout: 10000,
      });

      await ctxA.close();
      await ctxB.close();
    });

    test("Context A で wantToBuy トグル → Context B で aria-pressed が変化する", async ({
      browser,
    }) => {
      const ctxA = await browser.newContext();
      const ctxB = await browser.newContext();
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      await pageA.goto("/stock-items");
      await pageB.goto("/stock-items");
      await pageB.waitForLoadState("networkidle");

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
      const ctxA = await browser.newContext();
      const ctxB = await browser.newContext();
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      await pageA.goto("/stock-items");
      await pageB.goto("/stock-items");
      await pageB.waitForLoadState("networkidle");

      await expect(pageA.getByText(itemName)).toBeVisible();
      await expect(pageB.getByText(itemName)).toBeVisible();

      pageA.once("dialog", (dialog) => dialog.accept());
      await pageA
        .getByRole("article", {
          name: itemName,
        })
        .getByRole("button", { name: "削除" })
        .click();
      await expect(pageA.getByText(itemName)).not.toBeVisible();

      await expect(pageB.getByText(itemName)).not.toBeVisible({
        timeout: 10000,
      });

      await ctxA.close();
      await ctxB.close();
    });
  });

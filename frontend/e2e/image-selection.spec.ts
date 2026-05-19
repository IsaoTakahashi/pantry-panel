import { expect, test } from "@playwright/test";

const hasGoogleCSE = !!process.env.PLAYWRIGHT_GOOGLE_CSE_ENABLED;
const hasSupabase = !!(
  process.env.PLAYWRIGHT_SUPABASE_URL &&
  process.env.PLAYWRIGHT_SUPABASE_ANON_KEY
);

test.describe("画像設定", () => {
  test.skip(!hasSupabase, "PLAYWRIGHT_SUPABASE_URL / _ANON_KEY not set");
  let itemName: string;

  test.beforeEach(async ({ page }) => {
    itemName = `テスト商品-${Date.now()}`;
    await page.goto("/stock-items");
    await page.getByRole("button", { name: "商品を追加" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("名前").fill(itemName);
    await dialog.getByLabel("カテゴリ", { exact: true }).selectOption("調味料");
    await dialog.getByRole("button", { name: "追加", exact: true }).click();
    await expect(page.getByText(itemName)).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    // 開いているモーダルを閉じてから削除
    await page.keyboard.press("Escape");
    const article = page.getByRole("article", { name: itemName });
    if (await article.isVisible()) {
      page.once("dialog", (d) => d.accept());
      await article.getByRole("button", { name: "削除" }).click();
    }
  });

  test("画像ボタンをクリックするとモーダルが開き、キャンセルで閉じる", async ({
    page,
  }) => {
    await page
      .getByRole("article", { name: itemName })
      .getByRole("button", { name: "画像を設定" })
      .click();

    const modal = page.getByRole("dialog", { name: "画像を選択" });
    await expect(modal).toBeVisible();

    await modal.getByRole("button", { name: /キャンセル/ }).click();
    await expect(modal).not.toBeVisible();
  });

  test("Escape キーでモーダルが閉じる", async ({ page }) => {
    await page
      .getByRole("article", { name: itemName })
      .getByRole("button", { name: "画像を設定" })
      .click();

    const modal = page.getByRole("dialog", { name: "画像を選択" });
    await expect(modal).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible();
  });

  test("Google CSE 未設定時: 検索エラーと再試行ボタンが表示される", async ({
    page,
  }) => {
    test.skip(hasGoogleCSE, "Google CSE が設定されている環境ではスキップ");

    await page
      .getByRole("article", { name: itemName })
      .getByRole("button", { name: "画像を設定" })
      .click();

    const modal = page.getByRole("dialog", { name: "画像を選択" });
    await expect(modal.getByText(/画像検索に失敗しました/)).toBeVisible({
      timeout: 10000,
    });
    await expect(modal.getByRole("button", { name: /再試行/ })).toBeVisible();
  });

  test("画像を選択するとカードに画像が表示される", async ({ page }) => {
    test.skip(
      !hasGoogleCSE,
      "PLAYWRIGHT_GOOGLE_CSE_ENABLED が未設定のためスキップ",
    );

    const article = page.getByRole("article", { name: itemName });
    await article.getByRole("button", { name: "画像を設定" }).click();

    const modal = page.getByRole("dialog", { name: "画像を選択" });
    const firstImageButton = modal
      .locator("button")
      .filter({ has: page.locator("img") })
      .first();
    await expect(firstImageButton).toBeVisible({ timeout: 15000 });
    await firstImageButton.click();

    await expect(modal).not.toBeVisible();
    await expect(article.locator("img")).toBeVisible();
  });

  test("画像を解除するとプレースホルダーに戻る", async ({ page }) => {
    test.skip(
      !hasGoogleCSE,
      "PLAYWRIGHT_GOOGLE_CSE_ENABLED が未設定のためスキップ",
    );

    const article = page.getByRole("article", { name: itemName });

    // 画像を設定
    await article.getByRole("button", { name: "画像を設定" }).click();
    const modal = page.getByRole("dialog", { name: "画像を選択" });
    const firstImageButton = modal
      .locator("button")
      .filter({ has: page.locator("img") })
      .first();
    await expect(firstImageButton).toBeVisible({ timeout: 15000 });
    await firstImageButton.click();
    await expect(modal).not.toBeVisible();
    await expect(article.locator("img")).toBeVisible();

    // 画像を解除
    await article.getByRole("button", { name: "画像を変更" }).click();
    const modal2 = page.getByRole("dialog", { name: "画像を選択" });
    await expect(
      modal2.getByRole("button", { name: /画像を解除/ }),
    ).toBeVisible({ timeout: 15000 });
    await modal2.getByRole("button", { name: /画像を解除/ }).click();
    await expect(modal2).not.toBeVisible();
    await expect(
      article.getByRole("button", { name: "画像を設定" }),
    ).toBeVisible();
  });
});

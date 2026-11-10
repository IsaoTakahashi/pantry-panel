import { expect, type Locator, type Page, test } from "@playwright/test";

// Copied into frontend/e2e/verify-scratch/ by drive.sh. Proves create → persisted
// (survives reload, i.e. read back from the Go API via SSR) → delete → gone.
const evidence = process.env.VERIFY_EVIDENCE_DIR ?? "test-results";

// Cards fade in via motion (JS-driven, invisible to getAnimations()) even under
// reducedMotion. Wait until the card and every ancestor are fully opaque so the
// screenshot shows the end state, not a half-transparent frame.
async function fullyOpaque(target: Locator) {
  await expect
    .poll(() =>
      target.evaluate((el) => {
        for (let n: Element | null = el; n; n = n.parentElement) {
          if (getComputedStyle(n).opacity !== "1") return false;
        }
        return true;
      }),
    )
    .toBe(true);
}

async function shot(page: Page, name: string, settle?: Locator) {
  if (settle) await fullyOpaque(settle);
  await page.screenshot({
    path: `${evidence}/screenshots/${name}.png`,
    fullPage: true,
  });
}

test("在庫アイテムを登録・永続化・削除できる", async ({ page }) => {
  const itemName = `verify-醤油-${Date.now()}`;

  await page.goto("/stock-items");
  await shot(page, "01-initial");

  await page.getByRole("button", { name: "商品を追加" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("名前").fill(itemName);
  await dialog.getByLabel("カテゴリ", { exact: true }).selectOption("調味料");
  await dialog.getByRole("button", { name: "追加", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeAttached();

  const card = page.getByRole("article", { name: itemName });
  await expect(card).toBeVisible();
  await shot(page, "02-created", card);

  await page.reload();
  await expect(card).toBeVisible();
  await shot(page, "03-after-reload", card);

  await card.getByRole("button", { name: "削除" }).click();
  await page.getByRole("button", { name: "確認" }).click();
  await expect(page.getByRole("dialog")).not.toBeAttached();
  await expect(card).not.toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "商品を追加" })).toBeVisible();
  await expect(card).toHaveCount(0);
  await shot(page, "04-deleted-after-reload");
});

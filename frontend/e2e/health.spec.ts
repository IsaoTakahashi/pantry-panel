import { expect, test } from "@playwright/test";

test.describe("ヘルスチェック", () => {
  test("ヘルスチェックページが ok と connected を表示する", async ({
    page,
  }) => {
    await page.goto("/health");

    // exact: true — the root layout's cookies()/headers() read (Issue #182)
    // makes every route fully dynamic, so Next.js dev server's "runtime data
    // during prerendering" issue overlay can be present in the DOM here too;
    // its code frame contains "cookieStore = " / "cookies();", both of which
    // a non-exact getByText("ok") also matches (they contain "ok"),
    // occasionally causing a strict-mode violation. See
    // .claude/rules/testing.md 2026-09-11 entry and the design doc's
    // 既存E2Eへの影響 addendum for the full investigation.
    await expect(page.getByText("ok", { exact: true })).toBeVisible();
    await expect(page.getByText("connected", { exact: true })).toBeVisible();
  });
});

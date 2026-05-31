import { expect, test } from "@playwright/test";

/**
 * Service Worker E2E (project: "sw").
 *
 * Runs against a real production build served on port 3001
 * (see `playwright.config.ts`).
 *
 * Covers spec scenarios:
 *   - S-1: 本番ビルドで /sw.js が配信される
 *   - S-2: 本番ビルドでブラウザが SW を登録しスコープが / になる
 *   - S-5: install 後に CacheStorage が pre-cache 対象で満たされる
 *   - S-6: /api/* レスポンスはキャッシュされない（NetworkOnly）
 *   - S-7: 静的アセットはキャッシュから即返る（CacheFirst）
 *   - S-8: shell HTML はキャッシュ即返 + 裏で更新される（SWR） — see note
 *
 * S-9 / S-10 (skipWaiting + clientsClaim) are covered by source-inspection
 * unit tests in src/sw.config.test.ts; observing actual SW-generation
 * switchovers in E2E is high-cost and low-value.
 */

test.describe("Service Worker", () => {
  test("S-1: 本番ビルドで /sw.js が 200 で配信される", async ({ request }) => {
    const response = await request.get("/sw.js");
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body.length).toBeGreaterThan(100);
    // Must look like a service worker script (Serwist output contains "precache"
    // and references to the standard self/registration globals).
    expect(body).toMatch(/precache/);
  });

  test("S-2: ブラウザが SW を登録しスコープが / になる", async ({ page }) => {
    await page.goto("/health");
    const scope = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return reg.scope;
    });
    expect(scope).toMatch(/\/$/);
  });

  test("S-5: install 後に CacheStorage が pre-cache 対象を含む", async ({
    page,
  }) => {
    await page.goto("/health");
    // Wait for the SW to be active. ready resolves when there's an active worker.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });

    // Poll briefly for the precache cache to populate (install runs async).
    const cachedUrls = await page.evaluate(async () => {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const cacheNames = await caches.keys();
        const collected: string[] = [];
        for (const name of cacheNames) {
          const cache = await caches.open(name);
          const requests = await cache.keys();
          for (const req of requests) {
            collected.push(new URL(req.url).pathname);
          }
        }
        if (collected.length > 0) {
          return collected;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      return [];
    });

    expect(cachedUrls.length).toBeGreaterThan(0);
    // At least one of the icons must be precached.
    expect(cachedUrls.some((p) => p === "/icon-192.png")).toBe(true);
    // And at least one chunk under /_next/static/
    expect(cachedUrls.some((p) => p.startsWith("/_next/static/"))).toBe(true);
  });

  test("S-6: /api/* のレスポンスは CacheStorage に保存されない", async ({
    page,
  }) => {
    await page.goto("/health");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });

    // Trigger the API call from inside the page so the SW intercepts it.
    await page.evaluate(async () => {
      try {
        await fetch("/api/health");
      } catch {
        // ignored — even a network error must not be cached
      }
    });

    const cachedApi = await page.evaluate(async () => {
      const match = await caches.match("/api/health");
      return match ? await match.text() : null;
    });
    expect(cachedApi).toBeNull();
  });

  test("S-8: shell HTML は SWR (キャッシュ即返 + 裏で更新) で配信される", async ({
    page,
  }) => {
    // Use a dedicated stable URL so we can serve deterministic bodies. The
    // exact path does not need to exist server-side because page.route
    // intercepts every request — including SW-initiated fetches when
    // serviceWorkers: "allow" — before they hit the network.
    const SHELL_URL = "/swr-shell-fixture";
    const v1Body =
      '<!doctype html><html><body><main id="m">swr-marker-v1</main></body></html>';
    const v2Body =
      '<!doctype html><html><body><main id="m">swr-marker-v2</main></body></html>';

    // Prime the SW first via a real same-origin navigation so it is
    // controlling subsequent fetches by the time we navigate to the fixture.
    await page.goto("/health");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      while (!navigator.serviceWorker.controller) {
        await new Promise((r) => setTimeout(r, 50));
      }
    });

    // Phase 1: serve v1. The SW has no cache for SHELL_URL yet, so SWR falls
    // through to network, caches v1, and returns v1.
    let currentBody = v1Body;
    await page.route(`**${SHELL_URL}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: currentBody,
      });
    });

    await page.goto(SHELL_URL);
    await expect(page.locator("#m")).toHaveText("swr-marker-v1");

    // Wait for the v1 response to be persisted in CacheStorage.
    const cachedV1 = await page.evaluate(async (url) => {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const match = await caches.match(url);
        if (match) return await match.text();
        await new Promise((r) => setTimeout(r, 100));
      }
      return null;
    }, SHELL_URL);
    expect(cachedV1).not.toBeNull();
    expect(cachedV1).toContain("swr-marker-v1");

    // Phase 2: flip the network to serve v2. SWR must return the cached v1
    // immediately on the next navigation while it fetches v2 in the
    // background, and the cache must then transition to v2.
    currentBody = v2Body;

    await page.goto(SHELL_URL);
    // Immediate render must be the cached v1 (proves cache-first leg of SWR;
    // a plain CacheFirst would also pass this, but the v2 transition below
    // would then fail because CacheFirst never revalidates).
    await expect(page.locator("#m")).toHaveText("swr-marker-v1");

    // Background revalidation must replace the cached body with v2.
    const cachedV2 = await page.evaluate(async (url) => {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const match = await caches.match(url);
        if (match) {
          const text = await match.text();
          if (text.includes("swr-marker-v2")) return text;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      const fallback = await caches.match(url);
      return fallback ? await fallback.text() : null;
    }, SHELL_URL);
    expect(cachedV2).not.toBeNull();
    expect(cachedV2).toContain("swr-marker-v2");
  });

  test("S-7: 静的アセット (_next/static/*) は CacheFirst でネットワーク非依存", async ({
    page,
  }) => {
    await page.goto("/health");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });

    // Find a representative cached _next/static asset.
    const targetPath = await page.evaluate(async () => {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          const cache = await caches.open(name);
          const requests = await cache.keys();
          for (const req of requests) {
            const url = new URL(req.url);
            if (url.pathname.startsWith("/_next/static/")) {
              return url.pathname;
            }
          }
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      return null;
    });
    expect(targetPath).not.toBeNull();
    if (!targetPath) return;

    // Replace the network with a failing handler. CacheFirst should still
    // serve the cached body successfully.
    await page.route(targetPath, async (route) => {
      await route.fulfill({ status: 503, body: "network-blocked" });
    });

    const status = await page.evaluate(async (path) => {
      const res = await fetch(path);
      return res.status;
    }, targetPath);
    expect(status).toBe(200);
  });
});

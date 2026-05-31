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

  test("S-8: shell HTML (/health) は SWR でキャッシュに保存される", async ({
    page,
  }) => {
    // 1st visit: SW intercepts and caches the document via StaleWhileRevalidate.
    await page.goto("/health");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // 2nd visit triggers the SWR cycle on the same URL.
    await page.goto("/health");

    // Allow the background revalidate to settle, then assert the response
    // body is now in CacheStorage. Both first-visit cache write and SWR
    // refresh must end with a cached response.
    const cachedBody = await page.evaluate(async () => {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const match = await caches.match("/health");
        if (match) return await match.text();
        await new Promise((r) => setTimeout(r, 250));
      }
      return null;
    });
    expect(cachedBody).not.toBeNull();
    expect(cachedBody?.length ?? 0).toBeGreaterThan(0);
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

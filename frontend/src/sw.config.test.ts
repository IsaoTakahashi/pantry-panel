import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "..");
const SW_SOURCE = path.join(REPO_ROOT, "src", "sw.ts");
const NEXT_CONFIG = path.join(REPO_ROOT, "next.config.ts");
const MANIFEST_SOURCE = path.join(REPO_ROOT, "src", "app", "manifest.ts");
const PLAYWRIGHT_CONFIG = path.join(REPO_ROOT, "playwright.config.ts");
const E2E_SW_SPEC = path.join(REPO_ROOT, "e2e", "service-worker.spec.ts");

const swSource = fs.readFileSync(SW_SOURCE, "utf-8");
const nextConfigSource = fs.readFileSync(NEXT_CONFIG, "utf-8");
const playwrightConfigSource = fs.readFileSync(PLAYWRIGHT_CONFIG, "utf-8");

describe("Service Worker source guards", () => {
  describe("S-3: 開発モードでは SW を生成・登録しない", () => {
    it("next.config.ts disables Serwist in development", () => {
      expect(nextConfigSource).toMatch(
        /disable:\s*process\.env\.NODE_ENV\s*===\s*["']development["']/,
      );
    });

    it("ServiceWorkerRegister no-ops outside production", () => {
      const registerSource = fs.readFileSync(
        path.join(REPO_ROOT, "src", "components", "ServiceWorkerRegister.tsx"),
        "utf-8",
      );
      expect(registerSource).toMatch(
        /process\.env\.NODE_ENV\s*!==\s*["']production["']/,
      );
    });
  });

  describe("S-6 guard: /api/* uses NetworkOnly", () => {
    it("sw.ts routes /api/ paths through NetworkOnly", () => {
      // Match a RegExpRoute on /api/ paired with a NetworkOnly handler.
      // Allow some flexibility (whitespace, comments) between the regex and "NetworkOnly()".
      const apiRule =
        /RegExpRoute\(\s*\/\^\\\/api\\\/\/[^,)]*,\s*new\s+NetworkOnly\s*\(\s*\)\s*\)/;
      expect(swSource).toMatch(apiRule);
    });

    it("sw.ts also wraps the Lambda host (NEXT_PUBLIC_API_BASE_URL) in NetworkOnly", () => {
      expect(swSource).toMatch(/NEXT_PUBLIC_API_BASE_URL/);
      expect(swSource).toMatch(/new\s+NetworkOnly\s*\(\s*\)/);
    });
  });

  describe("S-7 guard: static assets use CacheFirst", () => {
    it("sw.ts uses CacheFirst for /_next/static/* and icons", () => {
      expect(swSource).toMatch(/new\s+CacheFirst/);
      // The static-asset matcher must cover _next/static/, icon-*.png,
      // favicon.ico, and manifest.webmanifest at minimum.
      const matcher =
        /_next\\\/static\\\/[\s\S]*icon-[\s\S]*favicon\\\.ico[\s\S]*manifest\\\.webmanifest/;
      expect(swSource).toMatch(matcher);
    });
  });

  describe("S-8 guard: document destination uses StaleWhileRevalidate", () => {
    it("sw.ts has a route that matches request.destination === 'document' with SWR", () => {
      expect(swSource).toMatch(/request\.destination\s*===\s*["']document["']/);
      expect(swSource).toMatch(/new\s+StaleWhileRevalidate/);
    });
  });

  describe("S-9: SW skipWaiting", () => {
    it("sw.ts (or @serwist/next config) sets skipWaiting: true", () => {
      expect(swSource).toMatch(/skipWaiting:\s*true/);
    });
  });

  describe("S-10: SW clients.claim", () => {
    it("sw.ts (or @serwist/next config) sets clientsClaim: true", () => {
      expect(swSource).toMatch(/clientsClaim:\s*true/);
    });
  });

  describe("S-11: existing PWA manifest unchanged", () => {
    it("manifest.ts keeps start_url, name, short_name, and icon list stable", () => {
      const source = fs.readFileSync(MANIFEST_SOURCE, "utf-8");
      expect(source).toMatch(/name:\s*["']Pantry Panel["']/);
      expect(source).toMatch(/short_name:\s*["']Pantry Panel["']/);
      expect(source).toMatch(/start_url:\s*["']\/stock-items["']/);
      expect(source).toMatch(/src:\s*["']\/icon-192\.png["']/);
      expect(source).toMatch(/src:\s*["']\/icon-512\.png["']/);
    });
  });

  describe("S-12: Playwright mock / preview projects block service workers", () => {
    it("playwright.config.ts mock project sets serviceWorkers: 'block'", () => {
      // Match the mock project block, then assert serviceWorkers: "block" lives inside it.
      const mockBlockMatch = playwrightConfigSource.match(
        /name:\s*["']mock["'][\s\S]*?\}\s*,\s*\]/,
      );
      expect(mockBlockMatch).not.toBeNull();
      expect(mockBlockMatch?.[0]).toMatch(/serviceWorkers:\s*["']block["']/);
    });

    it("playwright.config.ts preview project sets serviceWorkers: 'block'", () => {
      const previewBlockMatch = playwrightConfigSource.match(
        /name:\s*["']preview["'][\s\S]*?\},\s*\{/,
      );
      expect(previewBlockMatch).not.toBeNull();
      expect(previewBlockMatch?.[0]).toMatch(/serviceWorkers:\s*["']block["']/);
    });
  });

  describe("S-13: dedicated SW E2E spec exists", () => {
    it("e2e/service-worker.spec.ts file exists", () => {
      expect(fs.existsSync(E2E_SW_SPEC)).toBe(true);
    });
  });
});

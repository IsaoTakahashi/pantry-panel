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
    it("next.config.ts derives a dev flag from NODE_ENV and passes it to disable", () => {
      // Must compute NODE_ENV === "development" somewhere and pass it as disable.
      expect(nextConfigSource).toMatch(
        /process\.env\.NODE_ENV\s*===\s*["']development["']/,
      );
      expect(nextConfigSource).toMatch(/disable:\s*\w+/);
    });

    it("next.config.ts also skips wrapping with Serwist when in dev", () => {
      // The export gates Serwist behind the dev flag so Turbopack works in dev.
      expect(nextConfigSource).toMatch(
        /export\s+default\s+\w+\s*\?\s*nextConfig\s*:\s*withSerwist\(nextConfig\)/,
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
      // Allow some flexibility (whitespace, comments) between the matcher
      // regex and the NetworkOnly handler declaration on the next field.
      const apiRule =
        /matcher:\s*\/\^\\\/api\\\/\/[\s\S]{0,200}?handler:\s*new\s+NetworkOnly\s*\(\s*\)/;
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

  describe("S-8 guard: document destination uses NetworkFirst", () => {
    it("sw.ts has a route that matches request.destination === 'document' with NetworkFirst", () => {
      expect(swSource).toMatch(/request\.destination\s*===\s*["']document["']/);
      expect(swSource).toMatch(/new\s+NetworkFirst/);
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

    it("playwright.config.ts sw project sets serviceWorkers: 'allow'", () => {
      // The SW-dedicated project (last in the projects array) must opt back
      // in to service workers so the spec can actually exercise them. The
      // proposal explicitly calls this out: "SW 専用 spec は
      // `serviceWorkers: \"allow\"` の独立 project".
      const swBlockMatch = playwrightConfigSource.match(
        /name:\s*["']sw["'][\s\S]*?\}\s*,?\s*\]/,
      );
      expect(swBlockMatch).not.toBeNull();
      expect(swBlockMatch?.[0]).toMatch(/serviceWorkers:\s*["']allow["']/);
    });
  });

  describe("S-13: dedicated SW E2E spec exists", () => {
    it("e2e/service-worker.spec.ts file exists", () => {
      expect(fs.existsSync(E2E_SW_SPEC)).toBe(true);
    });
  });
});

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "..");
const SW_OUTPUT = path.join(REPO_ROOT, "public", "sw.js");
const NEXT_CONFIG = path.join(REPO_ROOT, "next.config.ts");
const MANIFEST_SOURCE = path.join(REPO_ROOT, "src", "app", "manifest.ts");

/**
 * S-4: pre-cache manifest に shell / 静的アセット / アイコンが含まれる
 *
 * This test reads the actual built `public/sw.js` and asserts that the
 * pre-cache manifest (embedded in the file) includes the URL patterns
 * required by the spec.
 *
 * The build is invoked in `beforeAll` only if the SW output is missing,
 * so local watchers / CI can re-use a previous build if present.
 */
describe("Service Worker pre-cache manifest", () => {
  let swContent = "";

  beforeAll(() => {
    if (!fs.existsSync(SW_OUTPUT)) {
      execSync("npm run build", {
        cwd: REPO_ROOT,
        stdio: "inherit",
        env: {
          ...process.env,
          NODE_ENV: "production",
        },
      });
    }
    swContent = fs.readFileSync(SW_OUTPUT, "utf-8");
  }, 240_000);

  it("does NOT contain /stock-items shell HTML entry", () => {
    // The shell HTML is intentionally NOT pre-cached. document navigations
    // are served via NetworkFirst (see sw.ts), so a frozen /stock-items entry
    // referencing stale chunk hashes can no longer persist across deploys.
    expect(swContent).not.toMatch(/['"]\/stock-items['"]/);
  });

  it("contains at least one /_next/static/chunks/ entry", () => {
    expect(swContent).toMatch(/\/_next\/static\/chunks\//);
  });

  it("contains at least one /_next/static/media/ entry (fonts etc.)", () => {
    expect(swContent).toMatch(/\/_next\/static\/media\//);
  });

  it("contains /icon-192.png and /icon-512.png entries", () => {
    expect(swContent).toMatch(/['"]\/icon-192\.png['"]/);
    expect(swContent).toMatch(/['"]\/icon-512\.png['"]/);
  });

  it("contains /favicon.ico entry", () => {
    expect(swContent).toMatch(/['"]\/favicon\.ico['"]/);
  });

  it("contains /manifest.webmanifest entry", () => {
    expect(swContent).toMatch(/['"]\/manifest\.webmanifest['"]/);
  });

  // Drift guard (inverted): the PWA's start_url shell HTML MUST NOT be in
  // additionalPrecacheEntries. Pre-caching the start_url HTML with
  // `revision: null` freezes a copy referencing first-visit chunk hashes that
  // 404 after a deploy. document navigations are served via NetworkFirst
  // instead. If someone re-adds the start_url to additionalPrecacheEntries
  // (regressing this fix), this test fails fast. start_url itself stays
  // /stock-items (manifest.ts is unchanged).
  it("manifest.ts start_url is NOT listed in next.config.ts additionalPrecacheEntries", () => {
    const manifestSource = fs.readFileSync(MANIFEST_SOURCE, "utf-8");
    const nextConfigSource = fs.readFileSync(NEXT_CONFIG, "utf-8");

    const startUrlMatch = manifestSource.match(/start_url:\s*["']([^"']+)["']/);
    expect(startUrlMatch).not.toBeNull();
    const startUrl = startUrlMatch?.[1];
    expect(startUrl, "manifest.ts must define start_url").toBeDefined();

    if (!startUrl) return;
    const escaped = startUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const precacheEntry = new RegExp(`url:\\s*["']${escaped}["']`);
    expect(nextConfigSource).not.toMatch(precacheEntry);
  });
});

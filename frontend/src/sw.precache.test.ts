import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "..");
const SW_OUTPUT = path.join(REPO_ROOT, "public", "sw.js");

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

  it("contains /stock-items shell HTML entry", () => {
    expect(swContent).toMatch(/['"]\/stock-items['"]/);
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
});

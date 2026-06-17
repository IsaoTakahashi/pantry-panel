import fs from "node:fs";
import path from "node:path";

import { defineConfig } from "@playwright/test";

const envFile = path.join(__dirname, ".env.e2e");
if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const SW_PORT = 3001;

// The SW e2e project needs a production build on a separate port. That build
// is slow (~30s+) so we only spin up the second webServer when the SW tests
// are actually being run. Opt-in via RUN_SW_E2E=1 (or by setting it in CI).
const runSwE2e = process.env.RUN_SW_E2E === "1";

export default defineConfig({
  reporter: [["list"], ["html"], ["junit", { outputFile: "results.xml" }]],
  testDir: "./e2e",
  // preview runs against a shared real Supabase; sequential execution prevents
  // Realtime events from one test closing dialogs opened by another test
  workers: process.env.PREVIEW_URL ? 1 : undefined,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  webServer: process.env.PREVIEW_URL
    ? undefined
    : [
        {
          command: "npm run dev",
          port: 3000,
          reuseExistingServer: true,
        },
        // Service Worker E2E needs a production build (SW is only emitted
        // when NODE_ENV=production). Run on a separate port so it does not
        // collide with the dev server used by the `mock` project.
        ...(runSwE2e
          ? [
              {
                command: `npm run build && npx next start -p ${SW_PORT}`,
                port: SW_PORT,
                reuseExistingServer: true,
                timeout: 240_000,
              },
            ]
          : []),
      ],
  projects: [
    {
      name: "preview",
      retries: 1,
      use: {
        // Emulate prefers-reduced-motion so framer-motion (via MotionConfig
        // reducedMotion="user") disables transform/layout animations, which
        // otherwise destabilize locator/click resolution.
        contextOptions: { reducedMotion: "reduce" },
        storageState: ".auth/user.json",
        baseURL: process.env.PREVIEW_URL,
        extraHTTPHeaders: process.env.VERCEL_BYPASS_TOKEN
          ? { "x-vercel-protection-bypass": process.env.VERCEL_BYPASS_TOKEN }
          : undefined,
        serviceWorkers: "block",
      },
      testIgnore: /service-worker\.spec\.ts$/,
    },
    {
      name: "mock",
      retries: 1,
      use: {
        // See preview project: disable animations via reduced-motion emulation.
        contextOptions: { reducedMotion: "reduce" },
        storageState: ".auth/user.json",
        baseURL: "http://localhost:3000",
        serviceWorkers: "block",
      },
      testIgnore: /service-worker\.spec\.ts$/,
    },
    {
      name: "sw",
      retries: 1,
      use: {
        // No storageState: the SW spec uses unauthenticated routes (/health)
        // since the .auth/user.json is scoped to localhost:3000.
        baseURL: `http://localhost:${SW_PORT}`,
        serviceWorkers: "allow",
      },
      testMatch: /service-worker\.spec\.ts$/,
    },
  ],
});

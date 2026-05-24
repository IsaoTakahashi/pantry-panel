import fs from "node:fs";
import path from "node:path";

import { defineConfig } from "@playwright/test";

const envFile = path.join(__dirname, ".env.e2e");
if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

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
    : {
        command: "npm run dev",
        port: 3000,
        reuseExistingServer: true,
      },
  projects: [
    {
      name: "preview",
      retries: 1,
      use: {
        storageState: ".auth/user.json",
        baseURL: process.env.PREVIEW_URL,
        extraHTTPHeaders: process.env.VERCEL_BYPASS_TOKEN
          ? { "x-vercel-protection-bypass": process.env.VERCEL_BYPASS_TOKEN }
          : undefined,
      },
    },
    {
      name: "mock",
      retries: 1,
      use: {
        storageState: ".auth/user.json",
        baseURL: "http://localhost:3000",
      },
    },
  ],
});

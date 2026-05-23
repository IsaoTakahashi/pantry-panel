import fs from "node:fs";
import path from "node:path";

import { defineConfig } from "@playwright/test";

const envFile = path.join(__dirname, ".env.e2e");
if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

export default defineConfig({
  testDir: "./e2e",
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
      use: {
        storageState: ".auth/user.json",
        baseURL: process.env.PREVIEW_URL,
      },
    },
    {
      name: "mock",
      use: {
        storageState: ".auth/user.json",
        baseURL: "http://localhost:3000",
      },
    },
  ],
});

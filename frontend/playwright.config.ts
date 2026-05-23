import { defineConfig } from "@playwright/test";

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
  use: {
    baseURL: process.env.PREVIEW_URL || "http://localhost:3000",
  },
  projects: [
    {
      name: "preview",
      use: { storageState: ".auth/user.json" },
    },
    {
      name: "mock",
      use: { storageState: ".auth/user.json" },
    },
  ],
});

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    channel: "msedge",
  },
  webServer: [
    {
      command: "node dist/src/main.js",
      cwd: "../backend",
      url: "http://127.0.0.1:3001",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npm run start -- -p 3000",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: 0,
  use: {
    baseURL: "http://localhost:3469",
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: "env PORT=3469 npx tsx src/server.ts",
    port: 3469,
    reuseExistingServer: false,
    timeout: 15_000,
  },
});

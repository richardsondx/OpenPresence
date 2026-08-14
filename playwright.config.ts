import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "OPENPRESENCE_DB_PATH=data/playwright.db OPENPRESENCE_TEST_MODE=1 OPENPRESENCE_X_API_MOCK=1 OPENPRESENCE_AI_MOCK=1 OPENPRESENCE_NEXT_DIST_DIR=.next-e2e pnpm exec next start -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});

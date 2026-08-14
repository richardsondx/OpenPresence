import { defineConfig, devices } from "@playwright/test";

const testPort = process.env.OPENPRESENCE_TEST_PORT ?? "3100";

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  use: {
    baseURL: `http://localhost:${testPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `OPENPRESENCE_DB_PATH=data/playwright.db OPENPRESENCE_TEST_MODE=1 OPENPRESENCE_X_API_MOCK=1 OPENPRESENCE_AI_MOCK=1 OPENPRESENCE_NEXT_DIST_DIR=.next-e2e pnpm exec next start -p ${testPort}`,
    url: `http://localhost:${testPort}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});

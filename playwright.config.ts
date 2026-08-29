import { defineConfig, devices } from "@playwright/test";

const testPort = process.env.OPENPRESENCE_TEST_PORT ?? "3100";
const testDbPath = process.env.OPENPRESENCE_E2E_DB_PATH ?? "data/playwright.db";

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  use: {
    baseURL: `http://localhost:${testPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `OPENPRESENCE_DB_PATH=${testDbPath} OPENPRESENCE_TEST_MODE=1 OPENPRESENCE_X_API_MOCK=1 OPENPRESENCE_AI_MOCK=1 OPENPRESENCE_PORT=${testPort} pnpm dev`,
    url: `http://localhost:${testPort}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});

import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "../tests/e2e", workers: 1,
  outputDir: "/tmp/openpresence-today-evidence",
  use: { baseURL: "http://127.0.0.1:3529", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }, { name: "mobile", use: devices["Pixel 5"] }],
});

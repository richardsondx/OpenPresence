import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    fileParallelism: false,
    include: process.env.OPENPRESENCE_V2_EVAL === "1" ? ["evals/v2/runner.test.ts"] : ["evals/agent-prompts/runner.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 21_600_000,
    hookTimeout: 30_000,
  },
});

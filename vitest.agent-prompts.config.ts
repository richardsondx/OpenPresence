import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["evals/agent-prompts/runner.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 21_600_000,
    hookTimeout: 30_000,
  },
});

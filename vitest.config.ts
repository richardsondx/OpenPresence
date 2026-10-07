import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  // Next preserves JSX for its compiler; Vite's test transform must lower it.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    // Persistence tests start two independent Vitest processes in sequence.
    testTimeout: 15_000,
  },
});

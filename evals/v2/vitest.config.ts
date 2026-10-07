import { defineConfig } from "vitest/config";
import path from "node:path";

// A corpus-only configuration for the existing Vitest control plane.
// Do not merge array-valued include fields: Vitest concatenates them.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "../..") } },
  test: { environment: "node", fileParallelism: false, include: ["evals/v2/*.test.ts"] },
});

import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/d1-http-budgets.acceptance.mjs"],
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 30000,
  },
});

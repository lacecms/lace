import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/operations.acceptance.mjs", "apps/builder/src/runner.test.mjs"],
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 30000,
    testTimeout: 180000,
  },
});

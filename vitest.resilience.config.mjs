import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/storage-resilience.acceptance.mjs", "tests/provider-recovery.acceptance.mjs"],
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 30000,
  },
});

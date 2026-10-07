import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/cross-runtime-product.acceptance.mjs"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 360000,
    hookTimeout: 30000,
  },
});

import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/security-static.acceptance.mjs"],
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 30000,
  },
});

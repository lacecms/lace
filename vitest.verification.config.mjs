import { defineConfig } from "vitest/config";
import { sourceCondition } from "./vitest.shared.mjs";

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [sourceCondition()],
        test: {
          name: "preview-https",
          include: ["tests/preview-https.acceptance.mjs"],
          testTimeout: 60000,
        },
      },
      {
        test: {
          name: "cross-runtime",
          include: [
            "tests/cross-runtime-product.acceptance.mjs",
            "tests/video-embed.acceptance.mjs",
            "tests/content-import.acceptance.mjs",
            "tests/conditional-fields.acceptance.mjs",
          ],
          fileParallelism: false,
          maxWorkers: 1,
          testTimeout: 360000,
          hookTimeout: 30000,
        },
      },
      {
        test: {
          name: "operations",
          include: ["tests/operations.acceptance.mjs"],
          fileParallelism: false,
          maxWorkers: 1,
          hookTimeout: 30000,
          testTimeout: 180000,
        },
      },
      {
        test: {
          name: "resilience",
          include: [
            "tests/storage-resilience.acceptance.mjs",
            "tests/provider-recovery.acceptance.mjs",
          ],
          fileParallelism: false,
          maxWorkers: 1,
          hookTimeout: 30000,
        },
      },
      {
        test: {
          name: "security-static",
          include: ["tests/security-static.acceptance.mjs"],
          fileParallelism: false,
          maxWorkers: 1,
          hookTimeout: 30000,
        },
      },
      {
        test: {
          name: "d1-budgets",
          include: ["tests/d1-http-budgets.acceptance.mjs"],
          fileParallelism: false,
          maxWorkers: 1,
          hookTimeout: 30000,
        },
      },
    ],
  },
});

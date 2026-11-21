import { defineConfig } from "vitest/config";
import { sourceCondition } from "./vitest.shared.mjs";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "preview-node-development",
          include: ["tests/preview-node-development.acceptance.mjs"],
          testTimeout: 420000,
        },
      },
      {
        test: {
          name: "preview-deployments",
          include: ["tests/preview-deployments.acceptance.mjs"],
          testTimeout: 420000,
          hookTimeout: 90000,
        },
      },
      {
        test: {
          name: "packed-draft-preview",
          include: ["tests/packed-draft-preview.acceptance.mjs"],
          testTimeout: 420000,
          hookTimeout: 90000,
        },
      },
      {
        test: {
          name: "preview-astro",
          include: ["tests/preview-astro.acceptance.mjs"],
        },
      },
      {
        plugins: [sourceCondition()],
        test: {
          name: "preview-https",
          include: ["tests/preview-https.acceptance.mjs"],
          testTimeout: 60000,
        },
      },
      {
        plugins: [sourceCondition()],
        test: {
          name: "preview-vps",
          include: ["tests/preview-vps.acceptance.mjs"],
          testTimeout: 240000,
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

import { sharedTestConfig } from "../../vitest.shared.mjs";

export default sharedTestConfig({
  test: {
    // Every case boots workerd through Miniflare. Running files one at a time
    // keeps that CPU load from starving other packages Turborepo tests in
    // parallel on shared CI runners, and the longer timeouts absorb a slow host.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});

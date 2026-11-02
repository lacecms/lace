import { sharedTestConfig } from "../../vitest.shared.mjs";

export default sharedTestConfig({
  test: {
    // The Worker bundle and smoke files each run Wrangler and workerd; running
    // files one at a time keeps that load from starving parallel package tests.
    fileParallelism: false,
  },
});

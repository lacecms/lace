import { createRequire } from "node:module";
import { join } from "node:path";

/** Loads the workspace's Playwright as an acceptance harness; consumers never depend on it. */
export function loadBrowser(workspace) {
  const require = createRequire(join(workspace, "apps/admin/package.json"));
  const { chromium } = require("@playwright/test");
  return chromium.launch({ headless: true });
}

/** Waits for an admin element and fails with the acceptance stage when it never appears. */
export async function visible(locator, stage) {
  try {
    await locator.waitFor({ state: "visible", timeout: 30_000 });
  } catch {
    throw new Error(`${stage}: expected admin element did not appear`);
  }
}

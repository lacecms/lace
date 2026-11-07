import { expect, test } from "vitest";

test("component subpaths resolve to source under the shared test config", async () => {
  expect(await import("@lacecms/astro/LaceBlocks.astro")).toBe(await import("./LaceBlocks.astro"));
  expect(await import("@lacecms/astro")).toBe(await import("./index.js"));
});

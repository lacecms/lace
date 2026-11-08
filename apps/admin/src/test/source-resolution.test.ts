import { expect, test } from "vitest";

test("workspace packages resolve to source in unit tests", async () => {
  const resolved = await import("@lacecms/contracts");
  const source = await import("../../../../packages/contracts/src/index.js");
  expect(resolved).toBe(source);
});

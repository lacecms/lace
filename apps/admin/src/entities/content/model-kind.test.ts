import { expect, test } from "vitest";
import { isSingletonModel } from "./model-kind.js";

test("pages and globals are singletons and collections are lists", () => {
  expect(isSingletonModel({ kind: "page" })).toBe(true);
  expect(isSingletonModel({ kind: "global" })).toBe(true);
  expect(isSingletonModel({ kind: "collection" })).toBe(false);
});

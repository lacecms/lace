import { expect, test } from "vitest";
import { hasPublicRoute, isRouteLessCollection, isSingletonModel } from "./model-kind.js";

test("pages and globals are singletons and collections are lists", () => {
  expect(isSingletonModel({ kind: "page" })).toBe(true);
  expect(isSingletonModel({ kind: "global" })).toBe(true);
  expect(isSingletonModel({ kind: "collection" })).toBe(false);
});

test("only pages and collections with a route have public routes", () => {
  expect(hasPublicRoute({ kind: "page" })).toBe(true);
  expect(hasPublicRoute({ kind: "collection", route: "/blog/:slug" })).toBe(true);
  expect(hasPublicRoute({ kind: "collection" })).toBe(false);
  expect(hasPublicRoute({ kind: "global" })).toBe(false);
  expect(isRouteLessCollection({ kind: "collection" })).toBe(true);
  expect(isRouteLessCollection({ kind: "collection", route: "/blog/:slug" })).toBe(false);
  expect(isRouteLessCollection({ kind: "global" })).toBe(false);
});

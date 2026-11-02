import { expect, test } from "vitest";

test("packaged entry point keeps its public exports", async () => {
  expect(Object.keys(await import("../dist/index.js")).sort()).toEqual([
    "ConfigurationError",
    "contentModelStructure",
    "defineCollection",
    "defineConfig",
    "defineGlobal",
    "definePage",
    "normalizeCollectionRoute",
    "normalizePagePath",
    "packageName",
    "resolveCollectionRoute",
  ]);
});

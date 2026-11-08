import { contentModelRoute } from "@lacecms/application";
import { defineCollection, defineConfig, definePage } from "@lacecms/config";
import { expect, test } from "vitest";
import { contentModelResolver } from "../index.js";

test("resolves configured runtime models to their routes and unknown keys to undefined", async () => {
  const config = await defineConfig({
    content: [
      definePage({ key: "home", path: "/", version: 1 }),
      defineCollection({ key: "posts", route: "/blog/:slug", version: 1 }),
    ],
  });
  const resolve = contentModelResolver(config);
  for (const model of config.runtime.content)
    expect(resolve(model.key)).toEqual(contentModelRoute(model));
  expect(resolve("missing")).toBeUndefined();
});

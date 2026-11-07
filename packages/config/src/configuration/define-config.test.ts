import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { canonicalizeJson } from "@lacecms/content";
import fixtureConfig from "../test-support/config.fixture.js";
import { defineConfig } from "../index.js";
import { blocks, postModel, homeModel } from "../test-support/model-fixtures.js";

test("expands both starter models to every built-in block at a new version", () => {
  const expectedBlocks = ["hero", "richText", "image", "quote", "cta"];
  expect(fixtureConfig.content).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ blocks: expectedBlocks, key: "home", version: 4 }),
      expect.objectContaining({ blocks: expectedBlocks, key: "posts", version: 4 }),
    ]),
  );
});

test("rejects model blocks missing from the root registry and separates projections", async () => {
  await expect(defineConfig({ blocks: [], content: [homeModel()] })).rejects.toThrow(
    /unregistered/u,
  );

  const config = await defineConfig({ blocks, content: [homeModel(), postModel()] });
  expect(config.public).toEqual({
    blocks: config.blocks,
    content: config.content,
    projectionHash: config.projectionHash,
    structureHash: config.structureHash,
  });
  expect(JSON.stringify(config.public)).not.toContain("validate");
  expect(config.runtime.blocks.get("hero")?.validate({ heading: "Lace" }, "publish")).toEqual({
    heading: "Lace",
  });
});

test("snapshots the architecture root fixture's canonical public projection", () => {
  const expected = JSON.parse(
    readFileSync(
      new URL("../test-support/config.projection.fixture.json", import.meta.url),
      "utf8",
    ),
  );
  expect(canonicalizeJson(JSON.parse(JSON.stringify(fixtureConfig.public)))).toBe(
    canonicalizeJson(expected),
  );
});

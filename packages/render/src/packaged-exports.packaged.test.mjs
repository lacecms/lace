import { expect, test } from "vitest";

test("packaged entry point keeps its public exports", async () => {
  expect(Object.keys(await import("../dist/index.js")).sort()).toEqual([
    "LaceRenderError",
    "createImageDescriber",
    "createLinkResolver",
    "defineBlockMap",
    "describeRichText",
    "describeVideoEmbed",
    "parseBlock",
    "parseBlockEnvelope",
    "prepareBlocks",
    "resolveBlock",
  ]);
});

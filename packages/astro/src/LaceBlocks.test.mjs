import { builtInBlocks, defineBlock, field } from "@lacecms/content";
import { defineBlockMap } from "@lacecms/render";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { expect, test } from "vitest";
import Blocks from "../test-fixtures/Blocks.astro";
import EnvelopeBlock from "../test-fixtures/EnvelopeBlock.astro";

const banner = defineBlock({
  fields: { message: field.text() },
  settings: { layout: field.select({ defaultValue: "wide", options: ["wide", "narrow"] }) },
  type: "banner",
  version: 1,
});
const blocks = defineBlockMap({
  banner: { component: EnvelopeBlock, definition: banner },
  quote: { component: EnvelopeBlock, definition: builtInBlocks.quote },
});

function entry(...entryBlocks) {
  return { blocks: entryBlocks, id: "entry-1", modelKey: "home" };
}

function block(key, overrides = {}) {
  return { data: {}, key, position: 0, schemaVersion: 1, type: "banner", ...overrides };
}

async function render(props) {
  const container = await AstroContainer.create();
  return container.renderToString(Blocks, { props });
}

test("block components receive the anchor, class name and settings without a wrapper", async () => {
  const html = await render({
    blocks,
    entry: entry(
      block("first", {
        anchor: "pricing",
        className: "wide  dark",
        settings: { layout: "narrow" },
      }),
      block("second"),
    ),
  });
  expect(html).toBe(
    '<main><section class="envelope wide dark" data-lace-block="banner" data-lace-block-key="first" data-layout="narrow" id="pricing">first</section><section class="envelope" data-lace-block="banner" data-lace-block-key="second" data-layout="wide">second</section></main>',
  );
});

test("a hidden block is not rendered", async () => {
  const html = await render({
    blocks,
    entry: entry(
      block("before"),
      block("hidden", { data: { quote: "Secret" }, hidden: true, type: "quote" }),
      block("after"),
    ),
  });
  expect(html).toContain('data-lace-block-key="before"');
  expect(html).toContain('data-lace-block-key="after"');
  expect(html).not.toContain("hidden");
  expect(html).not.toContain("Secret");
});

test("an invalid envelope fails rendering with invalid_block_envelope", async () => {
  await expect(
    render({ blocks, entry: entry(block("bad", { settings: { tone: "dark" } })) }),
  ).rejects.toMatchObject({
    code: "invalid_block_envelope",
    context: { blockKey: "bad", entryId: "entry-1", modelKey: "home" },
    fieldPath: ["settings", "tone"],
  });
});

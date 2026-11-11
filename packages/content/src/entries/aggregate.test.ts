// @ts-nocheck
// TODO(rf2): Type recursive descriptor fixtures, malformed runtime inputs and table tuples.
import { expect, test } from "vitest";
import {
  validateEntryAggregate,
  validateEntryPayload,
  MAX_TITLE_LENGTH,
  MAX_TOP_LEVEL_BLOCKS,
  MAX_JSON_BYTES,
} from "./aggregate.js";
import { defineBlockRegistry, toBlockRegistryMetadata } from "../blocks/registry.js";
import { BlockConfigurationError } from "../blocks/errors.js";
import { defineBlock } from "../blocks/definition.js";
import { settingsBlock, issueFrom } from "../test-support/content-test-helpers.js";
import { builtInBlocks } from "../blocks/built-ins.js";
import { ContentValidationError } from "../shared/errors.js";
import { field } from "../fields/builders.js";
import { MAX_SLUG_LENGTH } from "../shared/identifiers.js";
import { canonicalJsonByteLength } from "./canonical-json.js";
import { validateFieldValue, validateModelFields } from "../fields/validation.js";

function envelopeAggregate(blocks, mode = "draft") {
  return validateEntryAggregate(
    { blocks, fields: {}, kind: "page", title: "Home" },
    { blocks: ["panel", "hero"], fields: {}, kind: "page" },
    defineBlockRegistry([settingsBlock, builtInBlocks.hero]),
    mode,
  );
}

function panel(key, envelope = {}, data = { heading: "Hi" }) {
  return { data, key, schemaVersion: 1, type: "panel", ...envelope };
}

function issueOf(run) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ContentValidationError);
    const [issue] = error.issues;
    return { code: issue.code, path: issue.path.join("/") };
  }
  throw new Error("expected a validation error");
}

test("validates and normalizes the block envelope", () => {
  const [block] = envelopeAggregate([panel("b1")]).blocks;
  expect(block).toEqual({
    data: { heading: "Hi" },
    hidden: false,
    key: "b1",
    schemaVersion: 1,
    settings: { align: "left", boxed: false },
    type: "panel",
  });
  const [full] = envelopeAggregate([
    panel("b1", {
      anchor: "faq-2",
      className: "  hero--wide  md:w-1/2 hero--wide ",
      hidden: true,
      settings: { boxed: true },
    }),
  ]).blocks;
  expect(full).toMatchObject({
    anchor: "faq-2",
    className: "hero--wide md:w-1/2",
    hidden: true,
    settings: { align: "left", boxed: true },
  });
  expect(envelopeAggregate([panel("b1", { anchor: "pricing" })]).blocks[0].anchor).toBe("pricing");
  for (const anchor of ["Pricing", "2nd", "-top", "", "a".repeat(65), 7]) {
    expect(issueOf(() => envelopeAggregate([panel("b1", { anchor })]))).toEqual({
      code: "invalid_block_anchor",
      path: "blocks/0/anchor",
    });
  }
  expect(
    issueOf(() =>
      envelopeAggregate([
        panel("b1", { anchor: "faq" }),
        panel("b2", { anchor: "faq", hidden: true }),
      ]),
    ),
  ).toEqual({ code: "duplicate_block_anchor", path: "blocks/1/anchor" });
  for (const className of [
    "",
    "   ",
    'a"b',
    "a<b",
    "1col",
    Array.from({ length: 17 }, (_, index) => `c${index}`).join(" "),
    Array.from({ length: 5 }, (_, index) => `${"x".repeat(60)}${index}`).join(" "),
    "x".repeat(65),
    3,
  ]) {
    expect(issueOf(() => envelopeAggregate([panel("b1", { className })]))).toEqual({
      code: "invalid_block_class_name",
      path: "blocks/0/className",
    });
  }
  expect(issueOf(() => envelopeAggregate([panel("b1", { hidden: "yes" })]))).toEqual({
    code: "invalid_block_hidden",
    path: "blocks/0/hidden",
  });
  expect(issueOf(() => envelopeAggregate([panel("b1", { settings: [] })]))).toEqual({
    code: "invalid_block_settings",
    path: "blocks/0/settings",
  });
  expect(issueOf(() => envelopeAggregate([panel("b1", { settings: { width: 3 } })]))).toEqual({
    code: "unknown_field",
    path: "blocks/0/settings/width",
  });
  expect(
    issueOf(() => envelopeAggregate([panel("b1", { settings: { align: "right" } })])).path,
  ).toBe("blocks/0/settings/align");
  expect(
    issueOf(() =>
      envelopeAggregate([
        { data: {}, key: "h1", schemaVersion: 1, settings: { x: 1 }, type: "hero" },
      ]),
    ),
  ).toEqual({ code: "unknown_field", path: "blocks/0/settings/x" });
  expect(issueOf(() => envelopeAggregate([panel("b1", { visible: true })]))).toEqual({
    code: "unknown_key",
    path: "blocks/0/visible",
  });
});

test("validates hidden blocks in draft mode at publication", () => {
  const hidden = envelopeAggregate([panel("b1", { hidden: true }, {})], "publish");
  expect(hidden.blocks[0]).toMatchObject({ data: {}, hidden: true });
  expect(issueOf(() => envelopeAggregate([panel("b1", {}, {})], "publish"))).toEqual({
    code: "missing_required_field",
    path: "blocks/0/data/heading",
  });
});

test("registers public-DSL built-ins and validates ordered entry aggregates", () => {
  const registry = defineBlockRegistry(Object.values(builtInBlocks));
  expect(registry.get("hero")).toBe(builtInBlocks.hero);
  expect(toBlockRegistryMetadata(registry).map((block) => block.type)).toEqual([
    "cta",
    "gallery",
    "hero",
    "image",
    "link",
    "navigation",
    "quote",
    "richText",
    "videoEmbed",
  ]);
  expect(builtInBlocks.hero.fields.heading.required).toBe(true);
  expect(builtInBlocks.image.fields.media.required).toBe(true);
  expect(builtInBlocks.image.version).toBe(4);
  expect(builtInBlocks.image.fields.alt.required).toBe(false);
  expect(builtInBlocks.richText.fields.content.type).toBe("richText");
  expect(
    toBlockRegistryMetadata(registry).map(({ description, label, type }) => ({
      description,
      label,
      type,
    })),
  ).toEqual([
    {
      description: "A heading and a link that prompts the reader to act.",
      label: "Call to action",
      type: "cta",
    },
    {
      description: "A list of images and videos with selectable layouts and optional captions.",
      label: "Gallery",
      type: "gallery",
    },
    {
      description: "Large heading with optional text, image, and action.",
      label: "Hero",
      type: "hero",
    },
    {
      description:
        "A single image with an optional caption and alt text that overrides the media alt.",
      label: "Image",
      type: "image",
    },
    {
      description: "A link to a page or URL, presented as a button or text.",
      label: "Link",
      type: "link",
    },
    {
      description: "A list of links with optional one-level submenus.",
      label: "Navigation",
      type: "navigation",
    },
    { description: "A quotation with optional attribution.", label: "Quote", type: "quote" },
    {
      description: "Formatted text with headings, lists, and links.",
      label: "Rich text",
      type: "richText",
    },
    {
      type: "videoEmbed",
      label: "Video embed",
      description: "A YouTube or Vimeo video with an optional image preview.",
    },
  ]);
  expect(() => defineBlockRegistry([builtInBlocks.hero, builtInBlocks.hero])).toThrow(
    BlockConfigurationError,
  );

  const aggregate = validateEntryAggregate(
    {
      blocks: [{ data: { heading: "Welcome" }, key: "block-1", schemaVersion: 1, type: "hero" }],
      fields: { summary: "A page" },
      kind: "page",
      title: "Home",
    },
    { blocks: ["hero"], fields: { summary: field.text() }, kind: "page" },
    registry,
    "publish",
  );
  expect(aggregate.blocks[0]).toEqual({
    data: { heading: "Welcome" },
    hidden: false,
    key: "block-1",
    schemaVersion: 1,
    settings: {},
    type: "hero",
  });
  const ulidAggregate = validateEntryAggregate(
    {
      blocks: [
        {
          data: { heading: "Welcome" },
          key: "01M3BW3ZJNKNHQT9VD5SNGEFPV",
          schemaVersion: 1,
          type: "hero",
        },
      ],
      fields: {},
      kind: "page",
      title: "Home",
    },
    { blocks: ["hero"], fields: {}, kind: "page" },
    registry,
    "publish",
  );
  expect(ulidAggregate.blocks[0].key).toBe("01M3BW3ZJNKNHQT9VD5SNGEFPV");
  expect(() =>
    validateEntryAggregate(
      {
        blocks: [{ data: { heading: "No" }, key: "01INVALID", schemaVersion: 1, type: "hero" }],
        fields: {},
        kind: "page",
        title: "Home",
      },
      { blocks: ["hero"], fields: {}, kind: "page" },
      registry,
      "draft",
    ),
  ).toThrow(/\$\.blocks\[0\]\.key/u);
  expect(() =>
    validateEntryAggregate(
      {
        blocks: [
          { data: { heading: "One" }, key: "block-1", schemaVersion: 1, type: "hero" },
          { data: { heading: "Two" }, key: "block-1", schemaVersion: 1, type: "hero" },
        ],
        fields: {},
        kind: "page",
        title: "Home",
      },
      { blocks: ["hero"], fields: {}, kind: "page" },
      registry,
      "draft",
    ),
  ).toThrow(/\$\.blocks\[1\]\.key/u);
  expect(() =>
    validateEntryAggregate(
      {
        blocks: [{ data: { heading: "Welcome" }, key: "block-1", schemaVersion: 2, type: "hero" }],
        fields: {},
        kind: "page",
        title: "Home",
      },
      { blocks: ["hero"], fields: {}, kind: "page" },
      registry,
      "draft",
    ),
  ).toThrow(/\$\.blocks\[0\]\.schemaVersion/u);
});

test("enforces entry system-field and JSON payload limits", () => {
  const base = { blocks: [], fields: {}, kind: "collection", title: "Lace" };

  expect(validateEntryPayload(base, "draft")).toEqual(base);
  expect(() => validateEntryPayload(base, "publish")).toThrow(/\$\.slug/u);
  expect(validateEntryPayload({ ...base, slug: "lace" }, "publish")).toEqual({
    ...base,
    slug: "lace",
  });
  expect(() =>
    validateEntryPayload({ ...base, title: "x".repeat(MAX_TITLE_LENGTH + 1) }, "draft"),
  ).toThrow(/\$\.title/u);
  expect(() =>
    validateEntryPayload({ ...base, slug: "x".repeat(MAX_SLUG_LENGTH + 1) }, "draft"),
  ).toThrow(/\$\.slug/u);
  expect(() =>
    validateEntryPayload(
      { ...base, blocks: Array.from({ length: MAX_TOP_LEVEL_BLOCKS + 1 }, () => ({ data: {} })) },
      "draft",
    ),
  ).toThrow(/\$\.blocks/u);
  expect(canonicalJsonByteLength({ text: "é" })).toBe(13);
  expect(() =>
    validateEntryPayload({ ...base, fields: { text: "x".repeat(MAX_JSON_BYTES) } }, "draft"),
  ).toThrow(/\$\.fields/u);
});

test("accepts a global payload without a slug and rejects other kinds", () => {
  const global = { blocks: [], fields: {}, kind: "global", title: "Site settings" };
  expect(validateEntryPayload(global, "draft")).toEqual(global);
  expect(validateEntryPayload(global, "publish")).toEqual(global);
  for (const mode of ["draft", "publish"]) {
    expect(() => validateEntryPayload({ ...global, slug: "settings" }, mode)).toThrow(
      /\$\.slug.*not allowed/u,
    );
  }
  expect(() => validateEntryPayload({ ...global, kind: "singleton" }, "draft")).toThrow(
    /\$\.kind/u,
  );
});

test("route-less collection payloads publish without a slug and reject one", () => {
  const entry = { blocks: [], fields: {}, kind: "collection", routeLess: true, title: "Ada" };
  expect(validateEntryPayload(entry, "draft")).toEqual(entry);
  expect(validateEntryPayload(entry, "publish")).toEqual(entry);
  for (const mode of ["draft", "publish"]) {
    for (const slug of ["ada", ""]) {
      expect(issueFrom(() => validateEntryPayload({ ...entry, slug }, mode))).toMatchObject({
        code: "slug_not_allowed",
      });
    }
  }
  const aggregate = validateEntryAggregate(
    { blocks: [], fields: {}, kind: "collection", title: "Ada" },
    { blocks: [], fields: {}, kind: "collection", routeLess: true },
    defineBlockRegistry([]),
    "publish",
  );
  expect(aggregate).toMatchObject({ kind: "collection", title: "Ada" });
  expect(aggregate).not.toHaveProperty("slug");
  expect(() =>
    validateEntryAggregate(
      { blocks: [], fields: {}, kind: "collection", slug: "ada", title: "Ada" },
      { blocks: [], fields: {}, kind: "collection", routeLess: true },
      defineBlockRegistry([]),
      "draft",
    ),
  ).toThrow(/\$\.slug.*not allowed/u);
});

test("list and snapshot budgets include defaults, hidden blocks and nested lengths", () => {
  const scalarList = field.list({ item: field.text() });
  expect(validateFieldValue(scalarList, Array(100).fill("x"))).toHaveLength(100);
  expect(issueFrom(() => validateFieldValue(scalarList, Array(101).fill("x"))).code).toBe(
    "list_too_long",
  );
  expect(() =>
    validateFieldValue(
      field.list({ item: field.text(), maxItems: 2 }),
      ["a", "b", "c"],
      [],
      "draft",
    ),
  ).toThrow(ContentValidationError);
  const nested = field.list({ item: field.group({ fields: { links: scalarList } }) });
  expect(
    validateFieldValue(
      nested,
      Array.from({ length: 10 }, () => ({ links: Array(20).fill("x") })),
    ),
  ).toHaveLength(10);
  const block = defineBlock({
    type: "items",
    version: 1,
    fields: { list: scalarList, heading: field.text({ required: true }) },
  });
  const model = {
    kind: "page",
    fields: { one: scalarList, two: scalarList, three: scalarList, four: scalarList },
    blocks: ["items"],
  };
  const input = {
    kind: "page",
    title: "Budget",
    fields: Object.fromEntries(
      ["one", "two", "three", "four"].map((key) => [key, Array(100).fill("x")]),
    ),
    blocks: [
      {
        key: "hidden",
        type: "items",
        schemaVersion: 1,
        hidden: true,
        data: { list: Array(100).fill("x") },
      },
    ],
  };
  expect(
    validateEntryAggregate(input, model, defineBlockRegistry([block]), "publish").blocks[0].hidden,
  ).toBe(true);
  input.blocks.push({
    key: "overflow",
    type: "items",
    schemaVersion: 1,
    hidden: true,
    data: { list: ["x"] },
  });
  const issue = issueFrom(() =>
    validateEntryAggregate(input, model, defineBlockRegistry([block]), "publish"),
  );
  expect(issue.code).toBe("too_many_list_items");
  expect(issue.path).toEqual(["blocks", 1, "data", "list"]);
  const defaults = Object.fromEntries(
    Array.from({ length: 6 }, (_, i) => [
      "list" + i,
      field.list({ item: field.text(), defaultValue: Array(100).fill("x") }),
    ]),
  );
  expect(issueFrom(() => validateModelFields(defaults, {}, "draft")).code).toBe(
    "too_many_list_items",
  );
});

test("normalized block bytes include composite defaults", () => {
  const block = defineBlock({
    type: "large",
    version: 1,
    fields: {
      group: field.group({
        fields: { text: field.text({ defaultValue: "x".repeat(MAX_JSON_BYTES) }) },
        defaultValue: {},
      }),
    },
  });
  expect(() =>
    validateEntryAggregate(
      {
        kind: "page",
        title: "Bytes",
        fields: {},
        blocks: [{ key: "large", type: "large", schemaVersion: 1, data: {} }],
      },
      { kind: "page", fields: {}, blocks: ["large"] },
      defineBlockRegistry([block]),
      "draft",
    ),
  ).toThrow(/UTF-8/u);
});

import { describe, it, expect, test } from "vitest";
import {
  BlockConfigurationError,
  BlockMigrationError,
  ContentValidationError,
  FieldConfigurationError,
  MAX_JSON_BYTES,
  MAX_SLUG_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_TOP_LEVEL_BLOCKS,
  builtInBlocks,
  canonicalJsonByteLength,
  canonicalizeJson,
  compileFieldSchema,
  collectFieldMedia,
  detachFieldMedia,
  encodeFieldPath,
  decodeFieldPath,
  defineBlock,
  defineBlockRegistry,
  effectiveAltText,
  field,
  isSafeUrl,
  migrateBlockData,
  sha256CanonicalJson,
  toBlockMetadata,
  toBlockRegistryMetadata,
  validateBlockData,
  validateBlockSettings,
  validateEntryAggregate,
  toFieldMetadata,
  validateEntryPayload,
  validateFieldValue,
  validateModelFields,
  validateRichTextDocument,
  validateSnapshotListBudget,
} from "../dist/index.js";

const fieldCases = [
  ["text", () => field.text({ defaultValue: "Lace" }), "text"],
  ["textarea", () => field.textarea({ defaultValue: "Lace" }), "textarea"],
  ["richText", () => field.richText({ defaultValue: { content: [], type: "doc" } }), "richText"],
  ["number", () => field.number({ defaultValue: 1 }), "number"],
  ["boolean", () => field.boolean({ defaultValue: true }), "boolean"],
  ["date", () => field.date({ defaultValue: "2026-09-07" }), "date"],
  ["datetime", () => field.datetime({ defaultValue: "2026-09-07T00:00:00.000Z" }), "datetime"],
  ["select", () => field.select({ defaultValue: "news", options: ["news"] }), "select"],
  ["url", () => field.url({ defaultValue: "https://lacecms.dev" }), "url"],
  ["media", () => field.media({ defaultValue: "01K4M0D3LQYH8ND26GG2DDC8N2" }), "media"],
];

test.each(fieldCases)("builds a %s descriptor", (_name, build, type) => {
  const definition = build();

  expect(definition).toMatchObject({ required: false, type });
  expect(Object.isFrozen(definition)).toBe(true);
});

test("normalizes common and type-specific options", () => {
  const text = field.text({
    defaultValue: "lace",
    description: "Visible heading",
    label: "Heading",
    maxLength: 10,
    minLength: 3,
    required: true,
  });
  const number = field.number({ defaultValue: 4, max: 5, min: 1 });
  const select = field.select({
    defaultValue: "design",
    options: ["design", "engineering"],
  });

  expect(text).toEqual({
    defaultValue: "lace",
    description: "Visible heading",
    label: "Heading",
    maxLength: 10,
    minLength: 3,
    required: true,
    type: "text",
  });
  expect(number).toEqual({ defaultValue: 4, max: 5, min: 1, required: false, type: "number" });
  expect(select).toEqual({
    defaultValue: "design",
    options: ["design", "engineering"],
    required: false,
    type: "select",
  });
});

test("detaches and freezes caller-provided options and rich-text defaults", () => {
  const selectSource = {
    options: ["design", "engineering"],
  };
  const richTextSource = {
    defaultValue: {
      content: [{ content: [{ text: "before", type: "text" }], type: "paragraph" }],
      type: "doc",
    },
  };
  const definition = field.select(selectSource);
  const richText = field.richText(richTextSource);

  selectSource.options[0] = "changed";
  richTextSource.defaultValue.content[0].content[0].text = "after";

  expect(definition.options).toEqual(["design", "engineering"]);
  expect(richText.defaultValue).toEqual({
    content: [{ content: [{ text: "before", type: "text" }], type: "paragraph" }],
    type: "doc",
  });
  expect(Object.isFrozen(definition.options)).toBe(true);
  expect(Object.isFrozen(richText.defaultValue.content)).toBe(true);
});

test("projects detached serializable form metadata", () => {
  const definition = field.text({ defaultValue: "Lace", label: "Title", minLength: 1 });
  const metadata = toFieldMetadata(definition);
  const roundTrip = JSON.parse(JSON.stringify(metadata));

  expect(metadata).toEqual(definition);
  expect(metadata).not.toBe(definition);
  expect(roundTrip).toEqual({
    defaultValue: "Lace",
    label: "Title",
    minLength: 1,
    required: false,
    type: "text",
  });
  expect(JSON.stringify(metadata)).not.toContain("function");
});

const invalidConfigurations = [
  ["function", () => field.text({ label: /** @type {string} */ (() => "bad") })],
  ["symbol", () => field.text({ label: /** @type {string} */ (Symbol("bad")) })],
  ["bigint", () => field.number({ min: /** @type {number} */ (1n) })],
  ["non-finite number", () => field.number({ min: Number.NaN })],
  ["host object", () => field.date({ defaultValue: /** @type {string} */ (new Date()) })],
  ["unknown option", () => field.boolean({ unsupported: true })],
  ["malformed common option", () => field.url({ required: /** @type {boolean} */ ("yes") })],
  ["malformed numeric option", () => field.number({ min: /** @type {number} */ ("1") })],
  ["duplicate select choice", () => field.select({ options: ["news", "news"] })],
  ["empty select choices", () => field.select({ options: /** @type {[string]} */ ([]) })],
  ["non-string select choice", () => field.select({ options: /** @type {[string]} */ ([1]) })],
  ["contradictory string bounds", () => field.text({ maxLength: 1, minLength: 2 })],
  ["contradictory numeric bounds", () => field.number({ max: 1, min: 2 })],
  ["negative string bound", () => field.text({ minLength: -1 })],
  ["fractional string bound", () => field.text({ maxLength: 1.5 })],
  ["wrong boolean default", () => field.boolean({ defaultValue: /** @type {boolean} */ ("true") })],
  ["wrong date default", () => field.date({ defaultValue: /** @type {string} */ (1) })],
  ["wrong rich-text default", () => field.richText({ defaultValue: /** @type {object} */ ([]) })],
  [
    "malformed rich-text default",
    () =>
      field.richText({ defaultValue: { content: [{ text: "Lace", type: "text" }], type: "doc" } }),
  ],
  [
    "disallowed rich-text default node",
    () => field.richText({ defaultValue: { content: [{ type: "html" }], type: "doc" } }),
  ],
  [
    "unsafe rich-text default link",
    () =>
      field.richText({
        defaultValue: {
          content: [
            {
              content: [
                {
                  marks: [{ attrs: { href: "javascript:alert(1)" }, type: "link" }],
                  text: "Lace",
                  type: "text",
                },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        },
      }),
  ],
  ["too-short text default", () => field.text({ defaultValue: "x", minLength: 2 })],
  ["out-of-bounds number default", () => field.number({ defaultValue: 6, max: 5 })],
  ["unknown select default", () => field.select({ defaultValue: "other", options: ["news"] })],
];

test.each(invalidConfigurations)("rejects %s", (_name, build) => {
  expect(build).toThrow(FieldConfigurationError);
  expect(build).toThrow(/options/u);
});

test("reports cyclic and sparse values with their option path", () => {
  const cyclic = { defaultValue: { content: [], type: "doc" } };
  cyclic.defaultValue.self = cyclic;
  const sparse = ["news"];
  sparse[2] = "design";

  expect(() => field.richText(cyclic)).toThrow(/options\.defaultValue\.self/u);
  expect(() => field.select({ options: sparse })).toThrow(/options\.options\[1\]/u);
});

test("rejects symbols and accessors without executing them", () => {
  const symbolOptions = { [Symbol("field")]: "value" };
  const accessorOptions = {};
  Object.defineProperty(accessorOptions, "label", {
    enumerable: true,
    get() {
      throw new Error("must not execute");
    },
  });

  expect(() => field.text(symbolOptions)).toThrow(/symbol/u);
  expect(() => field.text(accessorOptions)).toThrow(/accessor/u);
});

test("compiles every field descriptor and validates semantic field values", () => {
  const validValues = [
    [field.text({ minLength: 2 }), "ok"],
    [field.textarea({ maxLength: 3 }), "ok"],
    [field.number({ min: 1, max: 2 }), 1],
    [field.boolean(), false],
    [field.date(), "2026-02-28"],
    [field.datetime(), "2026-09-07T00:00:00Z"],
    [field.select({ options: ["news", "pages"] }), "news"],
    [field.url(), "/about"],
    [field.media(), "01K4M0D3LQYH8ND26GG2DDC8N2"],
    [
      field.richText(),
      { content: [{ content: [{ text: "Lace", type: "text" }], type: "paragraph" }], type: "doc" },
    ],
  ];

  for (const [definition, value] of validValues) {
    expect(compileFieldSchema(definition).type).toBe("custom");
    expect(validateFieldValue(definition, value)).toEqual(value);
  }

  expect(() => validateFieldValue(field.date(), "2026-02-29", ["date"])).toThrow(/\$\.date/u);
  expect(() =>
    validateFieldValue(field.datetime(), "2026-09-07T00:00:00+01:00", ["datetime"]),
  ).toThrow(/\$\.datetime/u);
  expect(() => validateFieldValue(field.media(), "", ["media"])).toThrow(/\$\.media/u);
  expect(() => validateFieldValue(field.number({ max: 1 }), 2, ["number"])).toThrow(
    ContentValidationError,
  );
});

test("validates model fields in draft and publish modes", () => {
  const definitions = {
    body: field.text({ required: true }),
    section: field.select({ defaultValue: "news", options: ["news", "pages"] }),
  };

  expect(validateModelFields(definitions, {}, "draft")).toEqual({ section: "news" });
  expect(() => validateModelFields(definitions, {}, "publish")).toThrow(/\$\.body/u);
  expect(validateModelFields(definitions, { body: "Ready" }, "publish")).toEqual({
    body: "Ready",
    section: "news",
  });
  expect(() => validateModelFields(definitions, { extra: true }, "draft")).toThrow(/\$\.extra/u);
  expect(() => validateModelFields(definitions, { body: 1 }, "draft")).toThrow(/\$\.body/u);
});

test("defines detached versioned blocks with defaults and metadata", () => {
  const defaults = { eyebrow: "News" };
  const block = defineBlock({
    defaultValue: defaults,
    fields: {
      eyebrow: field.text(),
      heading: field.text({ required: true }),
    },
    label: "Hero",
    type: "hero",
    version: 1,
  });
  defaults.eyebrow = "Changed";

  expect(validateBlockData(block, { heading: "Lace" }, "publish")).toEqual({
    eyebrow: "News",
    heading: "Lace",
  });
  expect(block.validate({ heading: "Lace" }, "publish")).toEqual({
    eyebrow: "News",
    heading: "Lace",
  });
  expect(toBlockMetadata(block)).toEqual({
    defaultValue: { eyebrow: "News" },
    fields: {
      eyebrow: { required: false, type: "text" },
      heading: { required: true, type: "text" },
    },
    label: "Hero",
    type: "hero",
    version: 1,
  });
  expect(JSON.stringify(toBlockMetadata(block))).not.toContain("validate");
  expect(Object.isFrozen(block)).toBe(true);
  expect(Object.isFrozen(block.fields)).toBe(true);

  expect(() => defineBlock({ fields: {}, type: "bad_type", version: 1 })).toThrow(
    BlockConfigurationError,
  );
  expect(() => defineBlock({ fields: {}, type: "hero", version: 0 })).toThrow(
    BlockConfigurationError,
  );
  expect(() =>
    defineBlock({ defaultValue: { missing: true }, fields: {}, type: "hero", version: 1 }),
  ).toThrow(BlockConfigurationError);
});

function quoteV3(migrations) {
  return defineBlock({
    fields: { attribution: field.text(), text: field.text({ required: true }) },
    migrations,
    type: "quote",
    version: 3,
  });
}

test("defines runtime-only block migrations outside metadata", () => {
  const plain = defineBlock({
    fields: { attribution: field.text(), text: field.text({ required: true }) },
    type: "quote",
    version: 3,
  });
  const migrated = quoteV3({
    2: ({ data: { body, ...rest } }) => ({ data: { ...rest, quote: body } }),
    3: ({ data: { quote, ...rest }, settings }) => ({ data: { ...rest, text: quote }, settings }),
  });
  expect(toBlockMetadata(migrated)).toEqual(toBlockMetadata(plain));
  expect(Object.keys(migrated.migrations)).toEqual(["2", "3"]);
  expect(Object.isFrozen(migrated.migrations)).toBe(true);
  expect(JSON.stringify(toBlockMetadata(migrated))).not.toContain("migrations");
  expect(plain).not.toHaveProperty("migrations");

  const v1 = { data: { attribution: "Ada", body: "Hello" }, settings: { tone: "dark" } };
  expect(migrateBlockData(migrated, v1, 1)).toEqual({
    data: { attribution: "Ada", text: "Hello" },
    settings: { tone: "dark" },
  });
  expect(migrateBlockData(migrated, { data: { quote: "Hi" }, settings: {} }, 2)).toEqual({
    data: { text: "Hi" },
    settings: {},
  });
  expect(migrateBlockData(migrated, { data: { text: "Same" }, settings: {} }, 3)).toEqual({
    data: { text: "Same" },
    settings: {},
  });
  expect(v1).toEqual({ data: { attribution: "Ada", body: "Hello" }, settings: { tone: "dark" } });

  for (const [migrations, key] of [
    [{ 4: () => ({}) }, "migrations.4"],
    [{ 1: () => ({}), 2: () => ({}), 3: () => ({}) }, "migrations.1"],
    [{ 2: () => ({}) }, "current version 3"],
    [{ "02": () => ({}), 3: () => ({}) }, "migrations.02"],
    [{ 3: "nope" }, "migrations.3"],
  ]) {
    expect(() => quoteV3(migrations)).toThrow(BlockConfigurationError);
    expect(() => quoteV3(migrations)).toThrow(key);
  }
  expect(() =>
    defineBlock({
      fields: {},
      migrations: { 2: () => ({}), 4: () => ({}) },
      type: "gap",
      version: 4,
    }),
  ).toThrow("migrations.3 is missing");
  expect(() =>
    defineBlock({ fields: {}, migrations: { 2: () => ({}) }, type: "one", version: 1 }),
  ).toThrow(BlockConfigurationError);
});

test("fails block migration composition with stable codes", () => {
  const onlyThree = quoteV3({ 3: (block) => block });
  const stored = (data) => ({ data, settings: {} });
  const missing = (() => {
    try {
      migrateBlockData(onlyThree, stored({ text: "x" }), 1);
    } catch (error) {
      return error;
    }
  })();
  expect(missing).toBeInstanceOf(BlockMigrationError);
  expect(missing).toMatchObject({
    blockType: "quote",
    code: "missing_step",
    fromVersion: 1,
    toVersion: 3,
  });
  expect(() => migrateBlockData(onlyThree, stored({ text: "x" }), 4)).toThrow(
    expect.objectContaining({ code: "version_ahead" }),
  );
  const input = stored({ text: "x" });
  expect(() =>
    migrateBlockData(
      quoteV3({
        3: (block) => {
          block.data.text = "mutated";
          return block;
        },
      }),
      input,
      2,
    ),
  ).toThrow(expect.objectContaining({ code: "migration_failed", step: 3 }));
  expect(input).toEqual(stored({ text: "x" }));
  for (const result of [
    [],
    Promise.resolve({ data: {} }),
    { data: { fn: () => 1 } },
    { data: { n: Number.NaN } },
    null,
    { text: "x" },
    { data: [] },
    { data: {}, settings: [] },
    { data: {}, extra: true },
  ]) {
    expect(() => migrateBlockData(quoteV3({ 3: () => result }), stored({ text: "x" }), 2)).toThrow(
      expect.objectContaining({ code: "invalid_result", step: 3 }),
    );
  }
});

test("migrations carry, rename and keep block settings", () => {
  const renamed = quoteV3({
    3: ({ data, settings: { tone, ...rest } }) => ({ data, settings: { ...rest, theme: tone } }),
  });
  expect(migrateBlockData(renamed, { data: { text: "x" }, settings: { tone: "dark" } }, 2)).toEqual(
    { data: { text: "x" }, settings: { theme: "dark" } },
  );
  const dataOnly = quoteV3({ 3: ({ data }) => ({ data: { ...data, attribution: "Ada" } }) });
  expect(
    migrateBlockData(dataOnly, { data: { text: "x" }, settings: { align: "center" } }, 2),
  ).toEqual({ data: { attribution: "Ada", text: "x" }, settings: { align: "center" } });
});

const settingsBlock = defineBlock({
  fields: { heading: field.text({ required: true }) },
  settings: {
    align: field.select({ defaultValue: "left", options: ["left", "center"] }),
    boxed: field.boolean({ defaultValue: false }),
  },
  type: "panel",
  version: 1,
});

test("declares block settings with defaults in metadata only when present", () => {
  expect(toBlockMetadata(settingsBlock).settings).toEqual({
    align: { defaultValue: "left", options: ["left", "center"], required: false, type: "select" },
    boxed: { defaultValue: false, required: false, type: "boolean" },
  });
  const none = defineBlock({ fields: {}, settings: {}, type: "plain", version: 1 });
  expect(toBlockMetadata(none)).not.toHaveProperty("settings");
  expect(none).not.toHaveProperty("settings");
  expect(toBlockMetadata(none)).toEqual(
    toBlockMetadata(defineBlock({ fields: {}, type: "plain", version: 1 })),
  );
  for (const builtIn of Object.values(builtInBlocks)) {
    expect(toBlockMetadata(builtIn)).not.toHaveProperty("settings");
  }
  for (const [settings, message] of [
    [{ image: field.media({ defaultValue: "m" }) }, "settings.image must be a select"],
    [{ body: field.textarea({ defaultValue: "x" }) }, "settings.body must be a select"],
    [{ link: field.url({ defaultValue: "https://a.dev" }) }, "settings.link must be a select"],
    [{ on: field.date({ defaultValue: "2026-01-01" }) }, "settings.on must be a select"],
    [{ size: field.number() }, "settings.size must declare a defaultValue"],
    [
      { tone: field.text({ defaultValue: "x", renamedFrom: "theme" }) },
      "settings.tone must not declare renamedFrom",
    ],
    [{ "1bad": field.boolean({ defaultValue: true }) }, "settings.1bad must be a valid field key"],
    ["nope", "settings must be a plain object"],
  ]) {
    expect(() => defineBlock({ fields: {}, settings, type: "bad", version: 1 })).toThrow(message);
  }
  expect(validateBlockSettings(settingsBlock, { boxed: true })).toEqual({
    align: "left",
    boxed: true,
  });
});

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
    "navigation",
    "quote",
    "richText",
  ]);
  expect(builtInBlocks.hero.fields.heading.required).toBe(true);
  expect(builtInBlocks.image.fields.media.required).toBe(true);
  expect(builtInBlocks.image.version).toBe(2);
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
    { description: "A grid of images with optional captions.", label: "Gallery", type: "gallery" },
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

test("allows only the confirmed rich-text grammar and URL policy", () => {
  const document = {
    content: [
      {
        attrs: { level: 2 },
        content: [
          {
            marks: [
              { type: "bold" },
              { type: "code" },
              { type: "italic" },
              { type: "strike" },
              { attrs: { href: "https://lacecms.dev" }, type: "link" },
            ],
            text: "Heading",
            type: "text",
          },
        ],
        type: "heading",
      },
      {
        content: [{ content: [{ text: "Item", type: "text" }], type: "paragraph" }],
        type: "blockquote",
      },
      {
        content: [
          {
            content: [{ content: [{ text: "Item", type: "text" }], type: "paragraph" }],
            type: "listItem",
          },
        ],
        type: "bulletList",
      },
      {
        content: [
          {
            content: [{ content: [{ text: "Item", type: "text" }], type: "paragraph" }],
            type: "listItem",
          },
        ],
        type: "orderedList",
      },
      { content: [{ text: "Line", type: "text" }, { type: "hardBreak" }], type: "paragraph" },
    ],
    type: "doc",
  };

  expect(validateRichTextDocument(document)).toEqual(document);
  expect(isSafeUrl("https://lacecms.dev/a")).toBe(true);
  expect(isSafeUrl("mailto:hello@lacecms.dev")).toBe(true);
  expect(isSafeUrl("tel:+3906123456")).toBe(true);
  expect(isSafeUrl("/about")).toBe(true);
  expect(isSafeUrl("#features")).toBe(true);
  expect(isSafeUrl("//lacecms.dev")).toBe(false);
  expect(isSafeUrl("javascript:alert(1)")).toBe(false);
  expect(() => validateRichTextDocument({ content: [{ type: "html" }], type: "doc" })).toThrow(
    /\$\.content\[0\]\.type/u,
  );
  expect(() =>
    validateRichTextDocument({
      content: [{ attrs: { style: "color:red" }, text: "bad", type: "text" }],
      type: "doc",
    }),
  ).toThrow(/\$\.content\[0\]\.attrs/u);
  expect(() =>
    validateRichTextDocument({
      content: [
        {
          marks: [{ attrs: { href: "javascript:alert(1)" }, type: "link" }],
          text: "bad",
          type: "text",
        },
      ],
      type: "doc",
    }),
  ).toThrow(/href/u);
});

test("canonicalizes JSON and hashes canonical UTF-8 bytes with Web Crypto", async () => {
  const first = { z: [{ b: false, a: true }], a: 2 };
  const second = { a: 2, z: [{ a: true, b: false }] };

  expect(canonicalizeJson(first)).toBe('{"a":2,"z":[{"a":true,"b":false}]}');
  expect(canonicalizeJson(first)).toBe(canonicalizeJson(second));
  expect(canonicalizeJson([2, 1])).not.toBe(canonicalizeJson([1, 2]));
  expect(await sha256CanonicalJson({})).toBe(
    "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
  );
  expect(await sha256CanonicalJson(first)).toBe(await sha256CanonicalJson(second));
  expect(await sha256CanonicalJson(first, { subtle: globalThis.crypto.subtle })).toBe(
    await sha256CanonicalJson(first),
  );
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

test("keeps a valid renamedFrom hint on every field kind and rejects it in blocks", () => {
  const renamed = field.text({ maxLength: 20, renamedFrom: "headline" });
  expect(renamed).toEqual({
    maxLength: 20,
    renamedFrom: "headline",
    required: false,
    type: "text",
  });
  expect(validateFieldValue(renamed, "Hello")).toBe("Hello");
  expect(field.media({ renamedFrom: "cover" }).renamedFrom).toBe("cover");
  expect(field.select({ options: ["a"], renamedFrom: "kind" }).renamedFrom).toBe("kind");
  expect(field.number({ renamedFrom: "count2" }).renamedFrom).toBe("count2");

  for (const value of ["", "1abc", "has-hyphen", 3]) {
    expect(() => field.text({ renamedFrom: value })).toThrow(FieldConfigurationError);
  }
  expect(() =>
    defineBlock({
      fields: { title: field.text({ renamedFrom: "heading" }) },
      type: "hero",
      version: 1,
    }),
  ).toThrow(/fields\.title must not declare renamedFrom/u);
});

test("image version 2 makes alt text optional and migrates version 1 data unchanged", () => {
  expect(validateBlockData(builtInBlocks.image, { media: "media-1" }, "publish")).toEqual({
    media: "media-1",
  });
  expect(() => validateBlockData(builtInBlocks.image, { alt: "A lake" }, "publish")).toThrow(
    ContentValidationError,
  );
  const stored = { alt: "A lake", caption: "Morning", media: "media-1" };
  expect(migrateBlockData(builtInBlocks.image, { data: stored, settings: {} }, 1)).toEqual({
    data: stored,
    settings: {},
  });
  const metadata = toBlockRegistryMetadata(defineBlockRegistry([builtInBlocks.image]))[0];
  expect(metadata).toMatchObject({ type: "image", version: 2 });
  expect(metadata.fields.alt.required).toBe(false);
});

test("gallery collects image items that become publishable with one image", () => {
  const { gallery } = builtInBlocks;
  expect(gallery.version).toBe(1);
  expect(gallery.settings).toBeUndefined();
  expect(validateBlockData(gallery, {}, "draft")).toEqual({ images: [] });
  expect(issueFrom(() => validateBlockData(gallery, {}, "publish"))).toMatchObject({
    code: "list_too_short",
    path: ["images"],
  });
  const item = { media: "media-1" };
  expect(validateBlockData(gallery, { images: [item], title: "Studio" }, "publish")).toEqual({
    images: [item],
    title: "Studio",
  });
  expect(validateBlockData(gallery, { images: [{ caption: "Draft" }] }, "draft")).toEqual({
    images: [{ caption: "Draft" }],
  });
  expect(
    issueFrom(() => validateBlockData(gallery, { images: [{ caption: "Draft" }] }, "publish")),
  ).toMatchObject({ code: "missing_required_field", path: ["images", 0, "media"] });
  for (const mode of ["draft", "publish"])
    expect(
      issueFrom(() => validateBlockData(gallery, { images: Array(51).fill(item) }, mode)),
    ).toMatchObject({ code: "list_too_long", path: ["images"] });
  expect(
    issueFrom(() => validateBlockData(gallery, { images: [{ ...item, width: 3 }] }, "draft")),
  ).toMatchObject({ code: "unknown_field", path: ["images", 0, "width"] });
  const metadata = toBlockRegistryMetadata(defineBlockRegistry([gallery]))[0];
  expect(metadata.fields.images).toMatchObject({
    defaultValue: [],
    itemLabel: "caption",
    maxItems: 50,
    minItems: 1,
    type: "list",
  });
});

test("navigation allows one submenu level with safe URLs within the list budget", () => {
  const { navigation } = builtInBlocks;
  expect(navigation.version).toBe(1);
  expect(navigation.settings).toBeUndefined();
  expect(validateBlockData(navigation, {}, "draft")).toEqual({ links: [] });
  expect(issueFrom(() => validateBlockData(navigation, {}, "publish")).code).toBe("list_too_short");
  const docs = { children: [{ label: "Guide", url: "/guide" }], label: "Docs" };
  expect(validateBlockData(navigation, { links: [docs], name: "Main" }, "publish")).toEqual({
    links: [docs],
    name: "Main",
  });
  expect(
    issueFrom(() =>
      validateBlockData(
        navigation,
        { links: [{ children: [{ label: "Guide" }], label: "Docs" }] },
        "publish",
      ),
    ),
  ).toMatchObject({ code: "missing_required_field", path: ["links", 0, "children", 0, "url"] });
  expect(
    issueFrom(() =>
      validateBlockData(
        navigation,
        { links: [{ children: [{ label: "Bad", url: "javascript:alert(1)" }], label: "Docs" }] },
        "draft",
      ),
    ).path,
  ).toEqual(["links", 0, "children", 0, "url"]);
  const children = Array.from({ length: 20 }, (_, index) => ({
    label: `Child ${index}`,
    url: `/child-${index}`,
  }));
  const links = Array.from({ length: 20 }, (_, index) => ({ children, label: `Link ${index}` }));
  expect(validateBlockData(navigation, { links }, "publish").links).toHaveLength(20);
  const blocks = [{ data: { links }, fields: navigation.fields, path: ["blocks", 0, "data"] }];
  expect(() => validateSnapshotListBudget({}, {}, blocks)).not.toThrow();
  const crowded = links.map((link, index) =>
    index === 3 ? { ...link, children: [...children, { label: "Extra", url: "/extra" }] } : link,
  );
  expect(issueFrom(() => validateBlockData(navigation, { links: crowded }, "draft"))).toMatchObject(
    {
      code: "list_too_long",
      path: ["links", 3, "children"],
    },
  );
});

test("effective alt text prefers a non-blank usage alt, then the media alt", () => {
  expect(effectiveAltText("Team at work", "Office")).toBe("Team at work");
  expect(effectiveAltText("   ", "Office")).toBe("Office");
  expect(effectiveAltText(undefined, "Office")).toBe("Office");
  expect(effectiveAltText(undefined, null)).toBe("");
  expect(effectiveAltText("", " ")).toBe("");
});

function issueFrom(run) {
  try {
    run();
    throw new Error("expected validation failure");
  } catch (error) {
    expect(error).toBeInstanceOf(ContentValidationError);
    return error.issues[0];
  }
}

test("composite schema boundaries apply to builders and forged metadata", () => {
  const chain = (depth) => {
    let item = { type: "text", required: false };
    for (let index = depth - 1; index >= 0; index--)
      item =
        index % 2 === 0
          ? { type: "list", item, required: false }
          : { type: "group", fields: { child: item }, required: false };
    return item;
  };
  expect(toFieldMetadata(chain(6)).type).toBe("list");
  expect(() => toFieldMetadata(chain(7))).toThrow(/6 containers/u);
  const g = (child) => ({ type: "group", required: false, fields: { child } });
  expect(() => toFieldMetadata(g(g(field.text())))).not.toThrow();
  expect(() => toFieldMetadata(g(g(g(field.text()))))).toThrow(/2 consecutive/u);
  expect(() =>
    toFieldMetadata(g(g({ type: "list", item: g(g(field.text())), required: false }))),
  ).not.toThrow();
  expect(() => field.list({ item: { type: "list", item: field.text() } })).toThrow(/direct list/u);
  const cycle = { type: "group", fields: {}, required: false };
  cycle.fields.child = cycle;
  expect(() => toFieldMetadata(cycle)).toThrow(/cyclic/u);
  const shared = field.group({ fields: { title: field.text() } });
  expect(() => field.group({ fields: { one: shared, two: shared } })).not.toThrow();
  for (const options of [
    { minItems: 2, maxItems: 1 },
    { maxItems: 101 },
    { minItems: -1 },
    { maxItems: 1.5 },
  ])
    expect(() => field.list({ item: field.text(), ...options })).toThrow(FieldConfigurationError);
  for (const value of [null, { type: "other" }, { type: "text", bogus: true }])
    expect(() => field.group({ fields: { child: value } })).toThrow(FieldConfigurationError);
});

test("composite defaults are portable, detached and draft-compatible", () => {
  const source = { title: "before", items: ["one"] };
  const definition = field.group({
    fields: {
      title: field.text(),
      items: field.list({ item: field.text() }),
      required: field.text({ required: true }),
    },
    defaultValue: source,
  });
  source.title = "after";
  source.items.push("two");
  expect(definition.defaultValue).toEqual({ title: "before", items: ["one"] });
  expect(Object.isFrozen(definition.defaultValue.items)).toBe(true);
  expect(() =>
    field.group({ fields: { href: field.url() }, defaultValue: { href: "javascript:bad" } }),
  ).toThrow(FieldConfigurationError);
  expect(() => field.list({ item: field.number(), defaultValue: [NaN] })).toThrow(
    FieldConfigurationError,
  );
  const getter = Object.defineProperty({}, "title", {
    enumerable: true,
    get() {
      throw new Error("getter ran");
    },
  });
  expect(() => field.group({ fields: { title: field.text() }, defaultValue: getter })).toThrow(
    /accessor/u,
  );
  expect(() =>
    field.group({ fields: { title: field.text({ renamedFrom: "old" }) } }),
  ).not.toThrow();
  expect(() => field.list({ item: field.text({ renamedFrom: "old" }) })).toThrow(
    /list item descriptors/u,
  );
});

test("composite absence, explicit empties and publication minima", () => {
  const group = field.group({
    fields: {
      title: field.text({ required: true }),
      enabled: field.boolean({ defaultValue: false }),
    },
    defaultValue: { title: "default" },
  });
  const optional = field.group({
    fields: {
      title: field.text({ required: true }),
      enabled: field.boolean({ defaultValue: true }),
    },
  });
  expect(validateModelFields({ optional }, {}, "publish")).toEqual({});
  expect(validateModelFields({ group }, {}, "publish")).toEqual({
    group: { title: "default", enabled: false },
  });
  expect(validateModelFields({ group }, { group: {} }, "draft")).toEqual({
    group: { enabled: false },
  });
  expect(issueFrom(() => validateModelFields({ group }, { group: {} }, "publish")).path).toEqual([
    "group",
    "title",
  ]);
  const list = field.list({ item: field.text(), required: true });
  expect(validateModelFields({ list }, { list: [] }, "publish")).toEqual({ list: [] });
  expect(validateModelFields({ list }, {}, "draft")).toEqual({});
  expect(issueFrom(() => validateModelFields({ list }, {}, "publish")).code).toBe(
    "missing_required_field",
  );
  const minimum = field.list({ item: field.text(), minItems: 2, defaultValue: ["one"] });
  expect(validateModelFields({ minimum }, {}, "draft")).toEqual({ minimum: ["one"] });
  expect(issueFrom(() => validateModelFields({ minimum }, {}, "publish")).code).toBe(
    "list_too_short",
  );
  expect(validateModelFields({ group }, { group: {} }, "draft")).not.toHaveProperty("group.title");
});

test("composite exact leaf paths and malformed values", () => {
  const list = field.list({
    item: field.group({ fields: { image: field.media(), text: field.text() } }),
  });
  const base = ["blocks", 0, "data", "images"];
  expect(issueFrom(() => validateFieldValue(list, [{}, {}, { image: 42 }], base)).path).toEqual([
    ...base,
    2,
    "image",
  ]);
  expect(issueFrom(() => validateFieldValue(list, [{ extra: true }])).code).toBe("unknown_field");
  for (const value of [null, {}, [null], [undefined], Array(1)])
    expect(() => validateFieldValue(list, value, [], "draft")).toThrow(ContentValidationError);
  expect(() => validateFieldValue(field.group({ fields: {} }), null)).toThrow(
    ContentValidationError,
  );
  expect(() =>
    validateFieldValue(field.list({ item: field.text({ defaultValue: "fallback" }) }), [null]),
  ).toThrow(ContentValidationError);
  expect(
    validateFieldValue(
      field.list({
        item: field.group({ fields: { text: field.text({ defaultValue: "default" }) } }),
      }),
      [{}],
    ),
  ).toEqual([{ text: "default" }]);
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

test("media traversal distinguishes groups, list indices and legacy paths", () => {
  const fields = {
    cover: field.media(),
    contact: field.group({ fields: { photo: field.media() } }),
    images: field.list({
      item: field.group({ fields: { image: field.media(), caption: field.text() } }),
    }),
    media: field.list({ item: field.media() }),
  };
  const data = {
    cover: "a",
    contact: { photo: "b" },
    images: [{ image: "a", caption: "not-media" }, { image: "b" }],
    media: ["c"],
  };
  expect(
    collectFieldMedia(fields, data).map(({ mediaId, path }) => [mediaId, encodeFieldPath(path)]),
  ).toEqual([
    ["a", "cover"],
    ["b", "/contact/photo"],
    ["a", "/images/0/image"],
    ["b", "/images/1/image"],
    ["c", "/media/0"],
  ]);
  expect(decodeFieldPath("cover")).toEqual(["cover"]);
  expect(decodeFieldPath("/images/0/image")).toEqual(["images", 0, "image"]);
});

test("media detaching clears leaves, drops media list items and keeps other values", () => {
  const fields = {
    cover: field.media(),
    contact: field.group({ fields: { photo: field.media(), name: field.text() } }),
    images: field.list({
      item: field.group({ fields: { image: field.media(), caption: field.text() } }),
    }),
    media: field.list({ item: field.media() }),
    title: field.text(),
  };
  const data = Object.freeze({
    cover: "a",
    contact: { name: "Ada", photo: "a" },
    images: [{ image: "a", caption: "kept" }, { image: "b" }],
    media: ["a", "c", "a"],
    title: "a",
  });
  expect(detachFieldMedia(fields, data, "a")).toEqual({
    contact: { name: "Ada" },
    images: [{ caption: "kept" }, { image: "b" }],
    media: ["c"],
    title: "a",
  });
  expect(data.cover).toBe("a");
  expect(detachFieldMedia(fields, data, "missing")).toBe(data);
  const untouched = { contact: { photo: "b" }, images: [{ image: "b" }] };
  const result = detachFieldMedia(fields, { ...untouched, cover: "a" }, "a");
  expect(result).toEqual(untouched);
  expect(result.contact).toBe(untouched.contact);
  expect(result.images).toBe(untouched.images);
  expect(collectFieldMedia(fields, detachFieldMedia(fields, data, "a"))).not.toContainEqual(
    expect.objectContaining({ mediaId: "a" }),
  );
});

test("nested model hints remain portable while block hints are rejected", () => {
  const links = field.list({
    item: field.group({ fields: { title: field.text({ renamedFrom: "headline" }) } }),
  });
  expect(JSON.parse(JSON.stringify(links)).item.fields.title.renamedFrom).toBe("headline");
  expect(() => defineBlock({ type: "links", version: 1, fields: { links } })).toThrow(
    /renamedFrom/u,
  );
});

test("list itemLabel is portable presentation metadata with validated targets", () => {
  const item = field.group({
    fields: {
      title: field.text(),
      caption: field.textarea(),
      url: field.url(),
      kind: field.select({ options: ["a"] }),
      image: field.media(),
    },
  });
  for (const itemLabel of ["title", "caption", "url", "kind"]) {
    const list = field.list({ item, itemLabel });
    expect(toFieldMetadata(list).itemLabel).toBe(itemLabel);
    expect(JSON.parse(JSON.stringify(list)).itemLabel).toBe(itemLabel);
    expect(validateFieldValue(list, [{ title: "Hello" }], [], "draft")).toEqual([
      { title: "Hello" },
    ]);
  }
  for (const itemLabel of ["missing", "title.child", "image", 1, null])
    expect(() => field.list({ item, itemLabel })).toThrow(/itemLabel/);
  expect(() => field.list({ item: field.text(), itemLabel: "title" })).toThrow(/itemLabel/);
  expect(() => toFieldMetadata({ ...field.text(), itemLabel: "title" })).toThrow();
});

const plainCode = {
  content: [{ text: "\t  <script>&\nline two\n", type: "text" }],
  type: "codeBlock",
};
const expandedDocument = {
  content: [
    ...[1, 2, 3, 4].map((level) => ({ attrs: { level }, type: "heading" })),
    { type: "horizontalRule" },
    plainCode,
    { type: "codeBlock" },
    { content: [], type: "codeBlock" },
    { content: [plainCode, { type: "horizontalRule" }], type: "blockquote" },
    {
      content: [{ content: [plainCode, { type: "horizontalRule" }], type: "listItem" }],
      type: "bulletList",
    },
    ...[{}, { target: "_blank" }, { rel: "nofollow" }, { rel: "nofollow", target: "_blank" }].map(
      (attrs) => ({
        content: [
          {
            marks: [{ attrs: { href: "/safe", ...attrs }, type: "link" }],
            text: "Link",
            type: "text",
          },
        ],
        type: "paragraph",
      }),
    ),
  ],
  type: "doc",
};

test("expanded and existing rich text keeps its exact content and all four link choices", () => {
  expect(validateRichTextDocument(expandedDocument)).toBe(expandedDocument);
});

const unsupportedRichNodes = [
  { attrs: { level: 5 }, type: "heading" },
  { attrs: { language: null }, type: "codeBlock" },
  { attrs: { language: "js" }, ...plainCode },
  { content: [{ marks: [], text: "x", type: "text" }], type: "codeBlock" },
  { content: [{ marks: [{ type: "bold" }], text: "x", type: "text" }], type: "codeBlock" },
  { content: [{ type: "hardBreak" }], type: "codeBlock" },
  { content: [{ type: "paragraph" }], type: "codeBlock" },
  { content: null, type: "codeBlock" },
  { content: [], type: "horizontalRule" },
  { attrs: {}, type: "horizontalRule" },
  { content: [plainCode], type: "paragraph" },
  ...[
    { target: "_self" },
    { target: null },
    { target: "" },
    { rel: null },
    { rel: "" },
    { rel: "noopener" },
    { rel: "noreferrer" },
    { rel: "nofollow noopener" },
    { onclick: "alert(1)" },
    { href: "javascript:alert(1)", target: "_blank", rel: "nofollow" },
  ].map((attrs) => ({
    content: [
      { marks: [{ attrs: { href: "/safe", ...attrs }, type: "link" }], text: "Link", type: "text" },
    ],
    type: "paragraph",
  })),
];

test.each(unsupportedRichNodes)("rejects unsupported expanded rich-text input %#", (node) => {
  const document = { content: [node], type: "doc" };
  expect(() => validateRichTextDocument(document)).toThrow(ContentValidationError);
  expect(() => field.richText({ defaultValue: document })).toThrow(FieldConfigurationError);
});

test.each(["draft", "publish"])(
  "expanded nested defaults and block data share %s validation",
  (mode) => {
    const input = structuredClone(expandedDocument);
    const body = field.richText({ defaultValue: input, required: true });
    input.content.length = 0;
    expect(body.defaultValue).toEqual(expandedDocument);
    expect(Object.isFrozen(body.defaultValue.content)).toBe(true);
    const fields = { sections: field.list({ item: field.group({ fields: { body } }) }) };
    const values = { sections: [{}] };
    const expected = { sections: [{ body: expandedDocument }] };
    expect(validateModelFields(fields, values, mode)).toEqual(expected);
    const definition = defineBlock({ fields, type: "expanded", version: 1 });
    expect(validateBlockData(definition, values, mode)).toEqual(expected);
    const unsafe = { content: [unsupportedRichNodes[1]], type: "doc" };
    expect(
      issueFrom(() => validateModelFields(fields, { sections: [{ body: unsafe }] }, mode)).path,
    ).toEqual(["sections", 0, "body"]);
  },
);

test("rich-text nodes do not consume composite list budget and required semantics stay unchanged", () => {
  const document = { content: Array(501).fill(plainCode), type: "doc" };
  const fields = {
    sections: field.list({
      item: field.group({ fields: { body: field.richText({ required: true }) } }),
    }),
  };
  const values = { sections: [{ body: document }] };
  expect(() => validateSnapshotListBudget(fields, values, [])).not.toThrow();
  expect(validateModelFields(fields, { sections: [{}] }, "draft")).toEqual({ sections: [{}] });
  expect(() => validateModelFields(fields, { sections: [{}] }, "publish")).toThrow(
    ContentValidationError,
  );
  expect(() =>
    validateModelFields(fields, { sections: Array(101).fill({ body: document }) }, "draft"),
  ).toThrow(ContentValidationError);
});

test("CE9A placeholders are portable, exact, kind-specific and recursive", () => {
  for (const type of ["text", "textarea", "url", "number", "richText", "select"]) {
    const options = type === "select" ? { options: ["a"] } : {};
    for (const placeholder of ["Prompt <plain>", ""]) {
      const definition = field[type]({ ...options, placeholder });
      expect(toFieldMetadata(JSON.parse(JSON.stringify(definition))).placeholder).toBe(placeholder);
    }
    expect(field[type](options)).not.toHaveProperty("placeholder");
    for (const placeholder of [3, null, {}, () => "unsafe"]) {
      expect(() => field[type]({ ...options, placeholder })).toThrow();
      expect(() => toFieldMetadata({ type, required: false, ...options, placeholder })).toThrow();
    }
  }
  for (const type of ["boolean", "date", "datetime", "media", "group", "list"]) {
    const options =
      type === "group" ? { fields: {} } : type === "list" ? { item: field.text() } : {};
    expect(() => field[type]({ ...options, placeholder: "ignored?" })).toThrow(/placeholder/u);
    expect(() =>
      toFieldMetadata({ type, required: false, ...options, placeholder: "bad" }),
    ).toThrow(/placeholder/u);
  }
  const nested = field.list({
    item: field.group({
      fields: {
        title: field.text({ placeholder: "Title", required: true }),
        tags: field.list({ item: field.text({ placeholder: "Tag" }) }),
      },
    }),
  });
  expect(toFieldMetadata(nested).item.fields.tags.item.placeholder).toBe("Tag");
  const forged = JSON.parse(JSON.stringify(nested));
  forged.item.fields.title.placeholder = 3;
  expect(() => toFieldMetadata(forged)).toThrow(/item.fields.title/u);
  const accessor = {
    type: "text",
    required: false,
    get placeholder() {
      throw Error("executed");
    },
  };
  expect(() => toFieldMetadata(accessor)).toThrow(/data property/u);
});

test("CE9A shared counts retain ordinary UTF-16 and SEO trimmed code points", async () => {
  const { textLength, seoTextLength } = await import("../dist/index.js");
  for (const [text, raw, seo] of [
    ["", 0, 0],
    [" 😀 ", 4, 1],
    ["e\u0301", 2, 2],
  ]) {
    expect(textLength(text)).toBe(raw);
    expect(seoTextLength(text)).toBe(seo);
    expect(() =>
      validateFieldValue(field.text({ minLength: raw, maxLength: raw }), text),
    ).not.toThrow();
    if (raw > 0) expect(() => field.text({ maxLength: raw - 1, defaultValue: text })).toThrow();
  }
});

describe("visual form layout metadata", () => {
  const fields = { title: field.text(), body: field.textarea() };
  const layout = { mode: "tabs", groups: [{ key: "main", label: "Main", fields: ["body"] }] };
  it("retains detached recursive layouts without changing values", () => {
    const input = structuredClone(layout);
    const group = field.group({ fields, layout: input });
    input.groups[0].fields[0] = "title";
    expect(toFieldMetadata(group).layout).toEqual(layout);
    expect(field.list({ item: group }).item.layout).toEqual(layout);
    const block = defineBlock({
      type: "layoutTest",
      version: 1,
      fields,
      layout,
      settings: { size: field.number({ defaultValue: 1 }) },
      settingsLayout: {
        mode: "sections",
        groups: [{ key: "style", label: "Style", fields: ["size"] }],
      },
    });
    expect(toBlockMetadata(block).layout).toEqual(layout);
    expect(Object.isFrozen(group.layout.groups[0].fields)).toBe(true);
  });
  it.each([
    { mode: "other", groups: layout.groups },
    { mode: ["tabs"], groups: layout.groups },
    { mode: "tabs", groups: [] },
    { ...layout, extra: true },
    { mode: "tabs", groups: [{ key: "main", label: " ", fields: ["body"] }] },
    { mode: "tabs", groups: [{ key: "main", label: "Main", fields: [] }] },
    { mode: "tabs", groups: [{ key: "main", label: "Main", fields: ["profile.title"] }] },
    { mode: "tabs", groups: [{ key: "main", label: "Main", fields: ["body", "body"] }] },
    { mode: "tabs", groups: [...layout.groups, ...layout.groups] },
  ])("rejects invalid placement %j", (invalid) => {
    expect(() => field.group({ fields, layout: invalid })).toThrow();
  });
  it("rejects layout on scalar/list descriptors and cross-owner settings", () => {
    expect(() => field.text({ layout })).toThrow();
    expect(() => field.list({ item: field.text(), layout })).toThrow();
    expect(() =>
      defineBlock({ type: "layoutTest", version: 1, fields, settingsLayout: layout }),
    ).toThrow();
  });
});

test("CE9B layouts survive the maximum six-container branch", () => {
  const nested = (remaining) =>
    field.list({
      item: field.group({
        fields: { child: remaining === 1 ? field.text() : nested(remaining - 1) },
        layout: { mode: "tabs", groups: [{ key: "main", label: "Main", fields: ["child"] }] },
      }),
    });
  const root = toFieldMetadata(nested(3));
  expect(root.item.fields.child.item.fields.child.item.layout.groups[0].fields).toEqual(["child"]);
});

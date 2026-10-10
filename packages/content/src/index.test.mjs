import { expect, test } from "vitest";
import {
  BlockConfigurationError,
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
  defineBlock,
  defineBlockRegistry,
  field,
  isSafeUrl,
  sha256CanonicalJson,
  toBlockMetadata,
  toBlockRegistryMetadata,
  validateBlockData,
  validateEntryAggregate,
  toFieldMetadata,
  validateEntryPayload,
  validateFieldValue,
  validateModelFields,
  validateRichTextDocument,
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

test("registers public-DSL built-ins and validates ordered entry aggregates", () => {
  const registry = defineBlockRegistry(Object.values(builtInBlocks));
  expect(registry.get("hero")).toBe(builtInBlocks.hero);
  expect(toBlockRegistryMetadata(registry).map((block) => block.type)).toEqual([
    "cta",
    "hero",
    "image",
    "quote",
    "richText",
  ]);
  expect(builtInBlocks.hero.fields.heading.required).toBe(true);
  expect(builtInBlocks.image.fields.media.required).toBe(true);
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
      description: "Large heading with optional text, image, and action.",
      label: "Hero",
      type: "hero",
    },
    {
      description: "A single image with alt text and an optional caption.",
      label: "Image",
      type: "image",
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
    key: "block-1",
    schemaVersion: 1,
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

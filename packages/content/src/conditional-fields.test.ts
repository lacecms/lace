import type {
  ContentValidationMode,
  JsonValue,
  ListFieldDefinition,
  GroupFieldDefinition,
  BlockDefinition,
} from "./index.js";
import { describe, expect, it } from "vitest";
import {
  ContentValidationError,
  canonicalizeJson,
  collectSnapshotInternalLinks,
  declaresFieldVisibility,
  defineBlock,
  defineBlockRegistry,
  field,
  isFieldVisible,
  normalizeFieldDefinition,
  normalizeFieldVisibility,
  publishedBlockData,
  publishedFieldValues,
  toBlockMetadata,
  toFieldMetadata,
  validateBlockData,
  validateEntryAggregate,
  validateFieldValue,
  validateModelFields,
} from "./index.js";

const MEDIA = "01HZY7Z4J4R7Q8K6M5N3P2B1C0";

const itemFields = () => ({
  kind: field.select({ options: ["image", "video"], required: true, defaultValue: "image" }),
  media: field.media({ required: true }),
  videoUrl: field.url({ required: true, embedProviders: ["vimeo", "youtube"] }),
  caption: field.text({ maxLength: 20 }),
});
const itemRules = (): {
  media: { field: "kind"; values: ("image" | "video")[] };
  videoUrl: { field: "kind"; values: ("image" | "video")[] };
} => ({
  media: { field: "kind", values: ["image"] },
  videoUrl: { field: "kind", values: ["video"] },
});
const gallery = () =>
  field.list({ item: field.group({ fields: itemFields(), visibility: itemRules() }) });

function issue(run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (error instanceof ContentValidationError) return error.issues[0];
    throw error;
  }
  return undefined;
}

describe("conditional-field declaration", () => {
  it("normalizes, detaches, freezes and round trips group rules", () => {
    const rules = itemRules();
    const group = field.group({ fields: itemFields(), visibility: rules });
    rules.media.values.push("video");
    expect(group.visibility.media.values).toEqual(["image"]);
    expect(Object.isFrozen(group.visibility.media.values)).toBe(true);
    const metadata = toFieldMetadata(gallery());
    expect(normalizeFieldDefinition(JSON.parse(JSON.stringify(metadata)))).toEqual(metadata);
    expect(((metadata as ListFieldDefinition).item as GroupFieldDefinition).visibility).toEqual(
      itemRules(),
    );
  });

  it("keeps encodings unchanged without rules", () => {
    const plain = field.group({ fields: { title: field.text() } });
    expect(plain).not.toHaveProperty("visibility");
    expect(canonicalizeJson(toFieldMetadata(plain) as unknown as JsonValue)).toBe(
      '{"fields":{"title":{"required":false,"type":"text"}},"required":false,"type":"group"}',
    );
  });

  it("accepts optional and boolean controllers", () => {
    const fields = {
      layout: field.select({ options: ["grid", "flex"] }),
      columns: field.number(),
      hasCta: field.boolean(),
      ctaUrl: field.url(),
    };
    expect(
      normalizeFieldVisibility(
        {
          columns: { field: "layout", values: ["grid"] },
          ctaUrl: { field: "hasCta", values: [true] },
        },
        fields,
      ),
    ).toEqual({
      columns: { field: "layout", values: ["grid"] },
      ctaUrl: { field: "hasCta", values: [true] },
    });
  });

  it.each([
    [{ missing: { field: "kind", values: ["image"] } }, "visibility.missing"],
    [{ media: { field: "absent", values: ["image"] } }, "visibility.media.field"],
    [{ media: { field: "caption", values: ["x"] } }, "visibility.media.field"],
    [{ media: { field: "media", values: ["image"] } }, "visibility.media.field"],
    [{ media: { field: "kind", values: [] } }, "visibility.media.values"],
    [{ media: { field: "kind", values: ["image", "image"] } }, "visibility.media.values"],
    [{ media: { field: "kind", values: ["audio"] } }, "visibility.media.values"],
    [{ media: { field: "kind", values: [true] } }, "visibility.media.values"],
    [{ media: { field: "kind", values: ["image"], equals: "image" } }, "visibility.media"],
    [
      { media: { field: "kind", values: ["image"] }, kind: { field: "flag", values: [true] } },
      "visibility.media.field",
    ],
    [{ media: { field: "kind", values: [() => "image"] } }, "visibility"],
    ["rules", "visibility"],
  ])("rejects %j at %s", (visibility, path) => {
    const fields = { ...itemFields(), flag: field.boolean() };
    expect(() => normalizeFieldVisibility(visibility, fields)).toThrow(path);
    expect(() => field.group({ fields, visibility: visibility as never })).toThrow(path);
  });

  it("rejects booleans outside a boolean controller's values", () => {
    expect(() =>
      normalizeFieldVisibility(
        { text: { field: "flag", values: ["yes"] } },
        {
          flag: field.boolean(),
          text: field.text(),
        },
      ),
    ).toThrow("visibility.text.values");
  });

  it("rejects chains at the dependent rule", () => {
    const fields = {
      hasMedia: field.boolean(),
      kind: field.select({ options: ["image", "video"] }),
      videoUrl: field.url(),
    };
    expect(() =>
      normalizeFieldVisibility(
        {
          kind: { field: "hasMedia", values: [true] },
          videoUrl: { field: "kind", values: ["video"] },
        },
        fields,
      ),
    ).toThrow(/visibility\.videoUrl\.field.*unconditional/);
  });

  it("rejects rules on scalar and list descriptors", () => {
    expect(() => field.text({ visibility: {} } as never)).toThrow();
    expect(() => field.list({ item: field.text(), visibility: {} })).toThrow(/visibility/);
    expect(() =>
      normalizeFieldDefinition({ type: "list", item: { type: "text" }, visibility: {} }),
    ).toThrow(/visibility/);
  });

  it("supports rules at the deepest list-item group", () => {
    const leaf = field.group({ fields: itemFields(), visibility: itemRules() });
    // list > group > list > group > list > group: six containers.
    const deep = field.list({
      item: field.group({
        fields: {
          a: field.list({ item: field.group({ fields: { b: field.list({ item: leaf }) } }) }),
        },
      }),
    });
    const metadata = toFieldMetadata(deep);
    expect(normalizeFieldDefinition(JSON.parse(JSON.stringify(metadata)))).toEqual(metadata);
  });

  it("declares block data rules separately from settings rules", () => {
    const block = defineBlock({
      type: "cta",
      version: 1,
      fields: { hasCta: field.boolean(), ctaUrl: field.url({ required: true }) },
      visibility: { ctaUrl: { field: "hasCta", values: [true] } },
      settings: {
        mode: field.select({ options: ["a", "b"], required: true, defaultValue: "a" }),
        wrap: field.boolean({ required: true, defaultValue: true }),
      },
      settingsVisibility: { wrap: { setting: "mode", values: ["a"] } },
    });
    const metadata = toBlockMetadata(block);
    expect(metadata.visibility).toEqual({ ctaUrl: { field: "hasCta", values: [true] } });
    expect(toBlockMetadata(defineBlock(JSON.parse(JSON.stringify(metadata))))).toEqual(metadata);
    expect(() =>
      defineBlock({
        type: "bad",
        version: 1,
        fields: { url: field.url() },
        settings: { mode: field.select({ options: ["a"], required: true, defaultValue: "a" }) },
        visibility: { mode: { field: "url", values: ["a"] } } as never,
      }),
    ).toThrow("block.bad.visibility.mode");
    expect(
      toBlockMetadata(defineBlock({ type: "plain", version: 1, fields: {} })),
    ).not.toHaveProperty("visibility");
  });
});

describe("conditional-field evaluation", () => {
  const rules = {
    media: { field: "kind", values: ["image"] },
    columns: { field: "layout", values: ["grid"] },
  };
  it("uses the present value, then defaults, and hides on an absent controller", () => {
    expect(isFieldVisible(rules, "media", { kind: "image" })).toBe(true);
    expect(isFieldVisible(rules, "media", { kind: "video" })).toBe(false);
    expect(isFieldVisible(rules, "columns", {})).toBe(false);
    expect(isFieldVisible(rules, "caption", {})).toBe(true);
    expect(isFieldVisible(undefined, "caption", {})).toBe(true);
    expect(isFieldVisible({ cta: { field: "on", values: [false] } }, "cta", { on: false })).toBe(
      true,
    );
  });

  it("materializes a controller default before evaluating targets", () => {
    const values = validateModelFields(itemFields(), { media: MEDIA }, "publish", [], itemRules());
    expect(values).toEqual({ kind: "image", media: MEDIA });
  });
});

describe("conditional-field validation", () => {
  const list = gallery();
  const validate = (value: unknown, mode: ContentValidationMode) =>
    validateFieldValue(list, value, ["fields", "gallery"], mode);

  it("does not require a hidden required field at publication", () => {
    expect(validate([{ kind: "image", media: MEDIA }], "publish")).toEqual([
      { kind: "image", media: MEDIA },
    ]);
  });

  it("still requires a visible required field", () => {
    expect(issue(() => validate([{ kind: "video" }], "publish"))).toMatchObject({
      code: "missing_required_field",
      path: ["fields", "gallery", 0, "videoUrl"],
    });
    expect(validate([{ kind: "video" }], "draft")).toEqual([{ kind: "video" }]);
  });

  it("keeps draft constraints on hidden values", () => {
    const long = { kind: "image", media: MEDIA, videoUrl: "javascript:alert(1)" };
    for (const mode of ["draft", "publish"] as const)
      expect(issue(() => validate([long], mode))).toMatchObject({
        code: "invalid_field_value",
        path: ["fields", "gallery", 0, "videoUrl"],
      });
    const fields = { on: field.boolean(), note: field.text({ maxLength: 3 }) };
    const visibility = { note: { field: "on", values: [true] } };
    expect(
      issue(() =>
        validateModelFields(fields, { note: "toolong" }, "publish", ["fields"], visibility),
      ),
    ).toMatchObject({ code: "invalid_field_value", path: ["fields", "note"] });
  });

  it("enforces minItems only while the list is visible", () => {
    const fields = {
      on: field.boolean({ required: true, defaultValue: false }),
      items: field.list({ item: field.text(), minItems: 2, required: true }),
    };
    const visibility = { items: { field: "on", values: [true] } };
    expect(validateModelFields(fields, { items: ["a"] }, "publish", [], visibility)).toEqual({
      on: false,
      items: ["a"],
    });
    expect(
      issue(() =>
        validateModelFields(fields, { on: true, items: ["a"] }, "publish", [], visibility),
      ),
    ).toMatchObject({ code: "list_too_short", path: ["items"] });
  });

  it("hides a whole subtree, including nested requirements", () => {
    const fields = {
      on: field.boolean(),
      details: field.group({ fields: { name: field.text({ required: true }) }, required: true }),
    };
    const visibility = { details: { field: "on", values: [true] } };
    expect(validateModelFields(fields, { details: {} }, "publish", [], visibility)).toEqual({
      details: {},
    });
  });

  it("rejects an invalid controller before evaluating targets", () => {
    expect(issue(() => validate([{ kind: "audio", videoUrl: "x" }], "draft"))).toMatchObject({
      code: "invalid_field_value",
      path: ["fields", "gallery", 0, "kind"],
    });
  });

  it("evaluates list items independently and keeps declaration order", () => {
    const value = [
      { caption: "a", videoUrl: "https://vimeo.com/1", kind: "video" },
      { media: MEDIA, kind: "image" },
    ];
    const output = validate(value, "publish");
    expect(output).toEqual(value);
    expect(Object.keys(output[0]!)).toEqual(["kind", "videoUrl", "caption"]);
  });

  it("applies block data rules and aggregate model rules", () => {
    const block = defineBlock({
      type: "cta",
      version: 1,
      fields: { hasCta: field.boolean(), ctaUrl: field.url({ required: true }) },
      visibility: { ctaUrl: { field: "hasCta", values: [true] } },
    });
    expect(validateBlockData(block as unknown as BlockDefinition, {}, "publish")).toEqual({});
    expect(
      issue(() =>
        validateBlockData(block as unknown as BlockDefinition, { hasCta: true }, "publish", [
          "data",
        ]),
      ),
    ).toMatchObject({ code: "missing_required_field", path: ["data", "ctaUrl"] });
    const aggregate = validateEntryAggregate(
      {
        blocks: [{ key: "01HZY7Z4J4R7Q8K6M5N3P2B1C1", type: "cta", schemaVersion: 1, data: {} }],
        fields: { heroKind: "image" },
        kind: "page",
        slug: "home",
        title: "Home",
      },
      {
        blocks: ["cta"],
        fields: {
          heroKind: field.select({ options: ["image", "video"], required: true }),
          heroVideo: field.url({ required: true }),
        },
        kind: "page",
        visibility: { heroVideo: { field: "heroKind", values: ["video"] } },
      },
      defineBlockRegistry([block]),
      "publish",
    );
    expect(aggregate.fields).toEqual({ heroKind: "image" });
  });

  it("keeps validation unchanged without rules", () => {
    const fields = itemFields();
    expect(issue(() => validateModelFields(fields, { kind: "image" }, "publish"))).toMatchObject({
      code: "missing_required_field",
      path: ["media"],
    });
  });
});

describe("published projection", () => {
  it("removes only hidden targets and keeps list shape", () => {
    const values = {
      gallery: [
        { kind: "image", media: MEDIA, videoUrl: "https://vimeo.com/1", caption: "a" },
        { kind: "video", media: MEDIA, videoUrl: "https://vimeo.com/2" },
        { kind: "image" },
      ],
    };
    expect(publishedFieldValues({ gallery: gallery() }, values)).toEqual({
      gallery: [
        { kind: "image", media: MEDIA, caption: "a" },
        { kind: "video", videoUrl: "https://vimeo.com/2" },
        { kind: "image" },
      ],
    });
  });

  it("projects model-level and block data rules", () => {
    const fields = { on: field.boolean(), extra: field.text(), title: field.text() };
    expect(
      publishedFieldValues(
        fields,
        { on: false, extra: "x", title: "t" },
        {
          extra: { field: "on", values: [true] },
        },
      ),
    ).toEqual({ on: false, title: "t" });
    const block = defineBlock({
      type: "cta",
      version: 1,
      fields: { hasCta: field.boolean(), ctaUrl: field.url() },
      visibility: { ctaUrl: { field: "hasCta", values: [true] } },
    });
    expect(publishedBlockData(toBlockMetadata(block), { ctaUrl: "https://a.example" })).toEqual({});
  });
});

describe("declared rules", () => {
  it("finds rules at the owner, in nested groups and in list-item groups", () => {
    const plain = { title: field.text(), tags: field.list({ item: field.text() }) };
    expect(declaresFieldVisibility(plain)).toBe(false);
    expect(declaresFieldVisibility(plain, {})).toBe(false);
    expect(declaresFieldVisibility(itemFields(), itemRules())).toBe(true);
    expect(declaresFieldVisibility({ gallery: gallery() })).toBe(true);
    expect(
      declaresFieldVisibility({
        outer: field.group({
          fields: { inner: field.group({ fields: itemFields(), visibility: itemRules() }) },
        }),
      }),
    ).toBe(true);
    const block = defineBlock({
      type: "media",
      version: 1,
      fields: itemFields(),
      visibility: itemRules(),
    });
    expect(declaresFieldVisibility(block.fields, block.visibility)).toBe(true);
    expect(
      declaresFieldVisibility({ items: field.list({ item: field.group({ fields: plain }) }) }),
    ).toBe(false);
  });
});

describe("internal links inside hidden targets", () => {
  const linkFields = () => ({
    hasCta: field.boolean(),
    ctaUrl: field.url(),
    always: field.url(),
  });
  const linkRules = () => ({ ctaUrl: { field: "hasCta", values: [true] } });

  it("marks model-level, list-item and block-data links as not delivered when hidden", () => {
    const fields = {
      ...linkFields(),
      items: field.list({
        item: field.group({
          fields: {
            kind: field.select({ options: ["link", "text"], defaultValue: "text" }),
            url: field.url(),
          },
          visibility: { url: { field: "kind", values: ["link"] } },
        }),
      }),
    };
    const values = validateModelFields(
      fields,
      {
        hasCta: false,
        ctaUrl: "entry:a",
        always: "entry:b",
        items: [
          { kind: "text", url: "entry:c" },
          { kind: "link", url: "entry:d" },
        ],
      },
      "draft",
      [],
      linkRules(),
    );
    const references = collectSnapshotInternalLinks(
      fields,
      values,
      [
        {
          key: "cta",
          fields: linkFields(),
          data: { hasCta: false, ctaUrl: "entry:e", always: "entry:f" },
          visibility: linkRules(),
        },
        {
          key: "hidden",
          fields: linkFields(),
          data: { hasCta: true, ctaUrl: "entry:g" },
          hidden: true,
          visibility: linkRules(),
        },
      ],
      linkRules(),
    );
    expect(
      references.map(({ pointer, sourceKey, delivered }) => [sourceKey, pointer, delivered]),
    ).toEqual([
      ["$fields", "/ctaUrl", false],
      ["$fields", "/always", true],
      ["$fields", "/items/0/url", false],
      ["$fields", "/items/1/url", true],
      ["cta", "/ctaUrl", false],
      ["cta", "/always", true],
      ["hidden", "/ctaUrl", false],
    ]);
  });

  it("keeps the output of content without rules unchanged", () => {
    const fields = linkFields();
    const values = { hasCta: false, ctaUrl: "entry:a" };
    expect(collectSnapshotInternalLinks(fields, values, [])).toEqual([
      { sourceKey: "$fields", area: "fields", delivered: true, targetId: "a", pointer: "/ctaUrl" },
    ]);
    expect(
      collectSnapshotInternalLinks(fields, { ...values, hasCta: true }, [], linkRules()),
    ).toEqual([
      { sourceKey: "$fields", area: "fields", delivered: true, targetId: "a", pointer: "/ctaUrl" },
    ]);
  });
});

describe("public documentation example", () => {
  // Mirrors the `portfolio` block on apps/docs content-modeling/conditional-fields.md.
  const portfolio = () =>
    defineBlock({
      type: "portfolio",
      version: 1,
      label: "Portfolio",
      fields: {
        items: field.list({
          label: "Items",
          itemLabel: "caption",
          maxItems: 50,
          item: field.group({
            fields: {
              kind: field.select({
                label: "Kind",
                options: ["image", "video"],
                defaultValue: "image",
                required: true,
              }),
              media: field.media({ label: "Image", required: true }),
              alt: field.text({ label: "Alt text" }),
              videoUrl: field.url({
                label: "Video URL",
                required: true,
                embedProviders: ["youtube", "vimeo"],
              }),
              videoTitle: field.text({ label: "Video title", required: true }),
              caption: field.text({ label: "Caption" }),
            },
            visibility: {
              media: { field: "kind", values: ["image"] },
              alt: { field: "kind", values: ["image"] },
              videoUrl: { field: "kind", values: ["video"] },
              videoTitle: { field: "kind", values: ["video"] },
            },
          }),
        }),
      },
    });

  it("loads, publishes each kind and omits hidden values", () => {
    const block = portfolio();
    defineBlockRegistry([block]);
    expect(JSON.parse(JSON.stringify(toBlockMetadata(block)))).toEqual(toBlockMetadata(block));
    const data = validateBlockData(
      block,
      {
        items: [
          { media: MEDIA, videoUrl: "https://vimeo.com/1", caption: "Photo" },
          { kind: "video", videoUrl: "https://vimeo.com/2", videoTitle: "Clip", alt: "Stale" },
        ],
      },
      "published" as ContentValidationMode,
    );
    expect(publishedBlockData(block, data)).toEqual({
      items: [
        { kind: "image", media: MEDIA, caption: "Photo" },
        { kind: "video", videoUrl: "https://vimeo.com/2", videoTitle: "Clip" },
      ],
    });
  });
});

// @ts-nocheck
// TODO(rf2): Type recursive descriptor fixtures, malformed runtime inputs and table tuples.
import { test, expect, describe, it } from "vitest";
import { field, toFieldMetadata } from "./builders.js";
import { FieldConfigurationError } from "../shared/errors.js";
import { validateFieldValue } from "./validation.js";
import { defineBlock, toBlockMetadata } from "../blocks/definition.js";

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

describe("portable select cards", () => {
  const presentation = () => ({
    control: "cards",
    choices: [
      { value: "b", label: "Second" },
      {
        value: "a",
        label: "First",
        description: "A composition",
        diagram: { cells: [{ x: 0, y: 0, width: 6, height: 12 }] },
      },
    ],
  });
  const make = (hint = presentation()) => field.select({ options: ["a", "b"], presentation: hint });
  it("detaches, freezes and round trips through nested fields and settings", () => {
    const hint = presentation();
    const select = make(hint);
    hint.choices[1].diagram.cells[0].width = 12;
    expect(select.presentation.choices[1].diagram.cells[0].width).toBe(6);
    expect(Object.isFrozen(select.presentation.choices[1].diagram.cells[0])).toBe(true);
    for (const descriptor of [
      select,
      field.group({ fields: { pick: select } }),
      field.list({ item: select }),
      field.list({ item: field.group({ fields: { pick: select } }) }),
    ]) {
      expect(toFieldMetadata(JSON.parse(JSON.stringify(descriptor)))).toEqual(descriptor);
    }
    const custom = defineBlock({
      type: "cards",
      version: 1,
      fields: {},
      settings: {
        pick: field.select({
          options: ["a", "b"],
          defaultValue: "a",
          presentation: presentation(),
        }),
      },
    });
    expect(toBlockMetadata(custom).settings.pick.presentation).toEqual(presentation());
    expect(validateFieldValue(select, "a", "publish")).toBe("a");
    expect(() => validateFieldValue(select, { value: "a" }, "draft")).toThrow();
    expect(field.select({ options: ["a"] })).not.toHaveProperty("presentation");
  });
  it.each([
    (p) => p.choices.pop(),
    (p) => (p.choices[1].value = "b"),
    (p) => (p.choices[1].value = "unknown"),
    (p) => (p.choices[1].label = " "),
    (p) => (p.choices[1].label = "<b>First</b>"),
    (p) => (p.choices[1].diagram.cells[0].width = 13),
    (p) => (p.choices[1].diagram.cells[0].x = -1),
    (p) => (p.choices[1].diagram.cells[0].height = 0),
    (p) => (p.choices[1].diagram.cells[0].y = 0.5),
    (p) => p.choices[1].diagram.cells.push({ x: 1, y: 1, width: 1, height: 1 }),
    (p) => (p.choices[1].diagram.url = "https://example.com"),
    (p) => (p.choices[1].diagram.cells[0].color = "red"),
    (p) => (p.choices[1].diagram.cells = []),
    (p) =>
      (p.choices[1].diagram.cells = Array.from({ length: 17 }, () => ({
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      }))),
    (p) => (p.control = "html"),
  ])("rejects malformed presentation with a path", (mutate) => {
    const hint = presentation();
    mutate(hint);
    expect(() => make(hint)).toThrow(/presentation/);
  });
  it("rejects hints on other field kinds and nonportable values", () => {
    expect(() => field.boolean({ presentation: presentation() })).toThrow(/presentation/);
    const hint = presentation();
    hint.choices[0].label = () => "label";
    expect(() => make(hint)).toThrow(/presentation/);
  });
});

test("embed descriptor rejects invalid options and preserves ordinary URL metadata", () => {
  for (const embedProviders of [[], ["youtube", "youtube"], ["other"], "vimeo", null])
    expect(() => field.url({ embedProviders })).toThrow();
  expect(() => field.text({ embedProviders: ["youtube"] })).toThrow();
  expect(() =>
    field.url({
      embedProviders: ["vimeo"],
      defaultValue: "https://youtube.com/watch?v=dQw4w9WgXcQ",
    }),
  ).toThrow();
  expect(toFieldMetadata(field.url({ required: true }))).toEqual({ type: "url", required: true });
  expect(() => validateFieldValue(field.url(), "/work", [], "publish")).not.toThrow();
});

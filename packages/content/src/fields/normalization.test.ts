import { test, expect, describe, it } from "vitest";
import { field } from "./builders.js";
import { toFieldMetadata } from "./metadata.js";
import type { FieldDefinition, SelectPresentation } from "./definitions.js";
import { FieldConfigurationError } from "../shared/errors.js";
import { validateFieldValue } from "./validation.js";
import { defineBlock, toBlockMetadata } from "../blocks/definition.js";

// These tests intentionally pass forged descriptors and malformed options.
const forgedMetadata = (value: unknown) => toFieldMetadata(value as FieldDefinition);
const unsafeField = field as unknown as Record<
  keyof typeof field,
  (value: unknown) => FieldDefinition
>;

test("composite schema boundaries apply to builders and forged metadata", () => {
  const chain = (depth: number) => {
    let item: unknown = { type: "text", required: false };
    for (let index = depth - 1; index >= 0; index--)
      item =
        index % 2 === 0
          ? { type: "list", item, required: false }
          : { type: "group", fields: { child: item }, required: false };
    return item;
  };
  expect(forgedMetadata(chain(6)).type).toBe("list");
  expect(() => forgedMetadata(chain(7))).toThrow(/6 containers/u);
  const g = (child: unknown) => ({ type: "group", required: false, fields: { child } });
  expect(() => forgedMetadata(g(g(field.text())))).not.toThrow();
  expect(() => forgedMetadata(g(g(g(field.text()))))).toThrow(/2 consecutive/u);
  expect(() =>
    forgedMetadata(g(g({ type: "list", item: g(g(field.text())), required: false }))),
  ).not.toThrow();
  expect(() => unsafeField.list({ item: { type: "list", item: field.text() } })).toThrow(
    /direct list/u,
  );
  const cycle: { type: string; fields: Record<string, unknown>; required: boolean } = {
    type: "group",
    fields: {},
    required: false,
  };
  cycle.fields.child = cycle;
  expect(() => forgedMetadata(cycle)).toThrow(/cyclic/u);
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
    expect(() => unsafeField.group({ fields: { child: value } })).toThrow(FieldConfigurationError);
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
    expect(forgedMetadata(list)).toMatchObject({ itemLabel });
    expect(JSON.parse(JSON.stringify(list)).itemLabel).toBe(itemLabel);
    expect(validateFieldValue(list, [{ title: "Hello" }], [], "draft")).toEqual([
      { title: "Hello" },
    ]);
  }
  for (const itemLabel of ["missing", "title.child", "image", 1, null])
    expect(() => unsafeField.list({ item, itemLabel })).toThrow(/itemLabel/);
  expect(() => field.list({ item: field.text(), itemLabel: "title" })).toThrow(/itemLabel/);
  expect(() => forgedMetadata({ ...field.text(), itemLabel: "title" })).toThrow();
});

test("CE9A placeholders are portable, exact, kind-specific and recursive", () => {
  for (const type of ["text", "textarea", "url", "number", "richText", "select"]) {
    const options = type === "select" ? { options: ["a"] } : {};
    for (const placeholder of ["Prompt <plain>", ""]) {
      const definition = unsafeField[type as keyof typeof field]({ ...options, placeholder });
      expect(forgedMetadata(JSON.parse(JSON.stringify(definition)))).toMatchObject({ placeholder });
    }
    expect(unsafeField[type as keyof typeof field](options)).not.toHaveProperty("placeholder");
    for (const placeholder of [3, null, {}, () => "unsafe"]) {
      expect(() => unsafeField[type as keyof typeof field]({ ...options, placeholder })).toThrow();
      expect(() => forgedMetadata({ type, required: false, ...options, placeholder })).toThrow();
    }
  }
  for (const type of ["boolean", "date", "datetime", "media", "group", "list"]) {
    const options =
      type === "group" ? { fields: {} } : type === "list" ? { item: field.text() } : {};
    expect(() =>
      unsafeField[type as keyof typeof field]({ ...options, placeholder: "ignored?" }),
    ).toThrow(/placeholder/u);
    expect(() => forgedMetadata({ type, required: false, ...options, placeholder: "bad" })).toThrow(
      /placeholder/u,
    );
  }
  const nested = field.list({
    item: field.group({
      fields: {
        title: field.text({ placeholder: "Title", required: true }),
        tags: field.list({ item: field.text({ placeholder: "Tag" }) }),
      },
    }),
  });
  expect(forgedMetadata(nested)).toMatchObject({
    item: { fields: { tags: { item: { placeholder: "Tag" } } } },
  });
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
  expect(() => forgedMetadata(accessor)).toThrow(/data property/u);
});

describe("portable select cards", () => {
  type Cell = { x: number; y: number; width: number; height: number; color?: string };
  type Hint = {
    control: string;
    choices: [
      { value: string; label: string | (() => string) },
      {
        value: string;
        label: string;
        description: string;
        diagram: { cells: Cell[]; url?: string };
      },
    ];
  };
  const presentation = (): Hint => ({
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
  const make = (hint = presentation()) =>
    field.select({ options: ["a", "b"], presentation: hint as SelectPresentation });
  it("detaches, freezes and round trips through nested fields and settings", () => {
    const hint = presentation();
    const select = make(hint);
    hint.choices[1].diagram.cells[0]!.width = 12;
    expect(select.presentation.choices[1]!.diagram!.cells[0]!.width).toBe(6);
    expect(Object.isFrozen(select.presentation.choices[1]!.diagram!.cells[0]!)).toBe(true);
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
          presentation: presentation() as SelectPresentation,
        }),
      },
    });
    expect(toBlockMetadata(custom).settings?.pick).toMatchObject({ presentation: presentation() });
    expect(validateFieldValue(select, "a", [], "publish")).toBe("a");
    expect(() => validateFieldValue(select, { value: "a" }, [], "draft")).toThrow();
    expect(field.select({ options: ["a"] })).not.toHaveProperty("presentation");
  });
  const mutations: ((p: Hint) => unknown)[] = [
    (p) => p.choices.pop(),
    (p) => (p.choices[1].value = "b"),
    (p) => (p.choices[1].value = "unknown"),
    (p) => (p.choices[1].label = " "),
    (p) => (p.choices[1].label = "<b>First</b>"),
    (p) => (p.choices[1].diagram.cells[0]!.width = 13),
    (p) => (p.choices[1].diagram.cells[0]!.x = -1),
    (p) => (p.choices[1].diagram.cells[0]!.height = 0),
    (p) => (p.choices[1].diagram.cells[0]!.y = 0.5),
    (p) => p.choices[1].diagram.cells.push({ x: 1, y: 1, width: 1, height: 1 }),
    (p) => (p.choices[1].diagram.url = "https://example.com"),
    (p) => (p.choices[1].diagram.cells[0]!.color = "red"),
    (p) => (p.choices[1].diagram.cells = []),
    (p) =>
      (p.choices[1].diagram.cells = Array.from({ length: 17 }, () => ({
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      }))),
    (p) => (p.control = "html"),
  ];
  it.each(mutations)("rejects malformed presentation with a path", (mutate) => {
    const hint = presentation();
    mutate(hint);
    expect(() => make(hint)).toThrow(/presentation/);
  });
  it("rejects hints on other field kinds and nonportable values", () => {
    expect(() => unsafeField.boolean({ presentation: presentation() })).toThrow(/presentation/);
    const hint = presentation();
    hint.choices[0].label = () => "label";
    expect(() => make(hint)).toThrow(/presentation/);
  });
});

test("embed descriptor rejects invalid options and preserves ordinary URL metadata", () => {
  for (const embedProviders of [[], ["youtube", "youtube"], ["other"], "vimeo", null])
    expect(() => unsafeField.url({ embedProviders })).toThrow();
  expect(() => unsafeField.text({ embedProviders: ["youtube"] })).toThrow();
  expect(() =>
    field.url({
      embedProviders: ["vimeo"],
      defaultValue: "https://youtube.com/watch?v=dQw4w9WgXcQ",
    }),
  ).toThrow();
  expect(toFieldMetadata(field.url({ required: true }))).toEqual({ type: "url", required: true });
  expect(() => validateFieldValue(field.url(), "/work", [], "publish")).not.toThrow();
});

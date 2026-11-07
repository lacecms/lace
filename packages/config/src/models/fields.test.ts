import { at, present } from "../test-support/assertions.js";

import { expect, test } from "vitest";
import { defineBlock, field } from "@lacecms/content";

import { defineCollection, defineConfig, defineGlobal, definePage } from "../index.js";
import { blocks, homeModel } from "../test-support/model-fixtures.js";

test("composite metadata identity strips only descriptor display properties", async () => {
  const make = (label: string, defaultLabel = "value") =>
    defineConfig({
      blocks: [],
      content: [
        definePage({
          key: "nested",
          path: "/nested",
          version: 1,
          fields: {
            cards: field.list({
              item: field.group({
                fields: { label: field.text({ label }), description: field.text() },
                defaultValue: { label: defaultLabel, description: "content" },
              }),
            }),
          },
        }),
      ],
    });
  const first = await make("First");
  const display = await make("Second");
  const content = await make("First", "changed");
  expect(present(first.content[0]).structureHash).toBe(present(display.content[0]).structureHash);
  expect(present(first.content[0]).projectionHash).not.toBe(
    present(display.content[0]).projectionHash,
  );
  expect(present(first.content[0]).structureHash).not.toBe(
    present(content.content[0]).structureHash,
  );
  expect(
    at(present(first.runtime.content[0]).structure, "fields", "cards", "item", "fields"),
  ).toHaveProperty("label");
  expect(
    at(present(first.runtime.content[0]).structure, "fields", "cards", "item", "defaultValue"),
  ).toEqual({ label: "value", description: "content" });
  expect(JSON.parse(JSON.stringify(first.public.content[0])).fields.cards.item.type).toBe("group");
});

test("composites stay out of scalar-only config options and block settings", () => {
  const fields = {
    group: field.group({ fields: { child: field.text() } }),
    list: field.list({ item: field.text(), defaultValue: [] }),
  };
  // Deliberately pass non-scalar and unknown list fields to runtime validation.
  for (const listFields of [["group"], ["list"], ["group.child"]])
    expect(() =>
      defineCollection({
        key: "nested",
        version: 1,
        route: "/nested/:slug",
        fields,
        listFields: listFields as unknown as ("group" | "list")[],
      }),
    ).toThrow();
  expect(() =>
    definePage({
      key: "nested",
      version: 1,
      path: "/nested",
      fields,
      seo: { description: "group" },
    } as unknown as Parameters<typeof definePage>[0]),
  ).toThrow();
  expect(() =>
    defineGlobal({
      key: "nested",
      version: 1,
      fields,
      seoDefaults: { siteName: "list" },
    } as unknown as Parameters<typeof defineGlobal>[0]),
  ).toThrow();
  for (const definition of Object.values(fields))
    expect(() =>
      defineBlock({ type: "nested", version: 1, fields: {}, settings: { value: definition } }),
    ).toThrow(/select, boolean, number or text/u);
  expect(() =>
    definePage({
      key: "bad",
      path: "/bad",
      version: 1,
      fields: {
        group: { type: "group", fields: { child: { type: "wrong" } } },
      } as unknown as NonNullable<Parameters<typeof definePage>[0]["fields"]>,
    }),
  ).toThrow();
});

test("itemLabel changes only projection identity at every descriptor position", async () => {
  const make = async (itemLabel: string | undefined, data = "stored") => {
    const cards = field.list({
      ...(itemLabel === undefined ? {} : { itemLabel }),
      item: field.group({
        fields: { title: field.text(), caption: field.text(), itemLabel: field.text() },
        defaultValue: { itemLabel: data },
      }),
    });
    return defineConfig({
      blocks: [defineBlock({ type: "cards", version: 1, fields: { cards } })],
      content: [
        homeModel({ blocks: ["cards"], fields: { nested: field.group({ fields: { cards } }) } }),
      ],
    });
  };
  const before = await make(undefined),
    after = await make("title"),
    other = await make("caption");
  for (const config of [after, other]) {
    expect(config.structureHash).toBe(before.structureHash);
    expect(present(config.runtime.content[0]).structureHash).toBe(
      present(before.runtime.content[0]).structureHash,
    );
    expect(config.projectionHash).not.toBe(before.projectionHash);
  }
  expect(
    at(
      present(after.runtime.content[0]).structure,
      "fields",
      "nested",
      "fields",
      "cards",
      "item",
      "defaultValue",
      "itemLabel",
    ),
  ).toBe("stored");
  expect((await make("title", "changed")).structureHash).not.toBe(after.structureHash);
});

test("CE9A placeholders change projection only across scalar/composite and block settings", async () => {
  for (const composite of [false, true]) {
    const make = (placeholder: string | undefined, data = "stored") => {
      const prompt = placeholder === undefined ? {} : { placeholder };
      const fields = {
        placeholder: field.text({ ...prompt, defaultValue: data }),
        ...(composite
          ? {
              nested: field.list({
                item: field.group({
                  fields: {
                    title: field.text(prompt),
                    description: field.text(),
                    label: field.text(),
                    itemLabel: field.text(),
                  },
                  defaultValue: {
                    label: "label",
                    description: "description",
                    itemLabel: "itemLabel",
                  },
                }),
              }),
            }
          : {}),
      };
      return defineConfig({
        blocks: [
          defineBlock({
            type: "card",
            version: 1,
            fields,
            settings: { tone: field.text({ ...prompt, defaultValue: "normal", label: "Tone" }) },
          }),
        ],
        content: [homeModel({ blocks: ["card"], fields })],
      });
    };
    const before = await make(undefined);
    for (const value of ["Title", "", "Different"]) {
      const after = await make(value);
      expect(after.structureHash).toBe(before.structureHash);
      expect(present(after.runtime.content[0]).structureHash).toBe(
        present(before.runtime.content[0]).structureHash,
      );
      expect(after.projectionHash).not.toBe(before.projectionHash);
      expect(
        at(present(after.runtime.content[0]).structure, "fields", "placeholder", "defaultValue"),
      ).toBe("stored");
      expect((await make(value, "changed")).structureHash).not.toBe(after.structureHash);
    }
  }
});

test("CE9B layouts are projection-only at every owner and preserve content keys", async () => {
  const layout = {
    mode: "tabs",
    groups: [{ key: "main", label: "Main", fields: ["layout"] }],
  } as const;
  const make = (enabled: boolean, value = "stored") => {
    const fields = { layout: field.text({ defaultValue: value }) };
    const group = field.group({
      fields,
      ...(enabled ? { layout } : {}),
      defaultValue: { layout: value },
    });
    const block = defineBlock({
      type: "layoutBlock",
      version: 1,
      fields: { ...fields, nested: group },
      ...(enabled ? { layout, settingsLayout: layout } : {}),
      settings: { layout: field.text({ defaultValue: value }) },
    });
    return defineConfig({
      blocks: [block],
      content: [
        defineCollection({
          key: "forms",
          version: 1,
          route: "/forms/:slug",
          blocks: [block.type],
          fields: { ...fields, nested: group },
          ...(enabled ? { layout } : {}),
        }),
      ],
    });
  };
  const before = await make(false);
  const after = await make(true);
  expect(after.structureHash).toBe(before.structureHash);
  expect(after.projectionHash).not.toBe(before.projectionHash);
  expect(present(after.runtime.content[0]).structureHash).toBe(
    present(before.runtime.content[0]).structureHash,
  );
  expect(present(after.runtime.content[0]).structure).toEqual(
    present(before.runtime.content[0]).structure,
  );
  expect(present(after.runtime.content[0]).layout).toEqual(layout);
  expect((await make(true, "changed")).structureHash).not.toBe(after.structureHash);
  const scalar = async (enabled: boolean) =>
    defineConfig({
      blocks: [],
      content: [
        defineGlobal({
          key: "settings",
          version: 1,
          fields: { layout: field.text() },
          ...(enabled ? { layout } : {}),
        }),
      ],
    });
  expect((await scalar(true)).structureHash).toBe((await scalar(false)).structureHash);
  expect(() =>
    defineGlobal({
      key: "bad",
      version: 1,
      fields: { name: field.text() },
      layout,
    } as unknown as Parameters<typeof defineGlobal>[0]),
  ).toThrow();
});

test("select cards change projection only and preserve identically named content", async () => {
  const make = (
    label: string | undefined,
    data = "stored",
    options: [string, ...string[]] = ["a", "b"],
    defaultValue = "a",
  ) => {
    const select = field.select({
      options,
      defaultValue,
      ...(label
        ? {
            presentation: { control: "cards", choices: options.map((value) => ({ value, label })) },
          }
        : {}),
    });
    const fields = {
      nested: field.list({
        item: field.group({
          fields: {
            select,
            presentation: field.text(),
            choices: field.text(),
            diagram: field.text(),
          },
          defaultValue: { presentation: data, choices: "choices", diagram: "diagram" },
        }),
      }),
    };
    return defineConfig({
      blocks: [defineBlock({ type: "cards", version: 1, fields, settings: { select } })],
      content: [homeModel({ blocks: ["cards"], fields })],
    });
  };
  const before = await make(undefined);
  for (const label of ["First", "Second"]) {
    const after = await make(label);
    expect(after.structureHash).toBe(before.structureHash);
    expect(present(after.runtime.content[0]).structureHash).toBe(
      present(before.runtime.content[0]).structureHash,
    );
    expect(after.projectionHash).not.toBe(before.projectionHash);
    expect((await make(label, "changed")).structureHash).not.toBe(after.structureHash);
    expect((await make(label, "stored", ["a", "b", "c"])).structureHash).not.toBe(
      after.structureHash,
    );
    expect((await make(label, "stored", ["a", "b"], "b")).structureHash).not.toBe(
      after.structureHash,
    );
  }
});

test("block settings visibility is projection-only and preserves namesake content/defaults", async () => {
  const make = (
    values?: [string, ...string[]],
    data = "stored",
    options: [string, ...string[]] = ["a", "b"],
    defaultValue = "a",
  ) =>
    defineConfig({
      blocks: [
        defineBlock({
          type: "conditional",
          version: 1,
          fields: {
            nested: field.group({
              fields: {
                settingsVisibility: field.text(),
                setting: field.text(),
                values: field.text(),
              },
              defaultValue: { settingsVisibility: data, setting: "mode", values: "stored" },
            }),
          },
          settings: {
            mode: field.select({ options, required: true, defaultValue }),
            wrap: field.boolean({ defaultValue: true }),
          },
          ...(values ? { settingsVisibility: { wrap: { setting: "mode", values } } } : {}),
        }),
      ],
      content: [homeModel({ blocks: ["conditional"] })],
    });
  const before = await make();
  for (const values of [["a"], ["b"], ["a", "b"]] as [string, ...string[]][]) {
    const after = await make(values);
    expect(after.structureHash).toBe(before.structureHash);
    expect(present(after.runtime.content[0]).structureHash).toBe(
      present(before.runtime.content[0]).structureHash,
    );
    expect(after.projectionHash).not.toBe(before.projectionHash);
    expect((await make(values, "changed")).structureHash).not.toBe(after.structureHash);
    expect((await make(values, "stored", ["a", "b", "c"])).structureHash).not.toBe(
      after.structureHash,
    );
    expect((await make(values, "stored", ["a", "b"], "b")).structureHash).not.toBe(
      after.structureHash,
    );
  }
  expect(() =>
    definePage({
      key: "wrong",
      version: 1,
      path: "/wrong",
      settingsVisibility: {},
    } as unknown as Parameters<typeof definePage>[0]),
  ).toThrow(/settingsVisibility/);
});

test("model visibility is structural, normalized and typed against model fields", async () => {
  const hero = (overrides = {}) =>
    definePage({
      blocks: [],
      fields: {
        heroKind: field.select({ options: ["image", "video"], required: true }),
        heroVideo: field.url({ required: true }),
      },
      key: "home",
      path: "/",
      version: 1,
      ...overrides,
    });
  const rules = { heroVideo: { field: "heroKind", values: ["video"] } };
  const plain = await defineConfig({ blocks, content: [hero()] });
  const conditional = await defineConfig({ blocks, content: [hero({ visibility: rules })] });
  expect(present(conditional.content[0]).visibility).toEqual(rules);
  expect(present(conditional.runtime.content[0]).visibility).toEqual(rules);
  expect(plain.content[0]).not.toHaveProperty("visibility");
  expect(present(conditional.content[0]).structureHash).not.toBe(
    present(plain.content[0]).structureHash,
  );
  expect(present(conditional.content[0]).projectionHash).not.toBe(
    present(plain.content[0]).projectionHash,
  );
  expect(present(present(conditional.runtime.content[0]).structure).visibility).toEqual(rules);
  expect(() =>
    hero({ visibility: { heroVideo: { field: "heroKind", values: ["audio"] } } }),
  ).toThrow("model.home.visibility.heroVideo.values");
  expect(() => hero({ visibility: { missing: { field: "heroKind", values: ["video"] } } })).toThrow(
    "model.home.visibility.missing",
  );
});

test("block data visibility enters structure while settings visibility stays projection-only", async () => {
  const cta = (extra: object) =>
    defineBlock({
      type: "cta",
      version: 1,
      fields: { hasCta: field.boolean(), ctaUrl: field.url() },
      settings: {
        mode: field.select({ options: ["a", "b"], required: true, defaultValue: "a" }),
        wrap: field.boolean({ required: true, defaultValue: true }),
      },
      ...extra,
    });
  const page = definePage({ blocks: ["cta"], key: "home", path: "/", version: 1 });
  const base = await defineConfig({ blocks: [cta({})], content: [page] });
  const settings = await defineConfig({
    blocks: [cta({ settingsVisibility: { wrap: { setting: "mode", values: ["a"] } } })],
    content: [page],
  });
  const data = await defineConfig({
    blocks: [cta({ visibility: { ctaUrl: { field: "hasCta", values: [true] } } })],
    content: [page],
  });
  expect(present(settings.content[0]).structureHash).toBe(present(base.content[0]).structureHash);
  expect(present(data.content[0]).structureHash).not.toBe(present(base.content[0]).structureHash);
});

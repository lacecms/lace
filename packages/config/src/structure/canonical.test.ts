import type {
  BlockDefinition,
  BlockMigrations,
  BlockMigration,
  ModelFieldDefinitions,
} from "@lacecms/content";
import type { ContentModelDefinition } from "../index.js";
import { at, present } from "../test-support/assertions.js";

import { expect, test } from "vitest";
import { builtInBlocks, defineBlock, field } from "@lacecms/content";

import { ConfigurationError, defineCollection, defineConfig, definePage } from "../index.js";
import {
  blocks,
  postModel,
  homeModel,
  seoCollection,
  settingsGlobal,
} from "../test-support/model-fixtures.js";

test("produces stable per-model and whole-config hashes", async () => {
  const first = await defineConfig({ blocks, content: [postModel(), homeModel()] });
  const reorderedFields = defineCollection({
    blocks: ["richText", "image"],
    fields: {
      publishedAt: field.date({ required: true }),
      author: field.text(),
    },
    key: "posts",
    label: "Posts",
    route: "/blog/:slug",
    version: 1,
  });
  const second = await defineConfig({ blocks, content: [homeModel(), reorderedFields] });
  const displayChanged = await defineConfig({
    blocks,
    content: [
      definePage({
        blocks: ["hero"],
        fields: { heading: field.text({ label: "Title", required: true }) },
        key: "home",
        label: "Homepage",
        path: "/",
        version: 1,
      }),
      postModel(),
    ],
  });
  const structuralChanged = await defineConfig({
    blocks,
    content: [homeModel({ version: 2 }), postModel()],
  });
  const renamed = await defineConfig({
    blocks,
    content: [homeModel(), postModel({ renamedFrom: "articles" })],
  });

  expect(first.structureHash).toBe(second.structureHash);
  expect(first.projectionHash).toBe(second.projectionHash);
  expect(present(first.content[0]).key).toBe("home");
  expect(present(first.content[0]).structureHash).toBe(
    present(displayChanged.content[0]).structureHash,
  );
  expect(present(first.content[0]).projectionHash).not.toBe(
    present(displayChanged.content[0]).projectionHash,
  );
  expect(first.structureHash).not.toBe(structuralChanged.structureHash);
  expect(first.projectionHash).toBe(renamed.projectionHash);
  expect(first.structureHash).toBe(renamed.structureHash);
  expect(present(first.content[1]).projectionHash).toBe(present(renamed.content[1]).projectionHash);
  expect(present(first.content[1]).structureHash).toBe(present(renamed.content[1]).structureHash);
  expect(renamed.content[1]).not.toHaveProperty("renamedFrom");
  expect(renamed.public.content[1]).not.toHaveProperty("renamedFrom");
  expect(renamed.runtime.content[1]).toMatchObject({ renamedFrom: "articles" });
  expect(Object.isFrozen(first)).toBe(true);
  expect(Object.isFrozen(first.content)).toBe(true);
});

test("block labels and descriptions change only the projection hash", async () => {
  const redescribed = blocks.map((block) =>
    block.type === "hero"
      ? defineBlock({
          description: "A different description.",
          fields: block.fields,
          label: "Banner",
          type: block.type,
          version: block.version,
        })
      : block,
  );
  const original = await defineConfig({ blocks, content: [homeModel()] });
  const changed = await defineConfig({ blocks: redescribed, content: [homeModel()] });

  expect(original.blocks.find((block) => block.type === "hero")).toMatchObject({
    description: "Large heading with optional text, image, and action.",
    label: "Hero",
  });
  expect(changed.projectionHash).not.toBe(original.projectionHash);
  expect(changed.structureHash).toBe(original.structureHash);
  expect(present(changed.content[0]).projectionHash).not.toBe(
    present(original.content[0]).projectionHash,
  );
  expect(present(changed.content[0]).structureHash).toBe(
    present(original.content[0]).structureHash,
  );
});

test("carries block migrations at runtime without changing identity or projections", async () => {
  const hero = (migrations?: BlockMigrations) =>
    defineBlock({
      fields: builtInBlocks.hero.fields,
      ...(migrations === undefined ? {} : { migrations }),
      type: "hero",
      version: 2,
    });
  const migrate: BlockMigration = (data) => ({ ...data });
  const withBlocks = (definition: BlockDefinition) =>
    defineConfig({
      blocks: [...blocks.filter((block) => block.type !== "hero"), definition],
      content: [homeModel()],
    });
  const plain = await withBlocks(hero());
  const migrated = await withBlocks(hero({ 2: migrate }));

  expect(present(present(migrated.runtime.blocks.get("hero")).migrations)[2]).toBe(migrate);
  expect(migrated.structureHash).toBe(plain.structureHash);
  expect(migrated.projectionHash).toBe(plain.projectionHash);
  expect(present(migrated.content[0]).structureHash).toBe(present(plain.content[0]).structureHash);
  expect(present(migrated.runtime.content[0]).structure).toEqual(
    present(plain.runtime.content[0]).structure,
  );
  expect(JSON.stringify(migrated.blocks)).not.toContain("migrations");
});

test("keeps fields named like display metadata in the canonical structure", async () => {
  const described = (fields: ModelFieldDefinitions) =>
    defineConfig({
      blocks,
      // Built-in image settings carry labels, which give their models a legacy hash.
      content: [postModel({ blocks: ["richText"], fields: { title: field.text(), ...fields } })],
    });
  const plain = await described({});
  const withDescription = await described({ description: field.textarea({ label: "SEO" }) });
  const longerDescription = await described({
    description: field.textarea({ label: "SEO", maxLength: 160 }),
  });
  const runtime = present(withDescription.runtime.content[0]);

  expect(present(withDescription.content[0]).structureHash).not.toBe(
    present(plain.content[0]).structureHash,
  );
  expect(present(longerDescription.content[0]).structureHash).not.toBe(
    present(withDescription.content[0]).structureHash,
  );
  expect(at(runtime.structure, "fields", "description")).toEqual({
    required: false,
    type: "textarea",
  });
  expect(runtime.structure).not.toHaveProperty("label");
  expect(runtime.structure).not.toHaveProperty("listFields");
  expect(runtime).not.toHaveProperty("legacyStructureHash");
  expect(Object.isFrozen(at(runtime.structure, "fields", "description"))).toBe(true);

  const labelledBlock = defineBlock({
    fields: { label: field.text({ label: "Button label" }) },
    type: "button",
    version: 1,
  });
  const relabelledBlock = defineBlock({
    fields: { label: field.text({ label: "Button label", maxLength: 20 }) },
    type: "button",
    version: 1,
  });
  const withBlock = (block: BlockDefinition) =>
    defineConfig({ blocks: [block], content: [homeModel({ blocks: ["button"] })] });
  const first = await withBlock(labelledBlock);
  const second = await withBlock(relabelledBlock);
  expect(present(first.content[0]).structureHash).not.toBe(
    present(second.content[0]).structureHash,
  );
  expect(
    at(present(first.runtime.content[0]).structure, "blockDefinitions", 0, "fields", "label"),
  ).toEqual({
    required: false,
    type: "text",
  });
});

test("omits canonical structures from public projections", async () => {
  const config = await defineConfig({
    blocks,
    content: [postModel({ fields: { description: field.textarea() } }), homeModel()],
  });
  const serialized = JSON.stringify(config.public);

  for (const model of config.public.content) {
    expect(model).not.toHaveProperty("structure");
  }
  expect(serialized).not.toContain("blockDefinitions");
  expect(config.runtime.content.every((model) => typeof model.structure === "object")).toBe(true);
  expect(present(config.runtime.content[0]).structureHash).toBe(
    present(config.content[0]).structureHash,
  );
});

test("puts declared block settings in structural identity and omits empty ones", async () => {
  const hero = (settings?: Record<string, ReturnType<typeof field.select>>) =>
    defineBlock({
      fields: builtInBlocks.hero.fields,
      ...(settings === undefined ? {} : { settings }),
      type: "hero",
      version: 2,
    });
  const withBlocks = (definition: BlockDefinition) =>
    defineConfig({
      blocks: [...blocks.filter((block) => block.type !== "hero"), definition],
      content: [homeModel()],
    });
  const align = (defaultValue: string, options: [string, ...string[]] = ["left", "center"]) => ({
    align: field.select({ defaultValue, options }),
  });
  const plain = await withBlocks(hero());
  const empty = await withBlocks(hero({}));
  const left = await withBlocks(hero(align("left")));
  const center = await withBlocks(hero(align("center")));
  const wider = await withBlocks(hero(align("left", ["left", "center", "right"])));

  expect(present(empty.content[0]).structureHash).toBe(present(plain.content[0]).structureHash);
  expect(present(empty.content[0]).projectionHash).toBe(present(plain.content[0]).projectionHash);
  expect(empty.blocks.find((block) => block.type === "hero")).not.toHaveProperty("settings");
  expect(present(left.content[0]).structureHash).not.toBe(present(plain.content[0]).structureHash);
  expect(present(center.content[0]).structureHash).not.toBe(present(left.content[0]).structureHash);
  expect(present(wider.content[0]).structureHash).not.toBe(present(left.content[0]).structureHash);
  expect(
    at(present(left.runtime.content[0]).structure, "blockDefinitions", 0, "settings", "align"),
  ).toMatchObject({
    defaultValue: "left",
    type: "select",
  });
});

test("keeps field rename and removal hints out of identity and projections", async () => {
  const plain = await defineConfig({
    blocks,
    content: [postModel({ fields: { author: field.text(), title: field.text() } })],
  });
  const hinted = await defineConfig({
    blocks,
    content: [
      postModel({
        fields: { author: field.text(), title: field.text({ renamedFrom: "headline" }) },
        removedBlocks: ["retired-block", "quote"],
        removedFields: ["legacy"],
      }),
    ],
  });
  const plainModel = present(plain.runtime.content[0]);
  const hintedModel = present(hinted.runtime.content[0]);

  expect(hintedModel.structureHash).toBe(plainModel.structureHash);
  expect(hintedModel.projectionHash).toBe(plainModel.projectionHash);
  expect(hinted.structureHash).toBe(plain.structureHash);
  expect(hinted.projectionHash).toBe(plain.projectionHash);
  expect(hinted.public).toEqual(plain.public);
  expect(JSON.stringify(hinted.public)).not.toMatch(/renamed|removed/u);
  expect(hintedModel.structure).toEqual(plainModel.structure);
  expect(hintedModel.fields.title).toEqual({ required: false, type: "text" });
  expect(hintedModel.renamedFields).toEqual({ title: "headline" });
  expect(hintedModel.removedFields).toEqual(["legacy"]);
  expect(hintedModel.removedBlocks).toEqual(["quote", "retired-block"]);
  expect(Object.isFrozen(hintedModel.renamedFields)).toBe(true);
  expect(plainModel).not.toHaveProperty("renamedFields");
  expect(plainModel).not.toHaveProperty("removedFields");
});

test("rejects synchronization hints that contradict the model", () => {
  const cases = [
    [{ fields: { title: field.text({ renamedFrom: "title" }) } }, /renamed from its own key/u],
    [
      { fields: { author: field.text(), title: field.text({ renamedFrom: "author" }) } },
      /renamed from configured field "author"/u,
    ],
    [
      {
        fields: {
          title: field.text({ renamedFrom: "headline" }),
          name: field.text({ renamedFrom: "headline" }),
        },
      },
      /share renamedFrom "headline"/u,
    ],
    [{ fields: { title: field.text() }, removedFields: ["title"] }, /configured field "title"/u],
    [
      { fields: { title: field.text({ renamedFrom: "headline" }) }, removedFields: ["headline"] },
      /rename source "headline"/u,
    ],
    [{ removedFields: ["a", "a"] }, /duplicate key "a"/u],
    [{ removedFields: ["bad-key"] }, /removedFields must contain valid keys/u],
    [{ removedBlocks: ["image"] }, /allowed block type "image"/u],
    [{ removedBlocks: "quote" }, /removedBlocks must be an array/u],
  ];
  for (const [overrides, message] of cases) {
    expect(() => postModel(overrides)).toThrow(ConfigurationError);
    expect(() => postModel(overrides)).toThrow(message);
  }
  expect(() => postModel({ removedFields: ["title"] })).not.toThrow();
  expect(() => postModel({ fields: { title: field.text() } })).not.toThrow();
});

test("enabling SEO is structural while mappings and defaults are projection-only", async () => {
  const hashes = async (model: ContentModelDefinition) => {
    const config = await defineConfig({ content: [model] });
    return {
      projection: present(config.runtime.content[0]).projectionHash,
      structure: present(config.runtime.content[0]).structureHash,
    };
  };
  const plain = await hashes(seoCollection());
  const enabled = await hashes(seoCollection({ seo: true }));
  const mapped = await hashes(seoCollection({ seo: { description: "excerpt", image: "cover" } }));
  expect(enabled.structure).not.toBe(plain.structure);
  expect(mapped.structure).toBe(enabled.structure);
  expect(mapped.projection).not.toBe(enabled.projection);
  expect(await hashes(seoCollection({ removedSeo: true }))).toEqual(plain);

  const settings = await hashes(settingsGlobal());
  const withDefaults = await hashes(settingsGlobal({ seoDefaults: { siteName: "siteName" } }));
  expect(withDefaults.structure).toBe(settings.structure);
  expect(withDefaults.projection).not.toBe(settings.projection);

  const config = await defineConfig({ content: [seoCollection({ removedSeo: true })] });
  expect(config.public.content[0]).not.toHaveProperty("removedSeo");
  expect(present(config.runtime.content[0])).toMatchObject({ removedSeo: true });
  expect(present(config.runtime.content[0]).structure).not.toHaveProperty("seo");
  const enabledConfig = await defineConfig({
    content: [seoCollection({ seo: { description: "excerpt" } })],
  });
  expect(present(present(enabledConfig.runtime.content[0]).structure).seo).toBe(true);
  // Models without the option keep the hashes pinned by config.projection.fixture.json.
});

test("whole configuration composite hashes preserve data keys called label and description", async () => {
  const make = (label: string, text: string) =>
    defineConfig({
      blocks: [
        defineBlock({
          type: "nested",
          version: 1,
          fields: {
            profile: field.group({
              label,
              fields: { label: field.text(), description: field.text() },
              defaultValue: { label: text, description: "data" },
            }),
          },
        }),
      ],
      content: [definePage({ key: "home", path: "/", version: 1, blocks: ["nested"] })],
    });
  const first = await make("First", "same");
  const display = await make("Second", "same");
  const changed = await make("First", "different");
  expect(first.structureHash).toBe(display.structureHash);
  expect(first.projectionHash).not.toBe(display.projectionHash);
  expect(first.structureHash).not.toBe(changed.structureHash);
});

test("nested hints normalize to schema addresses and never enter projections", async () => {
  const model = defineCollection({
    key: "links",
    route: "/links/:slug",
    version: 2,
    fields: {
      cards: field.list({
        renamedFrom: "links",
        item: field.group({
          fields: {
            title: field.text({ renamedFrom: "headline" }),
            label: field.text({ defaultValue: "label" }),
          },
        }),
      }),
    },
    removedFields: ["/cards/*/legacy"],
  });
  expect(model.renamedFields).toEqual({ cards: "links", "/cards/*/title": "/cards/*/headline" });
  const config = await defineConfig({ blocks: [], content: [model] });
  expect(
    at(present(config.runtime.content[0]).fields, "cards", "item", "fields", "title"),
  ).not.toHaveProperty("renamedFrom");
  expect(
    at(
      present(config.public.content[0]).fields,
      "cards",
      "item",
      "fields",
      "label",
      "defaultValue",
    ),
  ).toBe("label");
  expect(JSON.stringify(config.public)).not.toContain("renamedFrom");
});

for (const removedFields of [
  ["title", "/title"],
  ["/links/0/legacy"],
  ["/links/*"],
  ["links", "/links/*/legacy"],
]) {
  test(`invalid nested removal hints ${JSON.stringify(removedFields)}`, () => {
    expect(() => postModel({ removedFields })).toThrow(/removedFields/u);
  });
}

test("nested sibling hint conflicts are refused", () => {
  expect(() =>
    postModel({
      fields: {
        profile: field.group({
          fields: {
            title: field.text({ renamedFrom: "headline" }),
            headline: field.text(),
          },
        }),
      },
    }),
  ).toThrow(/configured field/u);
  expect(() =>
    postModel({
      fields: {
        links: field.list({
          item: field.group({
            fields: {
              title: field.text({ renamedFrom: "headline" }),
            },
          }),
        }),
      },
      removedFields: ["/links/*/headline"],
    }),
  ).toThrow(/rename source/u);
});

test("removal paths reject non-string values without coercion", () => {
  // Deliberately malformed removal paths must not be coerced.
  for (const value of [null, undefined, true, false, 1, {}, []])
    expect(() =>
      defineCollection({
        key: "posts",
        route: "/blog/:slug",
        version: 1,
        removedFields: [value] as unknown as string[],
      }),
    ).toThrow();
});

test("hint lookup does not treat inherited constructor as a configured field", () => {
  expect(
    defineCollection({
      key: "posts",
      route: "/blog/:slug",
      version: 1,
      fields: { title: field.text({ renamedFrom: "constructor" }) },
      removedFields: ["other"],
    }).renamedFields,
  ).toEqual({ title: "constructor" });
});

test("CE9A scalar-only global hashes still exclude collection listFields", async () => {
  const make = (listFields: string[]) =>
    defineConfig({ content: [postModel({ blocks: [], listFields })] });
  const plain = await make([]);
  const listed = await make(["author"]);
  expect(listed.structureHash).toBe(plain.structureHash);
  expect(listed.projectionHash).not.toBe(plain.projectionHash);
});

test("public identity excludes only root query options and stays internal", async () => {
  const make = async (overrides = {}) => defineConfig({ blocks, content: [postModel(overrides)] });
  const before = await make();
  const enabled = await make({ listOptions: { searchableFields: ["author"] } });
  const label = await make({ label: "Renamed" });
  expect(present(before.runtime.content[0]).publicProjectionHash).toBe(
    present(before.content[0]).projectionHash,
  );
  expect(present(enabled.runtime.content[0]).publicProjectionHash).toBe(
    present(before.runtime.content[0]).publicProjectionHash,
  );
  expect(present(label.runtime.content[0]).publicProjectionHash).not.toBe(
    present(before.runtime.content[0]).publicProjectionHash,
  );
  expect(JSON.stringify(enabled.public)).not.toContain("publicProjectionHash");
  expect(present(enabled.content[0]).publicProjectionHash).toBeUndefined();
  const named = async (value: string) =>
    make({ fields: { listOptions: field.text({ defaultValue: value }) } });
  expect(present((await named("a")).runtime.content[0]).publicProjectionHash).not.toBe(
    present((await named("b")).runtime.content[0]).publicProjectionHash,
  );
});

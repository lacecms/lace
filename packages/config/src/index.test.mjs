import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { builtInBlocks, canonicalizeJson, defineBlock, field } from "@lacecms/content";
import fixtureConfig from "../dist/config.fixture.js";
import {
  ConfigurationError,
  defineCollection,
  defineConfig,
  defineGlobal,
  definePage,
  normalizeCollectionRoute,
  normalizePagePath,
  packageName,
  resolveCollectionRoute,
} from "../dist/index.js";

const blocks = Object.values(builtInBlocks);

function postModel(overrides = {}) {
  return defineCollection({
    blocks: ["richText", "image"],
    fields: {
      author: field.text(),
      publishedAt: field.date({ required: true }),
    },
    key: "posts",
    label: "Posts",
    route: "/blog/:slug",
    version: 1,
    ...overrides,
  });
}

function homeModel(overrides = {}) {
  return definePage({
    blocks: ["hero"],
    fields: { heading: field.text({ label: "Heading", required: true }) },
    key: "home",
    label: "Home",
    path: "/",
    version: 1,
    ...overrides,
  });
}

test("exports its package identity", () => expect(packageName).toBe("@lacecms/config"));

test("expands both starter models to every built-in block at a new version", () => {
  const expectedBlocks = ["hero", "richText", "image", "quote", "cta"];
  expect(fixtureConfig.content).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ blocks: expectedBlocks, key: "home", version: 4 }),
      expect.objectContaining({ blocks: expectedBlocks, key: "posts", version: 4 }),
    ]),
  );
});

test("defines deeply readonly page and collection models", () => {
  const fields = { heading: field.text({ label: "Original", required: true }) };
  const blocks = ["hero"];
  const page = definePage({
    blocks,
    fields,
    key: "home",
    path: "/",
    renamedFrom: "landing",
    version: 1,
  });
  const collection = postModel();

  fields.heading = field.text({ label: "Changed" });
  blocks[0] = "cta";

  expect(page).toMatchObject({
    blocks: ["hero"],
    key: "home",
    kind: "page",
    path: "/",
    renamedFrom: "landing",
    version: 1,
  });
  expect(page.fields.heading).toMatchObject({ label: "Original", required: true, type: "text" });
  expect(collection).toMatchObject({ key: "posts", kind: "collection", route: "/blog/:slug" });
  expect(Object.isFrozen(page)).toBe(true);
  expect(Object.isFrozen(page.fields)).toBe(true);
  expect(Object.isFrozen(page.blocks)).toBe(true);
});

test.each([
  ["invalid key", { key: "Posts" }],
  ["empty key", { key: "" }],
  ["zero version", { version: 0 }],
  ["fractional version", { version: 1.5 }],
  ["same former key", { renamedFrom: "home" }],
  ["invalid field key", { fields: { "bad-key": field.text() } }],
  ["duplicate blocks", { blocks: ["hero", "hero"] }],
])("rejects %s model metadata", (_name, overrides) => {
  expect(() => homeModel(overrides)).toThrow(ConfigurationError);
});

test("rejects duplicate identity and configuration-detectable routes", async () => {
  await expect(defineConfig({ blocks, content: [homeModel(), homeModel()] })).rejects.toThrow(
    /share key/u,
  );
  await expect(
    defineConfig({
      blocks,
      content: [postModel(), postModel({ key: "articles", route: "/blog/:slug" })],
    }),
  ).rejects.toThrow(/share route/u);
  await expect(
    defineConfig({ blocks, content: [homeModel({ path: "/blog/releases" }), postModel()] }),
  ).rejects.toThrow(/collides/u);
  await expect(
    defineConfig({
      blocks,
      content: [postModel(), postModel({ key: "articles", renamedFrom: "posts" })],
    }),
  ).rejects.toThrow(/renamedFrom/u);
  await expect(
    defineConfig({
      blocks,
      content: [homeModel({ renamedFrom: "landing" }), postModel({ renamedFrom: "landing" })],
    }),
  ).rejects.toThrow(/share renamedFrom/u);
});

test("defines a route-less global model", async () => {
  const settings = defineGlobal({
    fields: { siteName: field.text({ required: true }) },
    key: "settings",
    label: "Site settings",
    version: 1,
  });
  expect(settings).toMatchObject({ blocks: [], key: "settings", kind: "global", version: 1 });
  expect(settings).not.toHaveProperty("path");
  expect(settings).not.toHaveProperty("route");
  expect(Object.isFrozen(settings)).toBe(true);

  const config = await defineConfig({ blocks, content: [homeModel(), postModel(), settings] });
  const projected = config.public.content.find((model) => model.key === "settings");
  expect(projected).toMatchObject({ key: "settings", kind: "global" });
  expect(projected).not.toHaveProperty("path");
  expect(projected).not.toHaveProperty("route");
  expect(projected).not.toHaveProperty("listFields");
});

test.each([
  ["path", "/settings"],
  ["route", "/settings/:slug"],
  ["listFields", []],
])("rejects %s on a global", (option, value) => {
  expect(() => defineGlobal({ key: "settings", version: 1, [option]: value })).toThrow(
    new RegExp(`must not declare ${option}`, "u"),
  );
});

test("keeps keys unique across kinds and hashes the kind", async () => {
  await expect(
    defineConfig({
      blocks,
      content: [
        homeModel({ key: "settings", path: "/settings" }),
        defineGlobal({ key: "settings", version: 1 }),
      ],
    }),
  ).rejects.toThrow(/share key/u);
  await expect(
    defineConfig({
      blocks,
      content: [
        defineGlobal({ key: "settings", version: 1 }),
        defineGlobal({ key: "footer", renamedFrom: "settings", version: 1 }),
      ],
    }),
  ).rejects.toThrow(/renamedFrom "settings" duplicates a model key/u);
  const page = await defineConfig({
    blocks,
    content: [definePage({ key: "settings", path: "/settings", version: 1 })],
  });
  const global = await defineConfig({
    blocks,
    content: [defineGlobal({ key: "settings", version: 1 })],
  });
  expect(global.content[0].structureHash).not.toBe(page.content[0].structureHash);
});

test("normalizes only canonical page and collection routes", () => {
  expect(normalizePagePath("/")).toBe("/");
  expect(normalizePagePath("/about")).toBe("/about");
  expect(normalizeCollectionRoute("/blog/:slug")).toBe("/blog/:slug");
  expect(resolveCollectionRoute("/blog/:slug", "release-notes")).toBe("/blog/release-notes");

  for (const value of [
    "about",
    "/about/",
    "/about//team",
    "/about/./team",
    "/about/../team",
    "/about?tab=1",
    "/about#team",
    "/:slug",
  ]) {
    expect(() => normalizePagePath(value)).toThrow(ConfigurationError);
  }
  for (const value of [
    "/blog",
    "/blog/:slug/:slug",
    "/blog/:id",
    "/blog/:slug/",
    "/blog//:slug",
    "/blog/:slug?draft=1",
  ]) {
    expect(() => normalizeCollectionRoute(value)).toThrow(ConfigurationError);
  }
  for (const slug of [
    "Release",
    "release/notes",
    "release--notes",
    "",
    "release?draft=1",
    "release#notes",
    ".",
  ]) {
    expect(() => resolveCollectionRoute("/blog/:slug", slug)).toThrow(ConfigurationError);
  }
});

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
  expect(first.content[0].key).toBe("home");
  expect(first.content[0].structureHash).toBe(displayChanged.content[0].structureHash);
  expect(first.content[0].projectionHash).not.toBe(displayChanged.content[0].projectionHash);
  expect(first.structureHash).not.toBe(structuralChanged.structureHash);
  expect(first.projectionHash).toBe(renamed.projectionHash);
  expect(first.structureHash).toBe(renamed.structureHash);
  expect(first.content[1].projectionHash).toBe(renamed.content[1].projectionHash);
  expect(first.content[1].structureHash).toBe(renamed.content[1].structureHash);
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
  expect(changed.content[0].projectionHash).not.toBe(original.content[0].projectionHash);
  expect(changed.content[0].structureHash).toBe(original.content[0].structureHash);
});

test("carries block migrations at runtime without changing identity or projections", async () => {
  const hero = (migrations) =>
    defineBlock({
      fields: builtInBlocks.hero.fields,
      ...(migrations === undefined ? {} : { migrations }),
      type: "hero",
      version: 2,
    });
  const migrate = (data) => ({ ...data });
  const withBlocks = (definition) =>
    defineConfig({
      blocks: [...blocks.filter((block) => block.type !== "hero"), definition],
      content: [homeModel()],
    });
  const plain = await withBlocks(hero());
  const migrated = await withBlocks(hero({ 2: migrate }));

  expect(migrated.runtime.blocks.get("hero").migrations[2]).toBe(migrate);
  expect(migrated.structureHash).toBe(plain.structureHash);
  expect(migrated.projectionHash).toBe(plain.projectionHash);
  expect(migrated.content[0].structureHash).toBe(plain.content[0].structureHash);
  expect(migrated.runtime.content[0].structure).toEqual(plain.runtime.content[0].structure);
  expect(JSON.stringify(migrated.blocks)).not.toContain("migrations");
});

test("keeps fields named like display metadata in the canonical structure", async () => {
  const described = (fields) =>
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
  const runtime = withDescription.runtime.content[0];

  expect(withDescription.content[0].structureHash).not.toBe(plain.content[0].structureHash);
  expect(longerDescription.content[0].structureHash).not.toBe(
    withDescription.content[0].structureHash,
  );
  expect(runtime.structure.fields.description).toEqual({ required: false, type: "textarea" });
  expect(runtime.structure).not.toHaveProperty("label");
  expect(runtime.structure).not.toHaveProperty("listFields");
  expect(runtime.legacyStructureHash).toEqual(expect.any(String));
  expect(runtime.legacyStructureHash).not.toBe(runtime.structureHash);
  expect(plain.runtime.content[0]).not.toHaveProperty("legacyStructureHash");
  expect(Object.isFrozen(runtime.structure.fields.description)).toBe(true);

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
  const withBlock = (block) =>
    defineConfig({ blocks: [block], content: [homeModel({ blocks: ["button"] })] });
  const first = await withBlock(labelledBlock);
  const second = await withBlock(relabelledBlock);
  expect(first.content[0].structureHash).not.toBe(second.content[0].structureHash);
  expect(first.runtime.content[0].structure.blockDefinitions[0].fields.label).toEqual({
    required: false,
    type: "text",
  });
});

test("omits canonical structures and legacy hashes from public projections", async () => {
  const config = await defineConfig({
    blocks,
    content: [postModel({ fields: { description: field.textarea() } }), homeModel()],
  });
  const serialized = JSON.stringify(config.public);

  for (const model of config.public.content) {
    expect(model).not.toHaveProperty("structure");
    expect(model).not.toHaveProperty("legacyStructureHash");
  }
  expect(serialized).not.toContain("blockDefinitions");
  expect(config.runtime.content.every((model) => typeof model.structure === "object")).toBe(true);
  expect(config.runtime.content[0].structureHash).toBe(config.content[0].structureHash);
});

test("puts declared block settings in structural identity and omits empty ones", async () => {
  const hero = (settings) =>
    defineBlock({
      fields: builtInBlocks.hero.fields,
      ...(settings === undefined ? {} : { settings }),
      type: "hero",
      version: 2,
    });
  const withBlocks = (definition) =>
    defineConfig({
      blocks: [...blocks.filter((block) => block.type !== "hero"), definition],
      content: [homeModel()],
    });
  const align = (defaultValue, options = ["left", "center"]) => ({
    align: field.select({ defaultValue, options }),
  });
  const plain = await withBlocks(hero());
  const empty = await withBlocks(hero({}));
  const left = await withBlocks(hero(align("left")));
  const center = await withBlocks(hero(align("center")));
  const wider = await withBlocks(hero(align("left", ["left", "center", "right"])));

  expect(empty.content[0].structureHash).toBe(plain.content[0].structureHash);
  expect(empty.content[0].projectionHash).toBe(plain.content[0].projectionHash);
  expect(empty.blocks.find((block) => block.type === "hero")).not.toHaveProperty("settings");
  expect(left.content[0].structureHash).not.toBe(plain.content[0].structureHash);
  expect(center.content[0].structureHash).not.toBe(left.content[0].structureHash);
  expect(wider.content[0].structureHash).not.toBe(left.content[0].structureHash);
  expect(left.runtime.content[0].structure.blockDefinitions[0].settings.align).toMatchObject({
    defaultValue: "left",
    type: "select",
  });
});

test("rejects model blocks missing from the root registry and separates projections", async () => {
  await expect(defineConfig({ blocks: [], content: [homeModel()] })).rejects.toThrow(
    /unregistered/u,
  );

  const config = await defineConfig({ blocks, content: [homeModel(), postModel()] });
  expect(config.public).toEqual({
    blocks: config.blocks,
    content: config.content,
    projectionHash: config.projectionHash,
    structureHash: config.structureHash,
  });
  expect(JSON.stringify(config.public)).not.toContain("validate");
  expect(config.runtime.blocks.get("hero")?.validate({ heading: "Lace" }, "publish")).toEqual({
    heading: "Lace",
  });
});

test("snapshots the architecture root fixture's canonical public projection", () => {
  const expected = JSON.parse(
    readFileSync(new URL("./config.projection.fixture.json", import.meta.url), "utf8"),
  );
  expect(canonicalizeJson(fixtureConfig.public)).toBe(canonicalizeJson(expected));
});

test("normalizes ordered scalar list fields and omits empty ones", async () => {
  const listFields = ["category", "author"];
  const withList = defineCollection({
    fields: {
      author: field.text(),
      category: field.select({ options: ["design", "news"] }),
    },
    key: "posts",
    listFields,
    route: "/blog/:slug",
    version: 1,
  });
  listFields.push("mutated");
  expect(withList.listFields).toEqual(["category", "author"]);
  expect(Object.isFrozen(withList.listFields)).toBe(true);
  expect(Object.hasOwn(postModel({ listFields: [] }), "listFields")).toBe(false);
  expect(Object.hasOwn(postModel(), "listFields")).toBe(false);

  const config = await defineConfig({ blocks, content: [withList] });
  expect(JSON.parse(JSON.stringify(config.public.content[0])).listFields).toEqual([
    "category",
    "author",
  ]);

  const [empty, absent] = await Promise.all([
    defineConfig({ blocks, content: [postModel({ listFields: [] })] }),
    defineConfig({ blocks, content: [postModel()] }),
  ]);
  expect(empty.projectionHash).toBe(absent.projectionHash);
  expect(empty.structureHash).toBe(absent.structureHash);
});

test("rejects invalid list fields", () => {
  const fields = {
    author: field.text(),
    body: field.richText(),
    cover: field.media(),
  };
  const collection = (listFields) =>
    defineCollection({ fields, key: "posts", listFields, route: "/blog/:slug", version: 1 });
  expect(() => collection("author")).toThrow(ConfigurationError);
  expect(() => collection([1])).toThrow(/field keys/u);
  expect(() => collection(["missing"])).toThrow(/undeclared field "missing"/u);
  expect(() => collection(["author", "author"])).toThrow(/duplicate field "author"/u);
  expect(() => collection(["body"])).toThrow(/scalar field, not richText/u);
  expect(() => collection(["cover"])).toThrow(/scalar field, not media/u);
  expect(() => collection(["toString"])).toThrow(/undeclared field/u);
});

test("treats list fields as projection-only identity", async () => {
  const [plain, listed, relisted] = await Promise.all([
    defineConfig({ blocks, content: [postModel()] }),
    defineConfig({ blocks, content: [postModel({ listFields: ["author"] })] }),
    defineConfig({ blocks, content: [postModel({ listFields: ["publishedAt", "author"] })] }),
  ]);
  expect(listed.content[0].structureHash).toBe(plain.content[0].structureHash);
  expect(relisted.content[0].structureHash).toBe(plain.content[0].structureHash);
  expect(listed.structureHash).toBe(plain.structureHash);
  expect(listed.content[0].projectionHash).not.toBe(plain.content[0].projectionHash);
  expect(relisted.content[0].projectionHash).not.toBe(listed.content[0].projectionHash);
  expect(listed.projectionHash).not.toBe(plain.projectionHash);
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
  const [plainModel] = plain.runtime.content;
  const [hintedModel] = hinted.runtime.content;

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

const seoFields = {
  body: field.richText(),
  cover: field.media(),
  excerpt: field.textarea(),
  heading: field.text(),
};

function seoCollection(overrides = {}) {
  return defineCollection({
    fields: seoFields,
    key: "posts",
    route: "/blog/:slug",
    version: 1,
    ...overrides,
  });
}

function settingsGlobal(overrides = {}) {
  return defineGlobal({
    fields: {
      metaDescription: field.textarea(),
      shareImage: field.media(),
      siteName: field.text({ required: true }),
      titleTemplate: field.text(),
    },
    key: "settings",
    version: 1,
    ...overrides,
  });
}

test("normalizes the SEO option of routable models", async () => {
  expect(seoCollection({ seo: { description: "excerpt", image: "cover" } }).seo).toEqual({
    description: "excerpt",
    image: "cover",
  });
  expect(definePage({ key: "home", path: "/", seo: true, version: 1 }).seo).toEqual({});
  expect(seoCollection({ seo: false })).not.toHaveProperty("seo");
  expect(seoCollection()).not.toHaveProperty("seo");
  const config = await defineConfig({
    content: [seoCollection({ seo: { description: "heading" } })],
  });
  expect(config.public.content[0].seo).toEqual({ description: "heading" });
});

test.each([
  [{ seo: { image: "heading" } }, /seo\.image field "heading" must be a media field/u],
  [{ seo: { description: "cover" } }, /seo\.description field "cover" must be a text/u],
  [{ seo: { description: "body" } }, /must be a text or textarea field, not richText/u],
  [{ seo: { description: "missing" } }, /references undeclared field "missing"/u],
  [{ seo: { keywords: "heading" } }, /seo must not declare "keywords"/u],
  [{ seo: "yes" }, /seo must be a boolean or an object/u],
  [{ seoDefaults: { siteName: "heading" } }, /must not declare seoDefaults/u],
  [{ removedSeo: true, seo: true }, /must not declare removedSeo while seo is enabled/u],
  [{ removedSeo: false }, /removedSeo must be true/u],
])("rejects invalid SEO options %#", (overrides, message) => {
  expect(() => seoCollection(overrides)).toThrow(message);
});

test("rejects SEO options on a global", () => {
  expect(() => settingsGlobal({ seo: true })).toThrow(/must not declare seo/u);
  expect(() => settingsGlobal({ removedSeo: true })).toThrow(/must not declare removedSeo/u);
});

test("normalizes site SEO defaults on one global", async () => {
  const settings = settingsGlobal({
    seoDefaults: {
      description: "metaDescription",
      image: "shareImage",
      siteName: "siteName",
      titleTemplate: "titleTemplate",
    },
  });
  expect(settings.seoDefaults).toEqual({
    description: "metaDescription",
    image: "shareImage",
    siteName: "siteName",
    titleTemplate: "titleTemplate",
  });
  expect(() => settingsGlobal({ seoDefaults: {} })).toThrow(/must name a siteName field/u);
  expect(() => settingsGlobal({ seoDefaults: { siteName: "shareImage" } })).toThrow(
    /seoDefaults\.siteName field "shareImage" must be a text or textarea field/u,
  );
  expect(() =>
    settingsGlobal({ seoDefaults: { image: "siteName", siteName: "siteName" } }),
  ).toThrow(/seoDefaults\.image field "siteName" must be a media field/u);
  expect(() => settingsGlobal({ seoDefaults: { siteName: "siteName", url: "x" } })).toThrow(
    /seoDefaults must not declare "url"/u,
  );
  await expect(
    defineConfig({
      content: [settings, settingsGlobal({ key: "footer", seoDefaults: { siteName: "siteName" } })],
    }),
  ).rejects.toThrow(/globals "settings" and "footer" both declare seoDefaults/u);
});

test("enabling SEO is structural while mappings and defaults are projection-only", async () => {
  const hashes = async (model) => {
    const config = await defineConfig({ content: [model] });
    return {
      projection: config.runtime.content[0].projectionHash,
      structure: config.runtime.content[0].structureHash,
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
  expect(config.runtime.content[0].removedSeo).toBe(true);
  expect(config.runtime.content[0].structure).not.toHaveProperty("seo");
  const enabledConfig = await defineConfig({
    content: [seoCollection({ seo: { description: "excerpt" } })],
  });
  expect(enabledConfig.runtime.content[0].structure.seo).toBe(true);
  // Models without the option keep the hashes pinned by config.projection.fixture.json.
});

test("composite metadata identity strips only descriptor display properties", async () => {
  const make = (label, defaultLabel = "value") =>
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
  expect(first.content[0].structureHash).toBe(display.content[0].structureHash);
  expect(first.content[0].projectionHash).not.toBe(display.content[0].projectionHash);
  expect(first.content[0].structureHash).not.toBe(content.content[0].structureHash);
  expect(first.runtime.content[0].structure.fields.cards.item.fields).toHaveProperty("label");
  expect(first.runtime.content[0].structure.fields.cards.item.defaultValue).toEqual({
    label: "value",
    description: "content",
  });
  expect(JSON.parse(JSON.stringify(first.public.content[0])).fields.cards.item.type).toBe("group");
});

test("composites stay out of scalar-only config options and block settings", () => {
  const fields = {
    group: field.group({ fields: { child: field.text() } }),
    list: field.list({ item: field.text(), defaultValue: [] }),
  };
  for (const listFields of [["group"], ["list"], ["group.child"]])
    expect(() =>
      defineCollection({ key: "nested", version: 1, route: "/nested/:slug", fields, listFields }),
    ).toThrow();
  expect(() =>
    definePage({
      key: "nested",
      version: 1,
      path: "/nested",
      fields,
      seo: { description: "group" },
    }),
  ).toThrow();
  expect(() =>
    defineGlobal({ key: "nested", version: 1, fields, seoDefaults: { siteName: "list" } }),
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
      fields: { group: { type: "group", fields: { child: { type: "wrong" } } } },
    }),
  ).toThrow();
});

test("whole configuration composite hashes preserve data keys called label and description", async () => {
  const make = (label, text) =>
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
  expect(config.runtime.content[0].fields.cards.item.fields.title).not.toHaveProperty(
    "renamedFrom",
  );
  expect(config.public.content[0].fields.cards.item.fields.label.defaultValue).toBe("label");
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
  for (const value of [null, undefined, true, false, 1, {}, []])
    expect(() =>
      defineCollection({ key: "posts", route: "/blog/:slug", version: 1, removedFields: [value] }),
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

test("itemLabel changes only projection identity at every descriptor position", async () => {
  const make = async (itemLabel, data = "stored") => {
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
    expect(config.runtime.content[0].structureHash).toBe(before.runtime.content[0].structureHash);
    expect(config.projectionHash).not.toBe(before.projectionHash);
  }
  expect(
    after.runtime.content[0].structure.fields.nested.fields.cards.item.defaultValue.itemLabel,
  ).toBe("stored");
  expect((await make("title", "changed")).structureHash).not.toBe(after.structureHash);
});

test("CE9A placeholders change projection only across scalar/composite and block settings", async () => {
  for (const composite of [false, true]) {
    const make = (placeholder, data = "stored") => {
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
      expect(after.runtime.content[0].structureHash).toBe(before.runtime.content[0].structureHash);
      expect(after.projectionHash).not.toBe(before.projectionHash);
      expect(after.runtime.content[0].structure.fields.placeholder.defaultValue).toBe("stored");
      expect((await make(value, "changed")).structureHash).not.toBe(after.structureHash);
    }
  }
});

test("CE9A scalar-only global hashes still exclude collection listFields", async () => {
  const make = (listFields) => defineConfig({ content: [postModel({ blocks: [], listFields })] });
  const plain = await make([]);
  const listed = await make(["author"]);
  expect(listed.structureHash).toBe(plain.structureHash);
  expect(listed.projectionHash).not.toBe(plain.projectionHash);
});

test("CE9B layouts are projection-only at every owner and preserve content keys", async () => {
  const layout = { mode: "tabs", groups: [{ key: "main", label: "Main", fields: ["layout"] }] };
  const make = (enabled, value = "stored") => {
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
  expect(after.runtime.content[0].structureHash).toBe(before.runtime.content[0].structureHash);
  expect(after.runtime.content[0].structure).toEqual(before.runtime.content[0].structure);
  expect(after.runtime.content[0].layout).toEqual(layout);
  expect((await make(true, "changed")).structureHash).not.toBe(after.structureHash);
  const scalar = async (enabled) =>
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
    defineGlobal({ key: "bad", version: 1, fields: { name: field.text() }, layout }),
  ).toThrow();
});

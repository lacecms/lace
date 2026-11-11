import { present } from "../test-support/assertions.js";

import { expect, test } from "vitest";
import { field } from "@lacecms/content";

import { ConfigurationError, defineCollection, defineConfig, defineGlobal } from "../index.js";
import { blocks, postModel, homeModel } from "../test-support/model-fixtures.js";

test("normalizes ordered scalar list fields and omits empty ones", async () => {
  const listFields: ("category" | "author")[] = ["category", "author"];
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
  // Exercise input detachment with a valid field key.
  listFields.push("author");
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
  // Deliberately malformed list-field inputs exercise runtime validation.
  const collection = (listFields: unknown) =>
    defineCollection({
      fields,
      key: "posts",
      listFields: listFields as readonly ("author" | "body" | "cover")[],
      route: "/blog/:slug",
      version: 1,
    });
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
  expect(present(listed.content[0]).structureHash).toBe(present(plain.content[0]).structureHash);
  expect(present(relisted.content[0]).structureHash).toBe(present(plain.content[0]).structureHash);
  expect(listed.structureHash).toBe(plain.structureHash);
  expect(present(listed.content[0]).projectionHash).not.toBe(
    present(plain.content[0]).projectionHash,
  );
  expect(present(relisted.content[0]).projectionHash).not.toBe(
    present(listed.content[0]).projectionHash,
  );
  expect(listed.projectionHash).not.toBe(plain.projectionHash);
});

test("listOptions normalize independently, detach and disappear when empty", async () => {
  const options = {
    searchableFields: ["author"],
    sortableFields: ["publishedAt"],
    filterableFields: [],
  };
  const model = postModel({ listOptions: options });
  options.searchableFields.push("publishedAt");
  expect(model.listFields).toBeUndefined();
  expect(model.listOptions).toEqual({
    searchableFields: ["author"],
    sortableFields: ["publishedAt"],
  });
  expect(Object.isFrozen(present(model.listOptions).searchableFields)).toBe(true);
  const config = async (overrides: object) =>
    defineConfig({ blocks, content: [postModel(overrides)] });
  expect(
    (await config({ listOptions: { searchableFields: [], filterableFields: [] } })).public,
  ).toEqual((await config({})).public);
});

test.each([
  { unknown: [] },
  { searchableFields: ["publishedAt"] },
  { sortableFields: ["missing"] },
  { filterableFields: ["author", "author"] },
  { sortableFields: ["group.child"] },
  { searchableFields: null },
  { sortableFields: Array(17).fill("author") },
  { sortableFields: ["composite"] },
])("rejects invalid collection query capabilities %j", (listOptions) => {
  expect(() =>
    postModel({
      fields: {
        author: field.text(),
        publishedAt: field.date(),
        composite: field.group({ fields: { child: field.text() } }),
      },
      listOptions,
    }),
  ).toThrow(ConfigurationError);
});

test("pages and globals reject listOptions", () => {
  expect(() => homeModel({ listOptions: {} })).toThrow(ConfigurationError);
  // Deliberately malformed global input verifies listOptions is rejected.
  const invalidGlobal = { key: "settings", version: 1, listOptions: {} } as unknown as Parameters<
    typeof defineGlobal
  >[0];
  expect(() => defineGlobal(invalidGlobal)).toThrow(ConfigurationError);
});

test("listOptions are projection-only while consumer keys remain structural", async () => {
  const normalize = async (overrides: object) =>
    await defineConfig({ blocks, content: [postModel(overrides)] });
  const base = await normalize({});
  const enabled = await normalize({ listOptions: { searchableFields: ["author"] } });
  expect(enabled.structureHash).toBe(base.structureHash);
  expect(present(enabled.content[0]).structureHash).toBe(present(base.content[0]).structureHash);
  expect(enabled.projectionHash).not.toBe(base.projectionHash);
  expect(present(enabled.content[0]).projectionHash).not.toBe(
    present(base.content[0]).projectionHash,
  );
  const a = await normalize({ fields: { listOptions: field.text({ defaultValue: "a" }) } });
  const b = await normalize({ fields: { listOptions: field.text({ defaultValue: "b" }) } });
  expect(present(a.content[0]).structureHash).not.toBe(present(b.content[0]).structureHash);
  const nested = (value: string) =>
    normalize({
      fields: {
        data: field.group({
          fields: { listOptions: field.text() },
          defaultValue: { listOptions: value },
        }),
      },
    });
  expect(present((await nested("a")).content[0]).structureHash).not.toBe(
    present((await nested("b")).content[0]).structureHash,
  );
});

test("defaultSort accepts system sorts and sortable field sorts", async () => {
  const fields = { author: field.text(), order: field.number(), publishedAt: field.date() };
  const model = (listOptions: object) => postModel({ fields, listOptions });
  expect(model({ sortableFields: ["order"], defaultSort: "field:order" }).listOptions).toEqual({
    sortableFields: ["order"],
    defaultSort: "field:order",
  });
  expect(model({ sortableFields: ["order"], defaultSort: "-field:order" }).listOptions).toEqual({
    sortableFields: ["order"],
    defaultSort: "-field:order",
  });
  // A system default needs no sortable fields and keeps listOptions nonempty.
  for (const defaultSort of ["title", "-title", "updatedAt", "publishedAt", "-publishedAt"])
    expect(model({ defaultSort }).listOptions).toEqual({ defaultSort });
  const config = async (listOptions?: object) =>
    defineConfig({
      blocks,
      content: [postModel({ fields, ...(listOptions === undefined ? {} : { listOptions }) })],
    });
  const [absent, implicit, withFields, implicitWithFields, ordered] = await Promise.all([
    config(),
    config({ defaultSort: "-updatedAt" }),
    config({ sortableFields: ["order"] }),
    config({ sortableFields: ["order"], defaultSort: "-updatedAt" }),
    config({ sortableFields: ["order"], defaultSort: "field:order" }),
  ]);
  // The documented default normalizes to omission, keeping metadata and hashes.
  expect(implicit.public).toEqual(absent.public);
  expect(implicit.projectionHash).toBe(absent.projectionHash);
  expect(implicitWithFields.public).toEqual(withFields.public);
  expect(implicitWithFields.projectionHash).toBe(withFields.projectionHash);
  // A default is projection-only and outside the public identity.
  expect(ordered.structureHash).toBe(withFields.structureHash);
  expect(ordered.projectionHash).not.toBe(withFields.projectionHash);
  expect(present(ordered.runtime.content[0]).publicProjectionHash).toBe(
    present(withFields.runtime.content[0]).publicProjectionHash,
  );
  expect(JSON.parse(JSON.stringify(ordered.public.content[0])).listOptions).toEqual({
    sortableFields: ["order"],
    defaultSort: "field:order",
  });
});

test.each([
  [{ defaultSort: "field:order" }, /must be listed in listOptions.sortableFields/u],
  [{ sortableFields: ["order"], defaultSort: "field:author" }, /"author" must be listed/u],
  [{ sortableFields: ["order"], defaultSort: "author" }, /system sort/u],
  [{ sortableFields: ["order"], defaultSort: "field:" }, /system sort/u],
  [{ sortableFields: ["order"], defaultSort: 3 }, /sort string/u],
  [{ sortableFields: ["order"], defaultSort: null }, /sort string/u],
])("rejects an invalid defaultSort %j", (listOptions, message) => {
  expect(() =>
    postModel({ fields: { author: field.text(), order: field.number() }, listOptions }),
  ).toThrow(message);
});

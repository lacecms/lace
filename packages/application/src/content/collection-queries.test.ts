// @ts-nocheck
// TODO(rf2): Type mutable query/model fixtures, branded actors and deliberately invalid query operands.
import { expect, test } from "vitest";
import { defineCollection, defineConfig, defineGlobal, definePage } from "@lacecms/config";
import { field } from "@lacecms/content";

test("configured list queries resolve before reads with role parity and detached canonical operands", async () => {
  const { defineConfig, defineCollection } = await import("@lacecms/config");
  const { field } = await import("@lacecms/content");
  const { ContentUseCases } = await import("../index.js");
  const config = await defineConfig({
    content: [
      defineCollection({
        key: "posts",
        route: "/:slug",
        version: 1,
        fields: {
          category: field.select({ options: ["a", "b"] }),
          count: field.number(),
          flag: field.boolean(),
          description: field.text(),
          time: field.datetime(),
        },
        listOptions: {
          sortableFields: ["count"],
          filterableFields: ["category", "count", "flag", "description", "time"],
          searchableFields: ["description"],
        },
      }),
    ],
  });
  const calls = [];
  const page = { items: [], totals: { all: 0, changed: 0, draft: 0, published: 0 } };
  const useCases = new ContentUseCases({
    config: config.runtime,
    content: {
      list: async (query) => {
        calls.push(query);
        return page;
      },
    },
  });
  const filters = [
    { field: "count", op: "eq", value: 0 },
    { field: "category", op: "in", values: ["b", "a"] },
    { field: "flag", op: "eq", value: false },
  ];
  for (const role of ["viewer", "editor", "admin"]) {
    const result = await useCases.list({
      actor: { id: "reader", role },
      modelKey: "posts",
      limit: 5,
      sort: "-field:count",
      q: " Москва ",
      filters,
    });
    expect(result).toEqual(page);
    expect(result).not.toBe(page);
  }
  expect(calls[1]).toEqual(calls[0]);
  expect(calls[2]).toEqual(calls[0]);
  expect(calls[0].query.filters).toEqual(
    [filters[1], filters[0], filters[2]].map((filter) =>
      filter.op === "in" ? { ...filter, values: ["a", "b"] } : filter,
    ),
  );
  expect(calls[0].q).toBe("Москва");
  expect(calls[0].listFields).toEqual([]);
  filters[1].values.push("changed");
  expect(calls[0].query.filters[0].values).toEqual(["a", "b"]);
  for (const [query, pointer] of [
    [{ sort: "field:description" }, "/sort"],
    [{ filters: [{ field: "missing", op: "isSet" }] }, "/filters/0/field"],
    [{ filters: [{ field: "category", op: "in", values: ["unknown"] }] }, "/filters/0/values"],
    [{ filters: [{ field: "flag", op: "eq", value: "false" }] }, "/filters/0/value"],
    [{ filters: [{ field: "count", op: "range", min: 5, max: 0 }] }, "/filters/0/max"],
    [{ filters: [{ field: "description", op: "eq", value: "" }] }, "/filters/0/value"],
    [{ filters: [{ field: "count", op: "contains", value: "0" }] }, "/filters/0/op"],
    [{ filters: Array(17).fill({ field: "count", op: "isSet" }) }, "/filters"],
  ])
    await expect(
      useCases.list({
        actor: { id: "reader", role: "viewer" },
        modelKey: "posts",
        limit: 5,
        ...query,
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE", pointer });
  for (const slug of ["Hello", "a--b", "-a", "x".repeat(101), ""])
    await expect(
      useCases.list({ actor: { id: "reader", role: "viewer" }, modelKey: "posts", limit: 5, slug }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE", pointer: "/slug" });
  expect(calls).toHaveLength(3);
  await expect(
    useCases.list({ actor: { id: "reader", role: "nobody" }, modelKey: "posts", limit: 5 }),
  ).rejects.toThrow();
  expect(calls).toHaveLength(3);
  const canonical = await useCases.list({
    actor: { id: "reader", role: "viewer" },
    modelKey: "posts",
    limit: 5,
    filters: [{ field: "time", op: "range", from: "2026-10-25T12:00:00+02:00" }],
  });
  expect(calls[3].query.filters).toEqual([
    { field: "time", op: "range", from: "2026-10-25T10:00:00.000Z" },
  ]);
  expect(canonical).toEqual(page);
});

test("trusted runtime LIKE budgets reject before reads and preserve original filter pointers", async () => {
  const { ContentUseCases, CLOUDFLARE_LIST_QUERY_LIMITS, NODE_LIST_QUERY_LIMITS } =
    await import("../index.js");
  const config = await defineConfig({
    content: [
      defineCollection({
        key: "posts",
        route: "/:slug",
        version: 1,
        fields: { text: field.text(), count: field.number() },
        listOptions: { filterableFields: ["text", "count"] },
      }),
    ],
  });
  const calls = [];
  const policy = { ...CLOUDFLARE_LIST_QUERY_LIMITS };
  const make = (listQueryLimits) =>
    new ContentUseCases({
      config: config.runtime,
      listQueryLimits,
      content: {
        list: async (query) => {
          calls.push(query);
          return { items: [], totals: { all: 0, draft: 0, changed: 0, published: 0 } };
        },
      },
    });
  const cloud = make(policy),
    node = make(NODE_LIST_QUERY_LIMITS);
  policy.maxSearchLength = 200;
  policy.maxLikePatternBytes = null;
  const input = { actor: { id: "reader", role: "viewer" }, modelKey: "posts", limit: 5 };
  // Each accepted pattern is exactly 50 bytes after wrappers and escaping.
  for (const value of [
    "a".repeat(48),
    "я".repeat(24),
    "%".repeat(24),
    "_".repeat(24),
    "\\".repeat(24),
    "aя".repeat(16),
    "😀".repeat(12),
  ]) {
    await cloud.list({ ...input, q: ` ${value} ` });
    expect(calls.at(-1).q).toBe(value);
    await cloud.list({ ...input, filters: [{ field: "text", op: "contains", value }] });
  }
  const accepted = calls.length;
  for (const value of [
    "a".repeat(49),
    "я".repeat(24) + "a",
    "%".repeat(24) + "a",
    "😀".repeat(12) + "a",
    "aя".repeat(16) + "a",
  ]) {
    await expect(
      cloud.list({ ...input, q: value, listQueryLimits: NODE_LIST_QUERY_LIMITS }),
    ).rejects.toMatchObject({ pointer: "/q" });
    await expect(
      cloud.list({
        ...input,
        filters: [
          { field: "text", op: "contains", value },
          { field: "count", op: "eq", value: 0 },
        ],
      }),
    ).rejects.toMatchObject({ pointer: "/filters/0/value" });
  }
  expect(calls).toHaveLength(accepted);
  await expect(
    cloud.list({ ...input, filters: [{ field: "text", op: "contains", value: " ".repeat(49) }] }),
  ).rejects.toMatchObject({ pointer: "/filters/0/value" });
  await cloud.list({ ...input, filters: [{ field: "text", op: "eq", value: "я".repeat(200) }] });
  await node.list({
    ...input,
    q: "я".repeat(200),
    filters: [{ field: "text", op: "contains", value: "%".repeat(200) }],
  });
  expect(calls.at(-1).listQueryLimits).toEqual(NODE_LIST_QUERY_LIMITS);
  const finalCount = calls.length;
  await expect(node.list({ ...input, q: "x".repeat(201) })).rejects.toMatchObject({
    pointer: "/q",
  });
  await expect(
    cloud.list({ ...input, actor: { id: "bad", role: "nobody" }, q: "x".repeat(201) }),
  ).rejects.toThrow();
  expect(calls).toHaveLength(finalCount);
});

test("entry lists pass an exact collection slug and refuse it for singleton models", async () => {
  const { ContentUseCases } = await import("../index.js");
  const config = await defineConfig({
    content: [
      defineCollection({ key: "posts", route: "/posts/:slug", version: 1 }),
      definePage({ key: "home", path: "/", version: 1 }),
      defineGlobal({ key: "settings", version: 1 }),
    ],
  });
  const calls = [];
  const page = { items: [], totals: { all: 0, changed: 0, draft: 0, published: 0 } };
  const useCases = new ContentUseCases({
    config: config.runtime,
    content: {
      list: async (query) => {
        calls.push(query);
        return page;
      },
    },
  });
  const actor = { id: "reader", role: "viewer" };
  await useCases.list({ actor, limit: 5, modelKey: "posts", slug: "hello-world", q: "x" });
  expect(calls[0]).toMatchObject({ q: "x", slug: "hello-world" });
  await useCases.list({ actor, limit: 5, modelKey: "posts" });
  expect(calls[1]).not.toHaveProperty("slug");
  for (const modelKey of ["home", "settings"])
    await expect(useCases.list({ actor, limit: 5, modelKey, slug: "home" })).rejects.toMatchObject({
      pointer: "/slug",
    });
  expect(calls).toHaveLength(2);
});

test("a request without sort uses the collection's configured default", async () => {
  const { ContentUseCases } = await import("../index.js");
  const fields = { order: field.number(), summary: field.text() };
  const config = await defineConfig({
    content: [
      defineCollection({
        key: "projects",
        route: "/projects/:slug",
        version: 1,
        fields,
        listOptions: { sortableFields: ["order"], defaultSort: "field:order" },
      }),
      defineCollection({
        key: "titled",
        route: "/titled/:slug",
        version: 1,
        listOptions: { defaultSort: "title" },
      }),
      defineCollection({ key: "posts", route: "/posts/:slug", version: 1, fields }),
      definePage({ key: "home", path: "/", version: 1 }),
      defineGlobal({ key: "settings", version: 1 }),
    ],
  });
  const calls = [];
  const page = { items: [], totals: { all: 0, changed: 0, draft: 0, published: 0 } };
  const useCases = new ContentUseCases({
    config: config.runtime,
    content: {
      list: async (query) => {
        calls.push(query);
        return page;
      },
    },
  });
  const actor = { id: "reader", role: "viewer" };
  const sortOf = async (modelKey, sort) => {
    await useCases.list({ actor, limit: 5, modelKey, ...(sort === undefined ? {} : { sort }) });
    return calls.at(-1).sort;
  };
  // The default is the explicit sort, with its resolved field target.
  expect(await sortOf("projects")).toBe("field:order");
  expect(calls.at(-1).query.sortableFields).toEqual([{ key: "order", type: "number" }]);
  expect(await sortOf("titled")).toBe("title");
  // An explicit sort, including the old default, always wins.
  expect(await sortOf("projects", "-updatedAt")).toBe("-updatedAt");
  expect(await sortOf("projects", "-field:order")).toBe("-field:order");
  // Collections without a default, pages and globals keep -updatedAt.
  for (const modelKey of ["posts", "home", "settings"])
    expect(await sortOf(modelKey)).toBe("-updatedAt");
});

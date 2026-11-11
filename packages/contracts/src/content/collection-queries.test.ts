// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import { field } from "@lacecms/content";
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { contentModelSchema } from "./models.js";

describe("configured collection query contracts", async () => {
  const {
    collectionFieldFiltersSchema: filters,
    collectionListOptionsSchema: options,
    canonicalCollectionFilters,
  } = await import("./collection-queries.js");
  const { contentEntrySortSchema: sort } = await import("./entries.js");
  const { toContentModelDto } = await import("./model-projection.js");
  test("runtime metadata round-trips separately and defaults legacy responses", async () => {
    const { listQueryLimitsSchema } = await import("./collection-queries.js");
    const { contentModelListSchema } = await import("./models.js");
    expect(v.parse(contentModelListSchema, { items: [] }).listQueryLimits).toEqual({
      maxSearchLength: 200,
      maxLikePatternBytes: null,
    });
    for (const limits of [
      { maxSearchLength: 200, maxLikePatternBytes: null },
      { maxSearchLength: 48, maxLikePatternBytes: 50 },
    ]) {
      const wire = { items: [], listQueryLimits: limits };
      expect(v.parse(contentModelListSchema, JSON.parse(JSON.stringify(wire)))).toEqual(wire);
    }
    for (const limits of [
      {},
      { maxSearchLength: 48 },
      { maxSearchLength: 0, maxLikePatternBytes: null },
      { maxSearchLength: 201, maxLikePatternBytes: null },
      { maxSearchLength: 1.5, maxLikePatternBytes: 50 },
      { maxSearchLength: 48, maxLikePatternBytes: 0 },
      { maxSearchLength: 48, maxLikePatternBytes: 51 },
      { maxSearchLength: 48, maxLikePatternBytes: "50" },
      { maxSearchLength: 48, maxLikePatternBytes: 50, override: true },
    ])
      expect(v.safeParse(listQueryLimitsSchema, limits).success).toBe(false);
  });
  test.each([
    { field: "text", op: "contains", value: " Москва " },
    { field: "url", op: "eq", value: "https://example.com" },
    { field: "flag", op: "eq", value: false },
    { field: "count", op: "eq", value: 0 },
    { field: "any", op: "isSet" },
    { field: "any", op: "isNotSet" },
    { field: "choice", op: "in", values: ["b", "a"] },
    { field: "count", op: "range", min: 0 },
    { field: "count", op: "range", max: 1 },
    { field: "date", op: "range", from: "2024-02-29", to: "2026-10-25" },
  ])("round-trips %j", (filter) =>
    expect(v.parse(filters, JSON.parse(JSON.stringify([filter])))).toEqual([filter]),
  );
  test("datetime endpoints compare UTC instants and canonical operands detach", () => {
    const parsed = v.parse(filters, [
      { field: "time", op: "range", from: "2026-10-25T12:00:00+02:00", to: "2026-10-25T10:00:00Z" },
    ]);
    expect(parsed).toEqual([
      {
        field: "time",
        op: "range",
        from: "2026-10-25T10:00:00.000Z",
        to: "2026-10-25T10:00:00.000Z",
      },
    ]);
    const input = [
      { field: "z", op: "in", values: ["b", "a"] },
      { field: "a", op: "eq", value: false },
    ];
    expect(canonicalCollectionFilters(input)).toEqual([
      input[1],
      { ...input[0], values: ["a", "b"] },
    ]);
    expect(input[0].values).toEqual(["b", "a"]);
  });
  test.each([
    [{ field: "n", op: "eq", value: Infinity }],
    [{ field: "t", op: "eq", value: "" }],
    [{ field: "t", op: "contains", value: "a".repeat(201) }],
    [{ field: "t", op: "isSet", value: 0 }],
    [{ field: "n", op: "range" }],
    [{ field: "n", op: "range", min: 2, max: 1 }],
    [{ field: "n", op: "range", min: "1" }],
    [{ field: "n", op: "range", from: "2026-02-30" }],
    [{ field: "d", op: "range", from: "2026-10-25T10:00:00" }],
    [{ field: "d", op: "range", from: "2026-10-25T11:00:00Z", to: "2026-10-25T12:00:00+02:00" }],
    [{ field: "s", op: "in", values: [] }],
    [{ field: "s", op: "in", values: ["a", "a"] }],
    [{ field: "s", op: "in", values: Array.from({ length: 51 }, (_, i) => String(i)) }],
    [
      { field: "x", op: "isSet" },
      { field: "x", op: "isNotSet" },
    ],
    Array.from({ length: 17 }, (_, i) => ({ field: `f${i}`, op: "isSet" })),
  ])("rejects invalid filter input %j", (...items) =>
    expect(v.safeParse(filters, items).success).toBe(false),
  );
  test("sort grammar keeps system controls and namespaces collisions", () => {
    for (const value of ["title", "-updatedAt", "publishedAt", "field:title", "-field:year"])
      expect(v.safeParse(sort, value).success).toBe(true);
    for (const value of ["author", "field:nested.child", "field:", "--title"])
      expect(v.safeParse(sort, value).success).toBe(false);
  });
  test("metadata validates configured targets independently of columns and detaches mapping", () => {
    const source = {
      kind: "collection",
      key: "posts",
      version: 1,
      blocks: [],
      fields: { text: field.text(), count: field.number() },
      listOptions: { searchableFields: ["text"], sortableFields: ["count"] },
    };
    const mapped = toContentModelDto(source);
    expect(v.safeParse(contentModelSchema, mapped).success).toBe(true);
    expect(mapped.listFields).toBeUndefined();
    source.listOptions.searchableFields.push("count");
    expect(mapped.listOptions.searchableFields).toEqual(["text"]);
    expect(v.safeParse(contentModelSchema, { ...mapped, kind: "page", path: "/" }).success).toBe(
      false,
    );
    expect(
      v.safeParse(contentModelSchema, { ...mapped, listOptions: { searchableFields: ["count"] } })
        .success,
    ).toBe(false);
    for (const invalid of [
      {},
      { unknown: [] },
      { sortableFields: [] },
      { sortableFields: ["text", "text"] },
      { filterableFields: Array.from({ length: 17 }, (_, i) => `f${i}`) },
    ])
      expect(v.safeParse(options, invalid).success).toBe(false);
    expect(v.safeParse(contentModelSchema, { ...mapped, listOptions: undefined }).success).toBe(
      true,
    );
  });
  test("metadata carries a default sort that names a sortable field or a system sort", () => {
    const source = {
      kind: "collection",
      key: "projects",
      version: 1,
      blocks: [],
      fields: { order: field.number(), text: field.text() },
      listOptions: { sortableFields: ["order"], defaultSort: "field:order" },
    };
    const mapped = toContentModelDto(source);
    expect(mapped.listOptions).toEqual({ sortableFields: ["order"], defaultSort: "field:order" });
    expect(v.safeParse(contentModelSchema, mapped).success).toBe(true);
    for (const valid of [
      { defaultSort: "title" },
      { sortableFields: ["order"], defaultSort: "-field:order" },
    ])
      expect(v.safeParse(options, valid).success).toBe(true);
    for (const invalid of [
      { defaultSort: "field:order" },
      { sortableFields: ["order"], defaultSort: "field:text" },
      { sortableFields: ["order"], defaultSort: "author" },
      { defaultSort: "-updatedAt" },
      { defaultSort: 1 },
    ])
      expect(v.safeParse(options, invalid).success, JSON.stringify(invalid)).toBe(false);
    expect(
      v.safeParse(contentModelSchema, {
        ...mapped,
        listOptions: { sortableFields: ["missing"], defaultSort: "field:missing" },
      }).success,
    ).toBe(false);
  });
});

test("effective capability identity ignores labels and columns but includes select choices", async () => {
  const { collectionCapabilityIdentity } = await import("./collection-queries.js");
  const source = {
    fields: { category: field.select({ options: ["a", "b"] }), text: field.text() },
    listOptions: { sortableFields: ["category", "text"], searchableFields: ["text"] },
    listFields: ["category"],
    label: "First",
  };
  const identity = collectionCapabilityIdentity(source);
  expect(
    collectionCapabilityIdentity({
      ...source,
      label: "Second",
      listFields: [],
      listOptions: { ...source.listOptions, sortableFields: ["text", "category"] },
    }),
  ).toBe(identity);
  expect(
    collectionCapabilityIdentity({
      ...source,
      fields: { ...source.fields, category: field.select({ options: ["a", "b", "c"] }) },
    }),
  ).not.toBe(identity);
  expect(
    collectionCapabilityIdentity({
      ...source,
      listOptions: { ...source.listOptions, searchableFields: [] },
    }),
  ).not.toBe(identity);
});

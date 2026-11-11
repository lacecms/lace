import { expect, test } from "vitest";
import { field, toFieldMetadata } from "@lacecms/content";
import {
  filterParityCases,
  filterParityFields,
  filterParityFilterableFields,
  filterParityUnlistedField,
} from "@lacecms/test-utils/filter-parity";
import {
  collectionFilterProblem,
  defaultCollectionSort,
  resolveCollectionListSearch,
} from "./collection-query.js";
import {
  CLOUDFLARE_LIST_QUERY_LIMITS,
  NODE_LIST_QUERY_LIMITS,
  type ContentModelDto,
} from "@lacecms/contracts";
const model: ContentModelDto = {
  key: "posts",
  kind: "collection",
  route: "/:slug",
  version: 1,
  blocks: [],
  fields: {
    hidden: { type: "text", required: false },
    n: { type: "number", required: false },
    flag: { type: "boolean", required: false },
  },
  listOptions: { sortableFields: ["hidden"], filterableFields: ["hidden", "n", "flag"] },
};
test("metadata resolves hidden fields and drops only unsupported or over-budget conditions", () => {
  const query = {
    q: "я".repeat(25),
    sort: "field:hidden" as const,
    status: "draft" as const,
    filters: [
      { field: "hidden", op: "contains" as const, value: "я".repeat(25) },
      { field: "flag", op: "eq" as const, value: false },
      { field: "n", op: "eq" as const, value: 0 },
    ],
  };
  const cloud = resolveCollectionListSearch(query, model, CLOUDFLARE_LIST_QUERY_LIMITS);
  expect(cloud.q).toBeUndefined();
  expect(cloud.sort).toBe(query.sort);
  expect(cloud.filters).toEqual([query.filters[1], query.filters[2]]);
  expect(resolveCollectionListSearch(query, model, NODE_LIST_QUERY_LIMITS).q).toBe(query.q);
  expect(
    resolveCollectionListSearch(query, { ...model, listOptions: undefined }).filters,
  ).toBeUndefined();
  expect(
    resolveCollectionListSearch(query, { ...model, listOptions: undefined }).sort,
  ).toBeUndefined();
  expect(collectionFilterProblem(model, { field: "n", op: "range", min: 2, max: 1 })).toBeDefined();
});

test("the model's own default sort is dropped from the URL search; other sorts stay", () => {
  const ordered: ContentModelDto = {
    ...model,
    listOptions: { sortableFields: ["hidden"], defaultSort: "field:hidden" },
  };
  expect(defaultCollectionSort(ordered)).toBe("field:hidden");
  expect(defaultCollectionSort(model)).toBe("-updatedAt");
  expect(resolveCollectionListSearch({ sort: "field:hidden" }, ordered).sort).toBeUndefined();
  expect(resolveCollectionListSearch({ sort: "-updatedAt" }, ordered).sort).toBe("-updatedAt");
  expect(resolveCollectionListSearch({ sort: "-field:hidden" }, ordered).sort).toBe(
    "-field:hidden",
  );
  // Without a configured default, -updatedAt is the default and stays out of the URL.
  expect(resolveCollectionListSearch({ sort: "-updatedAt" }, model).sort).toBeUndefined();
  expect(resolveCollectionListSearch({ sort: "title" }, model).sort).toBe("title");
});

test("the condition editor follows the shared filter parity table", () => {
  const parityModel: ContentModelDto = {
    key: "posts",
    kind: "collection",
    route: "/posts/:slug",
    version: 1,
    blocks: [],
    fields: Object.fromEntries(
      Object.entries({
        ...filterParityFields,
        [filterParityUnlistedField]: field.text(),
      }).map(([key, definition]) => [key, toFieldMetadata(definition)]),
    ),
    listOptions: { filterableFields: [...filterParityFilterableFields] },
  };
  expect(
    Object.fromEntries(
      filterParityCases.map((entry) => [
        entry.name,
        collectionFilterProblem(parityModel, entry.filter) === undefined,
      ]),
    ),
  ).toEqual(Object.fromEntries(filterParityCases.map((entry) => [entry.name, entry.accepted])));
});

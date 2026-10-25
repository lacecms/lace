import { expect, test } from "vitest";
import { resolveCollectionListSearch, collectionFilterProblem } from "./collection-query.js";
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

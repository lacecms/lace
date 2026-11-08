import { expect, test } from "vitest";
import { contentModelKey } from "@lacecms/domain";
import type { CollectionQueryField, CollectionFieldFilter } from "@lacecms/application";
import { collectionListPlan } from "./collection-list.js";

const cases: readonly { field: CollectionQueryField; filter: CollectionFieldFilter }[] = [
  {
    field: { key: "target", type: "text" },
    filter: { field: "target", op: "contains", value: "a_%" },
  },
  {
    field: { key: "target", type: "number" },
    filter: { field: "target", op: "range", min: 0, max: 5 },
  },
  {
    field: { key: "target", type: "boolean" },
    filter: { field: "target", op: "eq", value: false },
  },
  {
    field: { key: "target", type: "date" },
    filter: { field: "target", op: "range", from: "2026-01-01", to: "2026-12-31" },
  },
  {
    field: { key: "target", type: "datetime" },
    filter: {
      field: "target",
      op: "range",
      from: "2026-01-01T00:00:00Z",
      to: "2026-12-31T00:00:00Z",
    },
  },
];

test("list statements and bindings preserve every sort family", async () => {
  const statements = [];
  for (const { field, filter } of cases) {
    const { items, totals } = await collectionListPlan({
      modelKey: contentModelKey("posts"),
      limit: 10,
      sort: "field:target",
      listFields: ["target"],
      q: "hello",
      query: {
        sortableFields: [field],
        filterableFields: [field],
        searchableFields: [],
        filters: [filter],
      },
    });
    statements.push({ type: field.type, items, totals });
  }
  expect(statements).toMatchSnapshot();
});

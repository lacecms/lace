import { expect, test } from "vitest";
import { field } from "@lacecms/content";
import type { ContentModelDto } from "@lacecms/contracts";
import {
  cleanValue,
  fieldStartingValue,
  fieldStartingValues,
  moveItem,
  duplicateItem,
  newItemIdentity,
  snapshotBudget,
  draftItemValue,
} from "./composite-values.js";
const list = field.list({
  item: field.group({
    fields: {
      title: field.text(),
      children: field.list({ item: field.text(), defaultValue: ["a", "b"] }),
    },
  }),
});
const model = {
  fields: { items: list },
  blockDefinitions: [{ type: "cards", fields: { items: list } }],
} as unknown as ContentModelDto;
const values = { title: "Title", fields: {}, blocks: [] };
test("defaults preserve optional absence and explicit containers without aliases", () => {
  const group = field.group({
    fields: {
      enabled: field.boolean({ defaultValue: false }),
      count: field.number({ defaultValue: 0 }),
    },
  });
  expect(fieldStartingValue(group, undefined)).toBeUndefined();
  expect(fieldStartingValue(group, {})).toEqual({ enabled: false, count: 0 });
  expect(fieldStartingValue(field.list({ item: field.text(), defaultValue: ["x"] }), [])).toEqual(
    [],
  );
  expect(fieldStartingValues({ group }, { group: {}, unknown: "retained" })).toEqual({
    group: { enabled: false, count: 0 },
    unknown: "retained",
  });
  const document = { type: "doc", attrs: { value: null }, content: [] };
  expect(cleanValue({ absent: null, empty: {}, list: [false, 0, {}, [], null], document })).toEqual(
    { empty: {}, list: [false, 0, {}, [], null], document },
  );
});
test("item operations detach copies and identity never relies on equal values", () => {
  const items = [{ children: ["a"] }, { children: ["a"] }];
  const ids = items.map(newItemIdentity);
  expect(new Set(ids).size).toBe(2);
  expect(moveItem(ids, 1, 0)).toEqual([ids[1], ids[0]]);
  const copy = duplicateItem(items, 0);
  copy[1]!.children[0] = "changed";
  expect(items[0]!.children).toEqual(["a"]);
  expect(JSON.stringify(items)).not.toContain("item-");
});
test("budgets include nested defaults and hidden blocks, excluding rich-text", () => {
  const item = {};
  const blocks = Array.from({ length: 5 }, (_, i) => ({
    key: String(i),
    type: "cards",
    hidden: true,
    schemaVersion: 1,
    position: i,
    settings: {},
    data: { items: Array.from({ length: 30 }, () => item) },
  }));
  expect(
    snapshotBudget(model, {
      ...values,
      fields: { items: Array.from({ length: 16 }, () => item) },
      blocks,
    }).count,
  ).toBe(498);
  expect(
    snapshotBudget(model, {
      ...values,
      fields: { items: Array.from({ length: 17 }, () => item) },
      blocks,
    }).problem,
  ).toMatch(/500/);
  const scalarModel = {
    ...model,
    fields: { items: field.list({ item: field.text() }) },
    blockDefinitions: [],
  };
  expect(
    snapshotBudget(scalarModel, { ...values, fields: { items: Array(100).fill("a") } }).problem,
  ).toBeUndefined();
  expect(
    snapshotBudget(scalarModel, { ...values, fields: { items: Array(101).fill("a") } }).problem,
  ).toMatch(/100/);
  const rich = { ...model, fields: { body: field.richText() }, blockDefinitions: [] };
  expect(
    snapshotBudget(rich, {
      ...values,
      fields: { body: { type: "doc", content: Array(1000).fill({ type: "paragraph" }) } },
    }).count,
  ).toBe(0);
});
test("scalar insertion requires a valid value and group defaults are detached", () => {
  expect(draftItemValue(field.number({ min: 10 }))).toBeUndefined();
  expect(draftItemValue(field.text({ minLength: 1 }))).toBeUndefined();
  expect(draftItemValue(list.item)).toEqual({ children: ["a", "b"] });
});

test("entry budget accepts 499 and 500 and rejects 501 independently of invalid leaves", () => {
  const definition = {
    ...model,
    fields: {
      a: field.list({ item: field.number() }),
      b: field.list({ item: field.number() }),
      c: field.list({ item: field.number() }),
      d: field.list({ item: field.number() }),
      e: field.list({ item: field.number() }),
      f: field.list({ item: field.number() }),
    },
    blockDefinitions: [],
  };
  for (const count of [499, 500, 501]) {
    const result = snapshotBudget(definition, {
      ...values,
      fields: {
        a: Array(100).fill("invalid"),
        b: Array(100).fill(0),
        c: Array(100).fill(0),
        d: Array(100).fill(0),
        e: Array(99).fill(0),
        f: Array(count - 499).fill(0),
      },
    });
    expect(result.count).toBe(count);
    expect(!!result.problem).toBe(count > 500);
  }
  expect(
    snapshotBudget(
      {
        ...model,
        fields: { items: field.list({ item: field.text(), maxItems: 2 }) },
        blockDefinitions: [],
      },
      { ...values, fields: { items: ["a", "b", "c"] } },
    ).problem,
  ).toMatch(/2/);
});

test("descriptor-aware clearing distinguishes groups named type doc from rich-text documents", () => {
  const definition = field.group({
    fields: { type: field.text(), cleared: field.text(), body: field.richText() },
  });
  const body = { type: "doc", attrs: { value: null }, content: [] };
  expect(cleanValue({ type: "doc", cleared: null, body }, definition)).toEqual({
    type: "doc",
    body,
  });
});

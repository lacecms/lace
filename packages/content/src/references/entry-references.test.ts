import { expect, test } from "vitest";
import { defineBlock } from "../blocks/definition.js";
import { defineBlockRegistry } from "../blocks/registry.js";
import { MAX_JSON_BYTES, validateEntryAggregate } from "../entries/aggregate.js";
import { field } from "../fields/builders.js";
import { issueFrom } from "../test-support/content-test-helpers.js";
import {
  collectSnapshotEntryReferences,
  collectSnapshotInternalLinks,
} from "./entry-references.js";

const review = field.reference({ models: ["reviews"], defaultValue: "A/b" });

test("projects normalized defaults, hidden occurrences and stable block keys", () => {
  const card = field.group({
    defaultValue: {},
    fields: { show: field.boolean({ defaultValue: false }), review },
    visibility: { review: { field: "show", values: [true] } },
  });
  const block = defineBlock({ type: "review", version: 1, fields: { review } });
  const fields = {
    card,
    picks: field.list({ item: review, defaultValue: ["A/b", "entry:A%2Fb", "A/b"] }),
    link: field.url({ defaultValue: "entry:A%2Fb" }),
    plain: field.text({ defaultValue: "entry:A%2Fb" }),
  };
  const hidden = {
    key: "hidden-review",
    schemaVersion: 1,
    type: block.type,
    hidden: true,
    data: {},
  };
  const visible = { key: "visible-review", schemaVersion: 1, type: block.type, data: {} };
  const project = (blocks: readonly (typeof visible)[]) => {
    const normalized = validateEntryAggregate(
      { kind: "page", title: "Reviews", fields: {}, blocks },
      { kind: "page", fields, blocks: [block.type] },
      defineBlockRegistry([block]),
      "publish",
    );
    const sources = normalized.blocks.map((item) => ({ ...item, fields: block.fields }));
    const references = collectSnapshotEntryReferences(fields, normalized.fields, sources);
    expect(collectSnapshotInternalLinks(fields, normalized.fields, sources)).toEqual([
      { sourceKey: "$fields", area: "fields", pointer: "/link", targetId: "A/b", delivered: true },
    ]);
    return references;
  };
  const references = project([hidden, visible]);
  expect(
    references.map(({ purpose, sourceKey, pointer, targetId, delivered }) => [
      purpose,
      sourceKey,
      pointer,
      targetId,
      delivered,
    ]),
  ).toEqual([
    ["reference", "$fields", "/card/review", "A/b", false],
    ["reference", "$fields", "/picks/0", "A/b", true],
    ["reference", "$fields", "/picks/1", "entry:A%2Fb", true],
    ["reference", "$fields", "/picks/2", "A/b", true],
    ["url", "$fields", "/link", "A/b", true],
    ["reference", "hidden-review", "/review", "A/b", false],
    ["reference", "visible-review", "/review", "A/b", true],
  ]);
  expect(references[0]).toMatchObject({ area: "fields", models: ["reviews"] });
  expect(references[5]).toMatchObject({ area: "data", models: ["reviews"] });
  expect(project([visible, hidden]).slice(-2)).toEqual(references.slice(-2).toReversed());
});

test("escapes relative pointer segments at the structural traversal boundary", () => {
  expect(
    collectSnapshotEntryReferences(
      { "a~/b": field.list({ item: review }) },
      { "a~/b": ["opaque/id"] },
      [],
    ),
  ).toEqual([
    {
      purpose: "reference",
      models: ["reviews"],
      sourceKey: "$fields",
      area: "fields",
      pointer: "/a~0~1b/0",
      targetId: "opaque/id",
      delivered: true,
    },
  ]);
});

test.each(["draft", "publish"] as const)(
  "applies combined and independent snapshot limits in %s",
  (mode) => {
    const ids = Array.from({ length: 100 }, () => "A/b");
    const links = Array.from({ length: 100 }, () => "entry:A%2Fb");
    const list = field.list({ item: field.text() });
    const block = defineBlock({
      type: "review",
      version: 1,
      fields: { links: field.list({ item: field.url() }), review },
    });
    const fields = {
      picks: field.list({ item: review }),
      a: list,
      b: list,
      c: list,
      d: list,
      text: field.text(),
    };
    const validate = (linkCount: number, extra = {}, blockData = {}) =>
      validateEntryAggregate(
        {
          kind: "page",
          title: "Reviews",
          fields: { picks: ids, ...extra },
          blocks: [
            {
              key: "review",
              type: block.type,
              schemaVersion: 1,
              hidden: true,
              data: { links: links.slice(0, linkCount), ...blockData },
            },
          ],
        },
        { kind: "page", fields, blocks: [block.type] },
        defineBlockRegistry([block]),
        mode,
      );
    expect(validate(99, { a: ids, b: ids, c: ids, d: ["one"] }).blocks[0]?.data.review).toBe("A/b");
    expect(issueFrom(() => validate(100))).toMatchObject({
      code: "too_many_internal_links",
      path: ["blocks", 0, "data", "review"],
    });
    expect(
      issueFrom(() => validate(99, { a: ids, b: ids, c: ids, d: ["one", "two"] })),
    ).toMatchObject({ code: "too_many_list_items" });
    expect(issueFrom(() => validate(99, { picks: [...ids, "more"] }))).toMatchObject({
      code: "list_too_long",
      path: ["fields", "picks"],
    });
    expect(issueFrom(() => validate(99, { text: "x".repeat(MAX_JSON_BYTES) }))).toMatchObject({
      path: ["fields"],
    });
  },
);

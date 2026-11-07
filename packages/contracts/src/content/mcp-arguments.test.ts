// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import * as v from "valibot";
import { expect, test } from "vitest";

test("MCP envelopes reuse draft validation, typed filters and explicit revision without actor injection", async () => {
  const {
    mcpToolArgumentSchemas,
    toContractValidationIssues,
    toContentBlockInput,
    contentBlockSchema,
  } = await import("../index.js");
  const draft = { title: "Draft", fields: { nested: { values: [1, false, null] } }, blocks: [] };
  expect(v.parse(mcpToolArgumentSchemas.create_entry, { ...draft, modelKey: "posts" })).toEqual({
    ...draft,
    modelKey: "posts",
  });
  expect(
    v.safeParse(mcpToolArgumentSchemas.save_draft, { ...draft, entryId: "entry" }).success,
  ).toBe(false);
  expect(
    v.parse(mcpToolArgumentSchemas.save_draft, { ...draft, entryId: "entry", expectedRevision: 3 })
      .expectedRevision,
  ).toBe(3);
  for (const key of ["actor", "authority", "role", "userId"])
    expect(
      v.safeParse(mcpToolArgumentSchemas.create_entry, {
        ...draft,
        modelKey: "posts",
        [key]: { id: "admin" },
      }).success,
    ).toBe(false);
  const query = {
    modelKey: "posts",
    filters: [{ field: "title", op: "contains", value: "plain" }],
    limit: 50,
  };
  expect(v.parse(mcpToolArgumentSchemas.list_entries, query)).toEqual(query);
  for (const filters of [
    "[]",
    [{ field: "title", op: "contains", value: 1 }],
    [{ field: "title", op: "isSet", extra: true }],
  ])
    expect(v.safeParse(mcpToolArgumentSchemas.list_entries, { ...query, filters }).success).toBe(
      false,
    );
  const bad = v.safeParse(mcpToolArgumentSchemas.create_entry, {
    ...draft,
    modelKey: "posts",
    blocks: [
      {
        key: "block",
        position: 1000,
        type: "quote",
        schemaVersion: 1,
        data: {},
        secret: "do-not-repeat",
      },
    ],
  });
  expect(bad.success).toBe(false);
  const issues = toContractValidationIssues(bad.issues);
  expect(issues[0].path).toBe("/blocks/0/secret");
  expect(JSON.stringify(issues)).not.toContain("do-not-repeat");
  const block = v.parse(contentBlockSchema, {
    key: "block",
    position: 1000,
    type: "quote",
    schemaVersion: 1,
    data: {},
  });
  expect(toContentBlockInput(block)).toMatchObject({ key: "block", hidden: false, settings: {} });
});

test("MCP publication requires a revision and uses the REST idempotency key syntax", async () => {
  const { mcpToolArgumentSchemas } = await import("../index.js");
  const schema = mcpToolArgumentSchemas.publish_entry;
  expect(
    v.parse(schema, { entryId: "entry", expectedRevision: 1, idempotencyKey: "retry-key" }),
  ).toEqual({ entryId: "entry", expectedRevision: 1, idempotencyKey: "retry-key" });
  for (const input of [
    { entryId: "entry" },
    { entryId: "entry", expectedRevision: -1 },
    { entryId: "entry", expectedRevision: 1, actor: {} },
    { entryId: "entry", expectedRevision: 1, fields: {} },
    { entryId: "entry", expectedRevision: 1, idempotencyKey: "invalid\nkey" },
  ])
    expect(v.safeParse(schema, input).success).toBe(false);
});

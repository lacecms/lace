// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import * as v from "valibot";
import { expect, test } from "vitest";

test("internal-link queries, statuses and impact pages are strict and independently bounded", async () => {
  const c = {
    ...(await import("./entry-requests.js")),
    ...(await import("./links.js")),
  };
  const valid = (schema, value) => v.safeParse(schema, value).success;
  expect(v.parse(c.linkTargetQuerySchema, {})).toEqual({ limit: 20 });
  expect(v.parse(c.linkTargetQuerySchema, { search: "  A_%  ", limit: "50" })).toEqual({
    search: "A_%",
    limit: 50,
  });
  for (const value of [
    { limit: "0" },
    { limit: "51" },
    { limit: "01" },
    { status: "missing" },
    { search: "a".repeat(101) },
    { q: "term" },
    { after: "x".repeat(4097) },
  ])
    expect(valid(c.linkTargetQuerySchema, value), JSON.stringify(value)).toBe(false);
  const ids = Array.from({ length: 200 }, (_, i) => `id-${i}`);
  expect(valid(c.resolveLinkTargetsRequestSchema, { ids })).toBe(true);
  for (const bad of [[...ids, "201"], ["same", "same"], [""], ["bad\u0000"], ["\ud800"]])
    expect(valid(c.resolveLinkTargetsRequestSchema, { ids: bad })).toBe(false);
  expect(valid(c.resolveLinkTargetsRequestSchema, { ids: ["a /?日本"], extra: true })).toBe(false);
  const source = {
    action: "delete",
    sourceEntryId: "source",
    snapshotId: "draft",
    locationsAfter: "cursor",
  };
  expect(valid(c.linkImpactQuerySchema, source)).toBe(true);
  for (const bad of [
    {},
    { action: "publish" },
    { ...source, after: "source-page" },
    { action: "delete", sourceEntryId: "source" },
    { action: "delete", locationsAfter: "cursor" },
    { action: "delete", unknown: true },
  ])
    expect(valid(c.linkImpactQuerySchema, bad)).toBe(false);
  const status = {
    id: "id",
    state: "published",
    modelKey: "posts",
    modelKind: "collection",
    title: "Title",
    path: "/post",
  };
  expect(valid(c.linkTargetStatusesSchema, { id: status })).toBe(true);
  expect(valid(c.linkTargetStatusesSchema, { other: status })).toBe(false);
  expect(valid(c.linkTargetStatusSchema, { id: "id", state: "missing", title: "fabricated" })).toBe(
    false,
  );
  expect(
    valid(c.routableLinkTargetSchema, { id: "g", state: "non-routable", modelKey: "global" }),
  ).toBe(false);
  const location = {
    sourceKey: "$fields",
    area: "fields",
    pointer: "/nested/0/url",
    delivered: true,
  };
  const page = {
    mode: "sources",
    hasPublishedUsages: true,
    receipt: "receipt",
    sources: [
      {
        entryId: "source",
        snapshotId: "snapshot",
        modelKey: "posts",
        title: "Source",
        phase: "published",
        locations: [location],
      },
    ],
  };
  expect(valid(c.linkImpactPageSchema, page)).toBe(true);
  expect(
    valid(c.linkImpactPageSchema, {
      ...page,
      sources: [{ ...page.sources[0], locations: Array(11).fill(location) }],
    }),
  ).toBe(false);
  expect(valid(c.linkImpactPageSchema, { ...page, sources: Array(51).fill(page.sources[0]) })).toBe(
    false,
  );
  expect(valid(c.linkUsageLocationSchema, { ...location, area: "settings" })).toBe(false);
  for (const linkImpact of [
    { receipt: "receipt", acknowledgePublishedLinks: false },
    { receipt: "receipt" },
    { receipt: "r".repeat(4097), acknowledgePublishedLinks: true },
    { receipt: "receipt", acknowledgePublishedLinks: true, action: "delete" },
  ])
    expect(valid(c.deleteContentEntryRequestSchema, { linkImpact })).toBe(false);
  expect(
    valid(c.deleteContentEntryRequestSchema, {
      linkImpact: { receipt: "receipt", acknowledgePublishedLinks: true },
    }),
  ).toBe(true);
});

// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
  adminContentEntrySchema,
  contentEntryListQuerySchema,
  contentEntryListSchema,
  contentEntrySchema,
  contentEntrySummarySchema,
  toAdminContentEntryDto,
  toContentEntryDto,
  toIsoTimestamp,
} from "../index.js";
import { timestamp, actor, entry } from "../test-support/rest-fixtures.js";

describe("admin entry list contracts", () => {
  const summary = {
    draftRevision: 2,
    id: "entry-1",
    listValues: { author: "Lace", featured: true, rank: 3 },
    modelKey: "posts",
    status: "draft",
    title: "Welcome",
    updatedAt: toIsoTimestamp(timestamp),
    updatedBy: { displayName: "Editor", id: "actor-1" },
  };
  const publishedFields = {
    publishedAt: toIsoTimestamp(timestamp),
    publishedSnapshotId: "snapshot-published-1",
  };
  test("accepts consistent summaries for every status", () => {
    expect(v.parse(contentEntrySummarySchema, summary)).toEqual(summary);
    for (const status of ["published", "changed"]) {
      expect(
        v.parse(contentEntrySummarySchema, { ...summary, ...publishedFields, status }),
      ).toMatchObject({ status });
    }
  });
  test("rejects inconsistent status, non-scalar list values, and missing totals", () => {
    for (const invalid of [
      { ...summary, publishedAt: toIsoTimestamp(timestamp) },
      { ...summary, publishedSnapshotId: "snapshot-published-1" },
      { ...summary, status: "changed", publishedAt: toIsoTimestamp(timestamp) },
      { ...summary, status: "published" },
      { ...summary, status: "archived" },
      { ...summary, listValues: { body: { type: "doc" } } },
      { ...summary, listValues: { tags: ["a"] } },
      { ...summary, listValues: { empty: null } },
      { ...summary, updatedBy: { displayName: "", id: "actor-1" } },
      { ...summary, updatedBy: { id: "actor-1" } },
    ]) {
      expect(v.safeParse(contentEntrySummarySchema, invalid).success).toBe(false);
    }
    expect(v.safeParse(contentEntryListSchema, { items: [summary] }).success).toBe(false);
    expect(
      v.safeParse(contentEntryListSchema, {
        items: [summary],
        totals: { all: -1, changed: 0, draft: 0, published: 0 },
      }).success,
    ).toBe(false);
  });
  test("validates list query parameters", () => {
    expect(
      v.parse(contentEntryListQuerySchema, {
        extra: "ignored",
        limit: "25",
        q: "  launch  ",
        sort: "-title",
        status: "changed",
      }),
    ).toEqual({ limit: "25", q: "launch", sort: "-title", status: "changed" });
    expect(v.parse(contentEntryListQuerySchema, { q: " ".repeat(300) })).toEqual({ q: "" });
    for (const invalid of [
      { status: "archived" },
      { sort: "author" },
      { q: "x".repeat(201) },
      { limit: "0" },
      { after: "" },
    ]) {
      expect(v.safeParse(contentEntryListQuerySchema, invalid).success).toBe(false);
    }
  });
  test("admin entries name the last editor while public entries stay unchanged", () => {
    const adminDto = toAdminContentEntryDto(entry, { displayName: "Editor", id: actor.id });
    expect(v.parse(adminContentEntrySchema, adminDto)).toEqual(adminDto);
    expect(adminDto.updatedBy).toEqual({ displayName: "Editor", id: "actor-1" });
    expect(v.safeParse(contentEntrySchema, adminDto).success).toBe(false);
    expect(v.safeParse(adminContentEntrySchema, toContentEntryDto(entry)).success).toBe(false);
    expect(JSON.stringify(toContentEntryDto(entry))).not.toContain("displayName");
  });
});

import { SLUG_PATTERN } from "../index.js";

test("entry slug query grammar agrees with the portable slug pattern", () => {
  const pipe = contentEntryListQuerySchema.entries.slug.wrapped.pipe;
  const grammar = pipe.find((action) => action.type === "regex");
  if (grammar?.type !== "regex") throw new Error("Missing slug query regex");
  const values = [
    "release-notes",
    "a",
    "123",
    "a".repeat(100),
    "Release_Notes",
    "release_notes",
    "release--notes",
    "-release",
    "",
    "release-notes\n",
    "a".repeat(101),
  ];
  for (const value of values) {
    expect(grammar.requirement.test(value), JSON.stringify(value)).toBe(SLUG_PATTERN.test(value));
    expect(v.safeParse(contentEntryListQuerySchema, { slug: value }).success).toBe(
      value.length <= 100 && SLUG_PATTERN.test(value),
    );
  }
});

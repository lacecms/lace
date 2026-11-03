// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import { unixMilliseconds } from "@lacecms/domain";
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
  mediaDetailSchema,
  mediaDeleteQuerySchema,
  mediaListQuerySchema,
  mediaMetadataSchema,
  normalizeMediaTag,
  toIsoTimestamp,
  toMediaDetailDto,
} from "../index.js";
import { timestamp, published } from "../test-support/rest-fixtures.js";

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
  test("validates media list queries, uploader summaries, and bounded usage details", () => {
    expect(
      v.parse(mediaListQuerySchema, { q: "  Cover ", sort: "-size", type: "image/png", x: "1" }),
    ).toMatchObject({ q: "Cover", sort: "-size", type: "image/png" });
    expect(v.parse(mediaListQuerySchema, { type: "image/gif" })).toMatchObject({
      type: "image/gif",
    });
    for (const invalid of [
      { q: "x".repeat(201) },
      { type: "image/svg+xml" },
      { sort: "width" },
      { limit: "0" },
    ]) {
      expect(v.safeParse(mediaListQuerySchema, invalid).success).toBe(false);
    }
    expect(v.parse(mediaDeleteQuerySchema, { detach: "drafts" })).toEqual({ detach: "drafts" });
    expect(v.parse(mediaDeleteQuerySchema, {})).toEqual({});
    for (const invalid of [{ detach: "all" }, { detach: ["drafts", "drafts"] }, { detach: "" }]) {
      expect(v.safeParse(mediaDeleteQuerySchema, invalid).success).toBe(false);
    }

    const source = {
      createdAt: unixMilliseconds(Date.UTC(2026, 0, 1)),
      createdBy: { displayName: "Ada", id: "editor-1" },
      filename: "cover.png",
      height: 400,
      id: "media-1",
      mimeType: "image/png",
      size: 42,
      status: "active",
      updatedAt: unixMilliseconds(Date.UTC(2026, 0, 1)),
      usage: [
        {
          entryId: "post-1",
          locations: [
            { field: "cover", source: "field", states: ["draft", "published"] },
            {
              blockKey: "hero-1",
              blockType: "hero",
              field: "image",
              source: "block",
              states: ["published"],
            },
          ],
          modelKey: "posts",
          slug: "welcome",
          status: "changed",
          title: "Welcome",
        },
      ],
      usageCount: 1,
      width: 200,
    };
    const detail = toMediaDetailDto(source, "https://lace.example/api/v1/public/media/media-1");
    expect(v.parse(mediaDetailSchema, detail)).toEqual(detail);
    expect(detail.createdBy).toEqual({ displayName: "Ada", id: "editor-1" });
    expect(v.safeParse(mediaMetadataSchema, { ...detail, usage: undefined }).success).toBe(false);

    const { usage: _usage, ...metadata } = detail;
    expect(v.parse(mediaMetadataSchema, metadata)).toEqual(metadata);
    for (const invalid of [
      { ...metadata, createdBy: "editor-1" },
      { ...metadata, usageCount: -1 },
      { ...metadata, width: 0 },
    ]) {
      expect(v.safeParse(mediaMetadataSchema, invalid).success).toBe(false);
    }

    const [entry] = detail.usage;
    const location = entry.locations[0];
    for (const invalid of [
      { ...detail, usage: Array.from({ length: 51 }, () => entry) },
      { ...detail, usage: [{ ...entry, locations: [] }] },
      { ...detail, usage: [{ ...entry, locations: [{ ...location, states: [] }] }] },
      {
        ...detail,
        usage: [{ ...entry, locations: [{ ...location, states: ["draft", "draft"] }] }],
      },
      { ...detail, usage: [{ ...entry, locations: [{ ...location, source: "block" }] }] },
      { ...detail, usage: [{ ...entry, status: "archived" }] },
    ]) {
      expect(v.safeParse(mediaDetailSchema, invalid).success).toBe(false);
    }
  });
});

describe("media metadata contracts", async () => {
  const {
    mediaEntityTag,
    resolveMediaPrecondition,
    toUpdateMediaMetadataResultDto,
    updateMediaMetadataRequestSchema,
    updateMediaMetadataResultSchema,
  } = await import("../index.js");
  const source = {
    createdAt: unixMilliseconds(1_700_000_000_000),
    createdBy: { displayName: "Ada", id: "user-1" },
    filename: "bike.png",
    height: 600,
    id: "media-1",
    mimeType: "image/png",
    size: 12,
    status: "active",
    updatedAt: unixMilliseconds(1_791_647_444_998),
    usageCount: 0,
    width: 800,
  };
  const url = "https://cms.example/api/v1/public/media/media-1";
  const issuePaths = (input) => {
    const result = v.safeParse(updateMediaMetadataRequestSchema, input);
    return result.success
      ? []
      : result.issues.map((issue) =>
          (issue.path ?? []).map((segment) => `/${String(segment.key)}`).join(""),
        );
  };
  test("clients share the server tag normalization", () => {
    expect(normalizeMediaTag(" Cover-Shot ")).toBe("cover-shot");
    for (const invalid of ["summer trip", "", "x".repeat(41), "a\n"]) {
      expect(normalizeMediaTag(invalid)).toBeUndefined();
    }
  });
});

test("ASCII media tag contracts normalize input and preserve precise issue pointers", async () => {
  const c = await import("../index.js");
  expect(v.parse(c.mediaListQuerySchema, { tag: [" Birch ", "ibiza", "BIRCH"] }).tag).toEqual([
    "birch",
    "ibiza",
  ]);
  expect(v.parse(c.mediaListQuerySchema, { tag: "Birch" }).tag).toEqual(["birch"]);
  expect(
    v.parse(c.updateMediaMetadataRequestSchema, { tags: [" Project-2026 ", "project-2026"] }),
  ).toEqual({ tags: ["project-2026"] });
  expect(v.parse(c.mediaTagCatalogQuerySchema, { q: " Re ", limit: "100" })).toMatchObject({
    q: "re",
  });
  for (const [schema, input, path] of [
    [c.mediaListQuerySchema, { tag: ["a", "a b"] }, "tag.1"],
    [c.mediaListQuerySchema, { tag: Array(6).fill("a") }, "tag"],
    [c.updateMediaMetadataRequestSchema, { tags: ["ok", "Выставка"] }, "tags.1"],
    [
      c.updateMediaMetadataRequestSchema,
      { tags: Array.from({ length: 21 }, (_, i) => `t-${i}`) },
      "tags.20",
    ],
    [c.updateMediaMetadataRequestSchema, { tags: ["a".repeat(201)] }, "tags.0"],
    [c.mediaTagCatalogQuerySchema, { q: "a b" }, "q"],
  ]) {
    const parsed = v.safeParse(schema, input);
    expect(parsed.success).toBe(false);
    expect(parsed.issues.map(v.getDotPath)).toContain(path);
  }
  expect(
    v.safeParse(c.mediaTagCatalogSchema, { items: [{ tag: "bad tag", count: 1 }] }).success,
  ).toBe(false);
  expect(v.safeParse(c.mediaTagCatalogSchema, { items: [{ tag: "a", count: 0 }] }).success).toBe(
    false,
  );
  expect(v.safeParse(c.mediaMetadataSchema, {}).success).toBe(false);
});

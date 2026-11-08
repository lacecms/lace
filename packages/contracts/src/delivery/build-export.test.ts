// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import {
  BuildExportVersionChangedError,
  actorId,
  contentEntryId,
  contentSnapshotId,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { classifyError } from "../errors/classification.js";
import { errorEnvelopeSchema } from "../errors/envelope.js";
import { mediaUrl } from "../media/mappers.js";
import {
  toBuildExportContinuationPageDto,
  toBuildExportFirstPageDto,
} from "./build-export-mappers.js";
import {
  buildExportSchema,
  buildExportContinuationPageSchema,
  buildExportFirstPageSchema,
  buildExportQuerySchema,
  MAX_BUILD_EXPORT_PAGE_SIZE,
} from "./build-export.js";
import { tolerantPublicSchemas } from "./tolerant.js";

describe("paged build export contract", () => {
  const publishedAt = unixMilliseconds(Date.UTC(2026, 9, 1));
  const snapshot = (id, fields) => ({
    blocks: [],
    createdAt: publishedAt,
    entryId: contentEntryId(id),
    fields,
    id: contentSnapshotId(`${id}-published`),
    revision: 1,
    title: id,
    updatedAt: publishedAt,
    updatedBy: { id: actorId("editor"), role: "editor" },
  });
  const contentEntry = (id, kind, fields = {}) => {
    const value = snapshot(id, fields);
    return {
      draft: { ...value, state: "draft" },
      id: contentEntryId(id),
      model:
        kind === "global"
          ? { key: id, kind }
          : { key: "posts", kind: "collection", route: "/blog/:slug" },
      published: { ...value, state: "published" },
    };
  };
  const mediaItem = (id) => ({
    createdAt: publishedAt,
    createdBy: actorId("editor"),
    filename: `${id}.png`,
    id: mediaId(id),
    mimeType: "image/png",
    size: 1,
    status: "active",
    storageKey: `media/${id}`,
    updatedAt: publishedAt,
  });
  const urlFor = (id) => mediaUrl("https://lace.example/", id);
  test("first and continuation pages carry their own keys", () => {
    const first = toBuildExportFirstPageDto(
      {
        entries: [{ entry: contentEntry("a", "collection"), media: [mediaItem("m1")], path: "/a" }],
        globals: [{ entry: contentEntry("settings", "global"), media: [mediaItem("m2")] }],
        nextCursor: "cursor-1",
        version: 7,
      },
      urlFor,
    );
    expect(v.parse(buildExportFirstPageSchema, first)).toEqual(first);
    expect(first).toMatchObject({
      formatVersion: 2,
      globals: [{ id: "settings" }],
      nextCursor: "cursor-1",
      seo: { defaults: null, models: {} },
      version: 7,
    });
    expect(Object.keys(first.media)).toEqual(["m1", "m2"]);

    const continuation = toBuildExportContinuationPageDto(
      { entries: [{ entry: contentEntry("b", "collection"), media: [], path: "/b" }], version: 7 },
      urlFor,
    );
    expect(v.parse(buildExportContinuationPageSchema, continuation)).toEqual(continuation);
    expect(continuation).not.toHaveProperty("nextCursor");
    expect(continuation).not.toHaveProperty("globals");
    expect(continuation).not.toHaveProperty("seo");
    expect(() =>
      toBuildExportContinuationPageDto({ entries: [], globals: [], version: 7 }, urlFor),
    ).toThrow(TypeError);

    for (const key of ["globals", "seo"]) {
      const { [key]: _omitted, ...missing } = first;
      expect(v.safeParse(buildExportFirstPageSchema, missing).success, key).toBe(false);
      expect(v.safeParse(tolerantPublicSchemas.buildExportFirstPage, missing).success, key).toBe(
        false,
      );
      expect(
        v.safeParse(buildExportContinuationPageSchema, { ...continuation, [key]: first[key] })
          .success,
        key,
      ).toBe(false);
    }
    // The assembled export never carries a cursor.
    expect(v.safeParse(buildExportSchema, first).success).toBe(false);
  });
  test("the query accepts only a cursor and a bounded limit", () => {
    expect(MAX_BUILD_EXPORT_PAGE_SIZE).toBe(100);
    expect(v.parse(buildExportQuerySchema, {})).toEqual({});
    expect(v.parse(buildExportQuerySchema, { after: "abc", limit: "100" })).toEqual({
      after: "abc",
      limit: 100,
    });
    expect(v.parse(buildExportQuerySchema, { limit: "1" })).toEqual({ limit: 1 });
    for (const query of [
      { limit: "0" },
      { limit: "101" },
      { limit: "-1" },
      { limit: "1.5" },
      { limit: "01" },
      { limit: "abc" },
      { after: "" },
      { after: "x".repeat(4_097) },
      { cursor: "abc" },
      { after: "abc", sort: "path" },
    ]) {
      expect(v.safeParse(buildExportQuerySchema, query).success, JSON.stringify(query)).toBe(false);
    }
  });
  test("a changed published state maps to a 409 envelope with versions", () => {
    const classified = classifyError(new BuildExportVersionChangedError(4, 5));
    expect(classified).toEqual({
      body: {
        error: {
          code: "BUILD_EXPORT_VERSION_CHANGED",
          details: { actualVersion: 5, expectedVersion: 4 },
          message:
            "Published content changed during the build export. Restart from the first page.",
        },
      },
      status: 409,
    });
    expect(v.parse(errorEnvelopeSchema, classified.body)).toEqual(classified.body);
  });
});

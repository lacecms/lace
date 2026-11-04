// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import { contentEntryId, mediaId, siteBuildId } from "@lacecms/domain";
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
  buildExportSchema,
  publicGlobalContentSchema,
  toPublicGlobalContentDto,
  contentEntryListSchema,
  contentEntrySchema,
  contentModelListSchema,
  toUnpublishContentEntryResultDto,
  unpublishContentEntryResultSchema,
  fromIsoTimestamp,
  mediaListSchema,
  mediaMetadataSchema,
  mediaUrl,
  packageName,
  publishContentEntryResultSchema,
  siteBuildSchema,
  toBuildExportDto,
  toContentEntryDto,
  toContentModelDto,
  toIsoTimestamp,
  toMediaMetadataDto,
  toPublishContentEntryResultDto,
  toSiteBuildDto,
} from "./index.js";
import { timestamp, actor, published, entry } from "./test-support/rest-fixtures.js";

describe("shared REST contract DTOs", () => {
  test("exports its package identity", () => expect(packageName).toBe("@lacecms/contracts"));
  test("round-trips portable entries, exports, media, builds, and timestamps", () => {
    const entryDto = toContentEntryDto(entry);
    expect(v.parse(contentEntrySchema, entryDto)).toEqual(entryDto);
    expect(
      v.parse(contentEntryListSchema, {
        items: [
          {
            draftRevision: 4,
            id: "entry-1",
            listValues: { author: "Lace" },
            modelKey: "posts",
            publishedAt: toIsoTimestamp(timestamp),
            publishedSnapshotId: "snapshot-published-1",
            slug: "welcome",
            status: "published",
            title: "Welcome",
            updatedAt: toIsoTimestamp(timestamp),
            updatedBy: { displayName: "Editor", id: "actor-1" },
          },
        ],
        nextCursor: "opaque-next-page",
        totals: { all: 1, changed: 0, draft: 0, published: 1 },
      }),
    ).toMatchObject({ items: [{ id: "entry-1" }], nextCursor: "opaque-next-page" });

    const exportDto = toBuildExportDto(
      { entries: [{ entry, media: [], path: "/blog/welcome" }], version: 7 },
      (id) => mediaUrl("https://lace.example/", id),
    );
    expect(v.parse(buildExportSchema, exportDto)).toEqual(exportDto);

    const mediaDto = toMediaMetadataDto(
      {
        createdAt: timestamp,
        createdBy: { displayName: "Ada", id: actor.id },
        filename: "cover.png",
        height: 600,
        id: mediaId("media-1"),
        mimeType: "image/png",
        size: 42,
        status: "active",
        storageKey: "private/media-1",
        updatedAt: timestamp,
        usageCount: 2,
        width: 800,
      },
      "https://lace.example/api/v1/public/media/media-1",
    );
    expect(v.parse(mediaMetadataSchema, mediaDto)).toEqual(mediaDto);
    expect(mediaDto).not.toHaveProperty("storageKey");
    expect(v.parse(mediaListSchema, { items: [mediaDto], nextCursor: "media-page" })).toEqual({
      items: [mediaDto],
      nextCursor: "media-page",
    });
    expect(mediaUrl("https://lace.example/base/", "media/a?x=y")).toBe(
      "https://lace.example/base/api/v1/public/media/media%2Fa%3Fx%3Dy",
    );

    const buildDto = toSiteBuildDto({
      id: siteBuildId("build-1"),
      publishedSnapshotId: published.id,
      requestedAt: timestamp,
      requestedBy: actor.id,
      status: "pending",
      targetVersion: 7,
    });
    expect(v.parse(siteBuildSchema, buildDto)).toEqual(buildDto);

    const publishedResult = toPublishContentEntryResultDto({
      build: { status: "queued", targetVersion: 7 },
      entry,
      publication: "published",
      updatedBy: { displayName: "Editor", id: actor.id },
    });
    const adminEntryDto = publishedResult.entry;
    expect(v.parse(publishContentEntryResultSchema, publishedResult)).toEqual(publishedResult);
    expect(
      v.parse(publishContentEntryResultSchema, {
        build: { status: "queued", targetVersion: 7 },
        entry: adminEntryDto,
        publication: "published",
      }),
    ).toMatchObject({ build: { status: "queued" } });
    expect(
      v.parse(publishContentEntryResultSchema, {
        build: { status: "not-dispatched" },
        entry: adminEntryDto,
        publication: "replayed",
      }),
    ).toMatchObject({ publication: "replayed" });
    const { published: _published, ...draftOnlyEntry } = entry;
    const unpublishedResult = toUnpublishContentEntryResultDto({
      build: { status: "queued", targetVersion: 8 },
      entry: draftOnlyEntry,
      unpublication: "unpublished",
      updatedBy: { displayName: "Editor", id: actor.id },
    });
    expect(unpublishedResult.entry).not.toHaveProperty("published");
    expect(v.parse(unpublishContentEntryResultSchema, unpublishedResult)).toEqual(
      unpublishedResult,
    );
    expect(
      v.parse(unpublishContentEntryResultSchema, {
        build: { status: "not-dispatched" },
        entry: unpublishedResult.entry,
        unpublication: "replayed",
      }),
    ).toMatchObject({ unpublication: "replayed" });
    expect(() =>
      v.parse(unpublishContentEntryResultSchema, {
        ...unpublishedResult,
        publication: "published",
      }),
    ).toThrow();

    const modelDto = toContentModelDto({
      blocks: ["hero"],
      fields: { author: { required: false, type: "text" } },
      key: "posts",
      kind: "collection",
      label: "Posts",
      route: "/blog/:slug",
      version: 1,
    });
    expect(v.parse(contentModelListSchema, { items: [modelDto] })).toEqual({
      items: [modelDto],
      listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
    });
    expect(fromIsoTimestamp(toIsoTimestamp(timestamp))).toBe(timestamp);
  });
});

describe("admin entry list contracts", () => {
  test("global models, entries, public globals, and exports have explicit contracts", () => {
    const fields = { siteName: { required: true, type: "text" } };
    const global = { blocks: [], fields, key: "settings", kind: "global", version: 1 };
    const dto = toContentModelDto(global);
    expect(dto).not.toHaveProperty("path");
    expect(dto).not.toHaveProperty("route");
    expect(v.parse(contentModelListSchema, { items: [dto] })).toEqual({
      items: [dto],
      listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
    });
    for (const invalid of [
      { ...global, path: "/settings" },
      { ...global, route: "/settings/:slug" },
      { ...global, listFields: ["siteName"] },
      { ...global, kind: "singleton" },
    ]) {
      expect(v.safeParse(contentModelListSchema, { items: [invalid] }).success).toBe(false);
    }

    const globalEntry = {
      ...entry,
      id: contentEntryId("settings"),
      model: { key: "settings", kind: "global" },
    };
    const entryDto = toContentEntryDto(globalEntry);
    expect(entryDto.model).toEqual({ key: "settings", kind: "global" });
    expect(v.parse(contentEntrySchema, entryDto)).toEqual(entryDto);
    expect(
      v.safeParse(contentEntrySchema, {
        ...entryDto,
        model: { key: "settings", kind: "global", path: "/" },
      }).success,
    ).toBe(false);

    const urlFor = (id) => mediaUrl("https://lace.example/", id);
    const publicDto = toPublicGlobalContentDto(
      { entry: globalEntry, media: [{ id: "media-1", mimeType: "image/png" }] },
      urlFor,
    );
    expect(publicDto.global).toEqual({
      internalLinks: [],
      blocks: published.blocks.map(({ hidden: _hidden, ...value }) => value),
      fields: published.fields,
      id: "settings",
      modelKey: "settings",
      publishedAt: toIsoTimestamp(timestamp),
    });
    expect(Object.keys(publicDto.media)).toEqual(["media-1"]);
    expect(v.parse(publicGlobalContentSchema, publicDto)).toEqual(publicDto);
    for (const extra of [{ path: "/" }, { draft: {} }, { title: "Settings" }, { slug: "x" }]) {
      expect(
        v.safeParse(publicGlobalContentSchema, {
          ...publicDto,
          global: { ...publicDto.global, ...extra },
        }).success,
      ).toBe(false);
    }

    const exportDto = toBuildExportDto(
      {
        entries: [
          { entry, media: [{ id: "media-2", mimeType: "image/png" }], path: "/blog/welcome" },
        ],
        globals: [{ entry: globalEntry, media: [{ id: "media-1", mimeType: "image/png" }] }],
        version: 3,
      },
      urlFor,
    );
    expect(exportDto.globals.map((item) => item.modelKey)).toEqual(["settings"]);
    expect(Object.keys(exportDto.media)).toEqual(["media-1", "media-2"]);
    expect(v.parse(buildExportSchema, exportDto)).toEqual(exportDto);
    const { globals: _globals, ...legacy } = exportDto;
    expect(v.parse(buildExportSchema, legacy).globals).toEqual([]);
  });
});

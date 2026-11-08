// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import { blockKey, mediaId } from "@lacecms/domain";
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { toContentEntryDto } from "../content/entry-mappers.js";
import { mediaUrl } from "../media/mappers.js";
import { contentMetadataOpenApi } from "../openapi/field-openapi.js";
import { toIsoTimestamp } from "../shared/primitives.js";
import { toPublicContentEntryDto, toPublicContentListDto } from "./public-mappers.js";
import {
  publicContentEntrySchema,
  publicContentListSchema,
  publicMediaDictionarySchema,
} from "./public.js";
import { timestamp, draft, published, entry } from "../test-support/rest-fixtures.js";

describe("public delivery DTOs", () => {
  const blocks = [
    {
      data: { text: "Second" },
      hidden: false,
      key: blockKey("b"),
      position: 1,
      schemaVersion: 1,
      settings: {},
      type: "quote",
    },
    {
      data: { media: "media-b" },
      hidden: false,
      key: blockKey("a"),
      position: 0,
      schemaVersion: 2,
      settings: {},
      type: "image",
    },
  ];
  const delivered = ({ hidden: _hidden, ...value }) => value;
  const publicEntry = {
    ...entry,
    draft: { ...draft, title: "DRAFT ONLY" },
    published: { ...published, blocks },
  };
  const described = {
    alt: "Office",
    caption: "Our office",
    focalPoint: { x: 0.25, y: 0.4 },
    height: 900,
    id: mediaId("media-b"),
    mimeType: "image/jpeg",
    width: 1600,
  };
  const bare = { id: mediaId("media-a"), mimeType: "image/png" };
  const urlFor = (id) => mediaUrl("https://lace.example/base/", id);
  test("returns the published entry with ordered blocks and resolved media", () => {
    const dto = toPublicContentEntryDto(
      { entry: publicEntry, media: [described, bare, described], path: "/blog/welcome" },
      urlFor,
    );
    expect(v.parse(publicContentEntrySchema, dto)).toEqual(dto);
    expect(dto.entry).toEqual({
      internalLinks: [],
      blocks: [delivered(blocks[1]), delivered(blocks[0])],
      fields: draft.fields,
      id: "entry-1",
      modelKey: "posts",
      path: "/blog/welcome",
      publishedAt: toIsoTimestamp(timestamp),
      slug: "welcome",
      title: "Welcome",
    });
    expect(JSON.stringify(dto)).not.toContain("DRAFT ONLY");
    expect(Object.keys(dto.media)).toEqual(["media-a", "media-b"]);
    expect(dto.media["media-a"]).toEqual({
      alt: null,
      caption: null,
      focalPoint: null,
      height: null,
      id: "media-a",
      mimeType: "image/png",
      url: "https://lace.example/base/api/v1/public/media/media-a",
      width: null,
    });
    expect(dto.media["media-b"]).toMatchObject({
      alt: "Office",
      caption: "Our office",
      focalPoint: { x: 0.25, y: 0.4 },
      height: 900,
      width: 1600,
    });
  });
  test("merges the media of a collection page", () => {
    const dto = toPublicContentListDto(
      {
        items: [
          { entry: publicEntry, media: [described], path: "/blog/welcome" },
          { entry: publicEntry, media: [described, bare], path: "/blog/other" },
        ],
        nextCursor: "next",
      },
      urlFor,
    );
    expect(v.parse(publicContentListSchema, dto)).toEqual(dto);
    expect(dto.items.map((item) => item.path)).toEqual(["/blog/welcome", "/blog/other"]);
    expect(Object.keys(dto.media)).toEqual(["media-a", "media-b"]);
  });
  test("rejects legacy and malformed public payloads", () => {
    const dto = toPublicContentEntryDto(
      { entry: publicEntry, media: [described], path: "/blog/welcome" },
      urlFor,
    );
    expect(() =>
      v.parse(publicContentEntrySchema, { entry: toContentEntryDto(entry), path: "/blog/welcome" }),
    ).toThrow();
    expect(() =>
      v.parse(publicContentEntrySchema, { ...dto, entry: { ...dto.entry, draft: {} } }),
    ).toThrow();
    expect(() =>
      v.parse(publicContentEntrySchema, { ...dto, entry: { ...dto.entry, model: {} } }),
    ).toThrow();
    expect(() =>
      v.parse(publicMediaDictionarySchema, { other: { ...dto.media["media-b"] } }),
    ).toThrow();
    expect(() =>
      v.parse(publicMediaDictionarySchema, {
        "media-b": { ...dto.media["media-b"], focalPoint: { x: 1.5, y: 0 } },
      }),
    ).toThrow();
    expect(() =>
      v.parse(publicMediaDictionarySchema, { "media-b": { ...dto.media["media-b"], alt: "" } }),
    ).toThrow();
  });
});

test("published values without hidden required targets cross public contracts", () => {
  const entry = {
    blocks: [
      {
        data: { kind: "image" },
        key: "feature-1",
        position: 1_000,
        schemaVersion: 1,
        settings: {},
        type: "feature",
      },
    ],
    fields: { kind: "image", gallery: [{ kind: "video", videoUrl: "https://example.com/v" }] },
    id: "work",
    internalLinks: [],
    modelKey: "works",
    path: "/works/work",
    publishedAt: toIsoTimestamp(1_800_000_000_000),
    slug: "work",
    title: "Work",
  };
  const dto = { entry, media: {} };
  expect(v.parse(publicContentEntrySchema, dto)).toEqual(dto);
  expect(contentMetadataOpenApi.FieldVisibility.description).toMatch(
    /retained in drafts; its value is omitted from published snapshots, public reads and build exports/u,
  );
});

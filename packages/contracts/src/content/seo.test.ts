// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import { contentEntryId, mediaId } from "@lacecms/domain";
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
  buildExportSchema,
  publicContentEntrySchema,
  toPublicContentEntryDto,
  toPublicContentListDto,
  adminContentEntrySchema,
  contentEntrySchema,
  contentModelListSchema,
  createContentEntryRequestSchema,
  mediaDetailSchema,
  mediaUrl,
  saveDraftRequestSchema,
  toBuildExportDto,
  toAdminContentEntryDto,
  seoInputSchema,
  toSeoDto,
  toContentEntryDto,
  toContentModelDto,
  formatSeoTitle,
  isCanonicalUrl as contractsIsCanonicalUrl,
  normalizeSeoText as contractsNormalizeSeoText,
  seoText,
} from "../index.js";
import { published, entry } from "../test-support/rest-fixtures.js";

describe("admin entry list contracts", () => {
  test("SEO values have explicit admin, request, public, model and export contracts", () => {
    const seo = { image: mediaId("media-1"), noindex: true, title: "Hello" };
    const seoEntry = {
      ...entry,
      draft: { ...entry.draft, seo },
      published: { ...published, seo: { canonical: "https://example.com/a" } },
    };
    const full = {
      canonical: null,
      description: null,
      image: "media-1",
      noindex: true,
      title: "Hello",
    };
    expect(toSeoDto(undefined)).toEqual({
      canonical: null,
      description: null,
      image: null,
      noindex: false,
      title: null,
    });
    const admin = toAdminContentEntryDto(
      seoEntry,
      { displayName: "Ada", id: "editor-1" },
      { seo: true },
    );
    expect(admin.draft.seo).toEqual(full);
    expect(admin.published.seo).toMatchObject({
      canonical: "https://example.com/a",
      noindex: false,
    });
    expect(v.parse(adminContentEntrySchema, admin)).toEqual(admin);
    expect(toContentEntryDto(seoEntry).draft).not.toHaveProperty("seo");
    expect(
      v.safeParse(contentEntrySchema, {
        ...toContentEntryDto(seoEntry),
        draft: { ...toContentEntryDto(seoEntry).draft, seo: { ...full, canonical: "/a" } },
      }).success,
    ).toBe(false);

    const request = { blocks: [], fields: {}, title: "Post" };
    expect(v.parse(saveDraftRequestSchema, { ...request, seo: null }).seo).toBeNull();
    expect(
      v.parse(createContentEntryRequestSchema, {
        ...request,
        seo: { canonical: "https://example.com/a?x=1", description: "", noindex: false },
      }).seo,
    ).toEqual({ canonical: "https://example.com/a?x=1", description: "", noindex: false });
    for (const invalid of [
      { canonical: "/a" },
      { canonical: "https://user:pass@example.com/" },
      { canonical: "https://example.com/#top" },
      { title: 5 },
      { title: "x".repeat(201) },
      { description: "a\nb" },
      { description: "x".repeat(501) },
      { keywords: "x" },
      { noindex: "yes" },
      { image: "" },
    ]) {
      const result = v.safeParse(saveDraftRequestSchema, { ...request, seo: invalid });
      expect(result.success, JSON.stringify(invalid)).toBe(false);
      expect(v.safeParse(seoInputSchema, invalid).success).toBe(false);
    }

    const urlFor = (id) => mediaUrl("https://lace.example/", id);
    const source = { entry: seoEntry, media: [], path: "/blog/welcome" };
    const enabled = toPublicContentEntryDto(source, urlFor, { seoModels: new Set(["posts"]) });
    expect(enabled.entry.seo).toMatchObject({ canonical: "https://example.com/a", title: null });
    expect(v.parse(publicContentEntrySchema, enabled)).toEqual(enabled);
    expect(toPublicContentEntryDto(source, urlFor).entry).not.toHaveProperty("seo");
    expect(
      toPublicContentListDto({ items: [source] }, urlFor, { seoModels: new Set(["posts"]) })
        .items[0].seo,
    ).toMatchObject({ canonical: "https://example.com/a" });

    const fields = {
      cover: { required: false, type: "media" },
      summary: { required: false, type: "textarea" },
    };
    const model = toContentModelDto({
      blocks: [],
      fields,
      key: "posts",
      kind: "collection",
      route: "/blog/:slug",
      seo: { description: "summary" },
      version: 1,
    });
    expect(model.seo).toEqual({ description: "summary", image: null });
    const defaults = toContentModelDto({
      blocks: [],
      fields: { siteName: { required: true, type: "text" } },
      key: "settings",
      kind: "global",
      seoDefaults: { siteName: "siteName" },
      version: 1,
    });
    expect(defaults.seoDefaults).toEqual({
      description: null,
      image: null,
      siteName: "siteName",
      titleTemplate: null,
    });
    expect(v.parse(contentModelListSchema, { items: [model, defaults] }).items).toHaveLength(2);
    for (const invalid of [
      { ...defaults, seo: { description: null, image: null } },
      { ...model, seoDefaults: defaults.seoDefaults },
    ]) {
      expect(v.safeParse(contentModelListSchema, { items: [invalid] }).success).toBe(false);
    }

    const exportSeo = {
      defaults: { ...defaults.seoDefaults, modelKey: "settings" },
      models: { posts: { description: "summary", image: null } },
    };
    const exportDto = toBuildExportDto(
      {
        entries: [{ entry: seoEntry, media: [], path: "/blog/welcome" }],
        globals: [
          {
            entry: {
              ...seoEntry,
              id: contentEntryId("settings"),
              model: { key: "settings", kind: "global" },
            },
            media: [],
          },
        ],
        version: 4,
      },
      urlFor,
      exportSeo,
    );
    expect(exportDto.seo).toEqual(exportSeo);
    expect(exportDto.entries[0].seo).toMatchObject({ canonical: "https://example.com/a" });
    expect(exportDto.globals[0]).not.toHaveProperty("seo");
    expect(v.parse(buildExportSchema, exportDto)).toEqual(exportDto);
    const { seo: _seo, ...legacy } = exportDto;
    expect(v.parse(buildExportSchema, legacy).seo).toEqual({ defaults: null, models: {} });
    expect(
      v.safeParse(buildExportSchema, {
        ...exportDto,
        globals: [{ ...exportDto.globals[0], seo: toSeoDto(undefined) }],
      }).success,
    ).toBe(false);
    expect(toBuildExportDto({ entries: [], version: 1 }, urlFor).seo).toEqual({
      defaults: null,
      models: {},
    });

    expect(
      v.parse(mediaDetailSchema.entries.usage, [
        {
          entryId: "e1",
          locations: [{ field: "image", source: "seo", states: ["published"] }],
          modelKey: "posts",
          status: "published",
          title: "Hello",
        },
      ]),
    ).toHaveLength(1);
    expect(
      v.safeParse(mediaDetailSchema.entries.usage, [
        {
          entryId: "e1",
          locations: [{ field: "cover", source: "seo", states: ["published"] }],
          modelKey: "posts",
          status: "published",
          title: "Hello",
        },
      ]).success,
    ).toBe(false);
  });
});

describe("shared SEO text rules", () => {
  test("seoText collapses whitespace and drops blank or non-text values", () => {
    expect(seoText("  Hello \n  world ")).toBe("Hello world");
    expect(seoText("   ")).toBeUndefined();
    expect(seoText(42)).toBeUndefined();
    expect(seoText(undefined)).toBeUndefined();
  });
  test("formatSeoTitle applies the title template rule", () => {
    expect(formatSeoTitle("Hello", { siteName: "Lace" })).toBe("Hello | Lace");
    expect(formatSeoTitle("Hello", { siteName: "Lace", titleTemplate: "%s — Notes" })).toBe(
      "Hello — Notes",
    );
    expect(formatSeoTitle("$& costs", { titleTemplate: "%s · Shop" })).toBe("$& costs · Shop");
    expect(formatSeoTitle("Hello", { siteName: "Lace", titleTemplate: "Notes" })).toBe(
      "Hello | Lace",
    );
    expect(formatSeoTitle("Hello", { siteName: "  " })).toBe("Hello");
    expect(formatSeoTitle("Hello", undefined)).toBe("Hello");
  });
  test("re-exports the domain SEO predicates", () => {
    expect(contractsIsCanonicalUrl("https://example.com/a")).toBe(true);
    expect(contractsIsCanonicalUrl("/a")).toBe(false);
    expect(contractsNormalizeSeoText("a\nb", "title")).toBeUndefined();
    expect(contractsNormalizeSeoText("  ", "title")).toBeNull();
  });
});

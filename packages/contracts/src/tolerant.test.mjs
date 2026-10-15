import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
  BUILD_EXPORT_FORMAT_VERSION,
  buildExportContinuationPageSchema,
  buildExportFirstPageSchema,
  buildExportSchema,
  errorEnvelopeSchema,
  exportSeoSchema,
  publicBlockSchema,
  publicContentEntrySchema,
  publicContentListSchema,
  publicEntrySchema,
  publicGlobalContentSchema,
  publicGlobalSchema,
  publicMediaDictionarySchema,
  publicMediaSchema,
  seoValueSchema,
  tolerantPublicSchemas,
} from "../dist/index.js";

const publishedAt = "2026-10-01T08:00:00.000Z";

function block(overrides = {}) {
  return {
    anchor: "pricing",
    className: "wide accent",
    data: {
      heading: "Plans",
      // Consumer-owned JSON: keys unknown to the contract are content.
      layout: { columns: 3, futureOption: true },
      items: [{ image: "media-1", label: "One" }],
    },
    key: "block-1",
    position: 1000,
    schemaVersion: 2,
    settings: { align: "center", undeclaredByContract: 1 },
    type: "pricing",
    ...overrides,
  };
}

const media = {
  "media-1": {
    alt: "Plans",
    caption: null,
    focalPoint: { x: 0.5, y: 0.25 },
    height: 600,
    id: "media-1",
    mimeType: "image/png",
    url: "https://lace.example/api/v1/public/media/media-1",
    width: 800,
  },
};

const entry = {
  blocks: [block(), block({ anchor: undefined, className: undefined, key: "block-2" })].map(
    (value) => JSON.parse(JSON.stringify(value)),
  ),
  fields: { summary: "Hello", nested: { list: [1, 2], extra: { deep: true } } },
  id: "entry-1",
  modelKey: "posts",
  path: "/blog/welcome",
  publishedAt,
  seo: {
    canonical: "https://example.com/blog/welcome",
    description: "Welcome",
    image: "media-1",
    noindex: false,
    title: null,
  },
  slug: "welcome",
  title: "Welcome",
};

const global = {
  blocks: [block({ key: "nav-1" })],
  fields: { siteName: "Lace" },
  id: "settings",
  modelKey: "settings",
  publishedAt,
};

const exportSeo = {
  defaults: {
    description: null,
    image: null,
    modelKey: "settings",
    siteName: "siteName",
    titleTemplate: null,
  },
  models: { posts: { description: "summary", image: null } },
};

const fixtures = {
  buildExport: [
    buildExportSchema,
    {
      entries: [entry],
      formatVersion: 1,
      globals: [global],
      media,
      seo: exportSeo,
      version: 9,
    },
  ],
  buildExportContinuationPage: [
    buildExportContinuationPageSchema,
    { entries: [entry], formatVersion: 1, media, nextCursor: "next", version: 9 },
  ],
  buildExportFirstPage: [
    buildExportFirstPageSchema,
    {
      entries: [entry],
      formatVersion: 1,
      globals: [global],
      media,
      nextCursor: "next",
      seo: exportSeo,
      version: 9,
    },
  ],
  errorEnvelope: [
    errorEnvelopeSchema,
    { error: { code: "NOT_FOUND", details: { path: "/missing" }, message: "Not found." } },
  ],
  exportSeo: [exportSeoSchema, exportSeo],
  publicBlock: [publicBlockSchema, block()],
  publicContentEntry: [publicContentEntrySchema, { entry, media }],
  publicContentList: [publicContentListSchema, { items: [entry], media, nextCursor: "next" }],
  publicEntry: [publicEntrySchema, entry],
  publicGlobal: [publicGlobalSchema, global],
  publicGlobalContent: [publicGlobalContentSchema, { global, media }],
  publicMedia: [publicMediaSchema, media["media-1"]],
  publicMediaDictionary: [publicMediaDictionarySchema, media],
  seoValue: [seoValueSchema, entry.seo],
};

/** Values under these keys are consumer-owned JSON, not contract objects. */
const consumerJsonKeys = new Set(["data", "details", "fields", "settings"]);
/** Records keyed by data (media IDs, model keys); their own keys are not contract keys. */
const recordKeys = new Set(["media", "models"]);

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Paths of every contract-defined object in a fixture, starting with the root. */
function contractObjectPaths(value, rootIsRecord, path = [], key = undefined) {
  if (key !== undefined && consumerJsonKeys.has(key)) return [];
  if (Array.isArray(value))
    return value.flatMap((item, index) =>
      contractObjectPaths(item, false, [...path, index], undefined),
    );
  if (!isPlainObject(value)) return [];
  const isRecord = path.length === 0 ? rootIsRecord : recordKeys.has(key);
  const nested = Object.entries(value).flatMap(([childKey, child]) =>
    contractObjectPaths(child, false, [...path, childKey], isRecord ? undefined : childKey),
  );
  return isRecord ? nested : [path, ...nested];
}

function withUnknownKey(value, path) {
  const copy = structuredClone(value);
  let target = copy;
  for (const segment of path) target = target[segment];
  target.futureKey = { introducedLater: true };
  return copy;
}

function without(value, path, key) {
  const copy = structuredClone(value);
  let target = copy;
  for (const segment of path) target = target[segment];
  delete target[key];
  return copy;
}

describe("strict and tolerant public read schemas", () => {
  test("every public read schema has a tolerant variant", () => {
    expect(Object.keys(tolerantPublicSchemas).sort()).toEqual(Object.keys(fixtures).sort());
    expect(Object.isFrozen(tolerantPublicSchemas)).toBe(true);
  });

  for (const [name, [strict, fixture]] of Object.entries(fixtures)) {
    const tolerant = tolerantPublicSchemas[name];

    test(`${name}: both variants agree on strict-valid input`, () => {
      const expected = v.parse(strict, fixture);
      expect(v.parse(tolerant, fixture)).toEqual(expected);
    });

    test(`${name}: an unknown key fails strict and is removed by tolerant at every depth`, () => {
      const expected = v.parse(strict, fixture);
      const paths = contractObjectPaths(fixture, name === "publicMediaDictionary");
      expect(paths.length).toBeGreaterThan(0);
      for (const path of paths) {
        const extended = withUnknownKey(fixture, path);
        expect(v.safeParse(strict, extended).success, `strict at /${path.join("/")}`).toBe(false);
        expect(v.parse(tolerant, extended), `tolerant at /${path.join("/")}`).toEqual(expected);
      }
    });
  }

  test("consumer-owned JSON keeps unknown keys in both variants", () => {
    for (const schema of [publicEntrySchema, tolerantPublicSchemas.publicEntry]) {
      const parsed = v.parse(schema, entry);
      expect(parsed.fields.nested.extra).toEqual({ deep: true });
      expect(parsed.blocks[0].data.layout.futureOption).toBe(true);
      expect(parsed.blocks[0].settings.undeclaredByContract).toBe(1);
    }
  });

  test("missing required keys fail in both variants", () => {
    const cases = [
      ["publicEntry", without(entry, [], "publishedAt")],
      ["publicMedia", without(media["media-1"], [], "url")],
      ["publicBlock", without(block(), [], "key")],
      ["publicContentEntry", without({ entry, media }, ["entry"], "title")],
      ["buildExport", without(fixtures.buildExport[1], [], "version")],
      ["buildExportFirstPage", without(fixtures.buildExportFirstPage[1], [], "globals")],
      ["buildExportFirstPage", without(fixtures.buildExportFirstPage[1], [], "seo")],
      [
        "buildExportContinuationPage",
        without(fixtures.buildExportContinuationPage[1], [], "media"),
      ],
      ["seoValue", without(entry.seo, [], "noindex")],
    ];
    for (const [name, value] of cases) {
      expect(v.safeParse(fixtures[name][0], value).success, `strict ${name}`).toBe(false);
      expect(v.safeParse(tolerantPublicSchemas[name], value).success, `tolerant ${name}`).toBe(
        false,
      );
    }
  });

  test("wrong value types and constraints fail in both variants", () => {
    const cases = [
      ["publicBlock", block({ position: "1000" })],
      ["publicBlock", block({ anchor: "Not An Anchor" })],
      ["publicMedia", { ...media["media-1"], width: -1 }],
      ["publicEntry", { ...entry, publishedAt: "yesterday" }],
      ["publicMediaDictionary", { "media-2": media["media-1"] }],
    ];
    for (const [name, value] of cases) {
      expect(v.safeParse(fixtures[name][0], value).success, `strict ${name}`).toBe(false);
      expect(v.safeParse(tolerantPublicSchemas[name], value).success, `tolerant ${name}`).toBe(
        false,
      );
    }
  });

  test("a delivered block carrying hidden fails both variants", () => {
    // Stripping the flag would render content the CMS marked as hidden.
    for (const hidden of [true, false]) {
      const value = { ...block(), hidden };
      expect(v.safeParse(publicBlockSchema, value).success).toBe(false);
      expect(v.safeParse(tolerantPublicSchemas.publicBlock, value).success).toBe(false);
      const exported = {
        ...fixtures.buildExport[1],
        entries: [{ ...entry, blocks: [value] }],
      };
      expect(v.safeParse(tolerantPublicSchemas.buildExport, exported).success).toBe(false);
      expect(
        v.safeParse(tolerantPublicSchemas.publicGlobalContent, {
          global: { ...global, blocks: [value] },
          media,
        }).success,
      ).toBe(false);
    }
  });

  test("a legacy draft-shaped entry fails both variants", () => {
    const legacy = { entry: { draft: {}, id: "entry-1", model: {}, published: {} }, path: "/" };
    expect(v.safeParse(publicContentEntrySchema, legacy).success).toBe(false);
    expect(v.safeParse(tolerantPublicSchemas.publicContentEntry, legacy).success).toBe(false);
  });

  test("the export format version is strict for output and open for consumers", () => {
    expect(BUILD_EXPORT_FORMAT_VERSION).toBe(1);
    const exported = fixtures.buildExport[1];
    expect(v.safeParse(buildExportSchema, { ...exported, formatVersion: 2 }).success).toBe(false);
    expect(v.parse(tolerantPublicSchemas.buildExport, { ...exported, formatVersion: 2 })).toEqual(
      expect.objectContaining({ formatVersion: 2 }),
    );
    for (const value of [undefined, 0, 1.5, "1"]) {
      const candidate = { ...exported, formatVersion: value };
      expect(v.safeParse(buildExportSchema, candidate).success, `strict ${value}`).toBe(false);
      expect(
        v.safeParse(tolerantPublicSchemas.buildExport, candidate).success,
        `tolerant ${value}`,
      ).toBe(false);
    }
  });

  test("an error code unknown to this release is accepted only by the tolerant envelope", () => {
    const future = { error: { code: "FUTURE_CONDITION", message: "Later." } };
    expect(v.safeParse(errorEnvelopeSchema, future).success).toBe(false);
    expect(v.parse(tolerantPublicSchemas.errorEnvelope, future)).toEqual(future);
    for (const code of ["", "x".repeat(129), 42]) {
      expect(
        v.safeParse(tolerantPublicSchemas.errorEnvelope, { error: { code, message: "m" } }).success,
      ).toBe(false);
    }
  });
});

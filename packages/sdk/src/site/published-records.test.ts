import { expect, test } from "vitest";
import { LaceContractError } from "../client/errors.js";
import { createPublishedSiteLoader } from "./published-site.js";
import { renderSitemapXml } from "./site-files.js";

const environment = Object.freeze({
  LACE_API_BASE_URL: "https://api.example.test/lace",
  LACE_BUILD_SITE_URL: "https://example.com/",
  LACE_BUILD_TOKEN: "lace_build_secret-token-value",
});

interface RecordOptions {
  readonly fields?: Record<string, unknown>;
  readonly internalLinks?: readonly Record<string, string>[];
  readonly modelKey?: string;
}

function exportRecord(
  id: string,
  publishedAt: string,
  { modelKey = "cv", fields = {}, internalLinks = [] }: RecordOptions = {},
) {
  return {
    blocks: [
      {
        data: { heading: "b" },
        key: `${id}-b`,
        position: 2,
        schemaVersion: 1,
        settings: {},
        type: "hero",
      },
      {
        data: { heading: "a" },
        key: `${id}-a`,
        position: 1,
        schemaVersion: 1,
        settings: {},
        type: "hero",
      },
    ],
    fields,
    id,
    internalLinks,
    modelKey,
    publishedAt,
    title: `${id} title`,
  };
}

function exported(
  records: readonly ReturnType<typeof exportRecord>[],
  entries: readonly (typeof about)[] = [],
) {
  return {
    entries,
    formatVersion: 2,
    globals: [],
    media: {
      photo: {
        alt: "Portrait",
        caption: null,
        focalPoint: null,
        height: null,
        id: "photo",
        mimeType: "image/png",
        url: "https://api.example.test/lace/api/v1/public/media/photo",
        width: null,
      },
    },
    records,
    seo: { defaults: null, models: {} },
    version: 5,
  };
}

const about = {
  blocks: [],
  fields: {},
  id: "about",
  internalLinks: [],
  modelKey: "about",
  path: "/about",
  publishedAt: "2026-09-01T00:00:00.000Z",
  title: "About",
};

async function load(value: ReturnType<typeof exported>) {
  return createPublishedSiteLoader({
    environment,
    fetch: async () => Response.json(value, { headers: { etag: `"${value.version}"` } }),
  })();
}

test("the site view lists records newest publication first without routes", async () => {
  const site = await load(
    exported(
      [
        exportRecord("cv-1", "2026-09-01T00:00:00.000Z", { fields: { photo: "photo" } }),
        exportRecord("cv-2", "2026-09-03T00:00:00.000Z"),
        exportRecord("cv-3", "2026-09-02T00:00:00.000Z"),
        exportRecord("t-1", "2026-09-02T00:00:00.000Z", { modelKey: "testimonials" }),
      ],
      [about],
    ),
  );
  const cv = site.records("cv");
  expect(cv.map((record) => record.id)).toEqual(["cv-2", "cv-3", "cv-1"]);
  expect(cv[2]!).toMatchObject({ fields: { photo: "photo" }, modelKey: "cv", title: "cv-1 title" });
  expect(cv[2]!.blocks.map((block) => block.key)).toEqual(["cv-1-a", "cv-1-b"]);
  expect(cv[2]!.image("photo")).toMatchObject({ alt: "Portrait" });
  for (const key of ["path", "slug", "seo"]) expect(cv[0]).not.toHaveProperty(key);
  expect(Object.isFrozen(cv)).toBe(true);
  expect(Object.isFrozen(cv[0]!)).toBe(true);
  expect(site.records("testimonials").map((record) => record.id)).toEqual(["t-1"]);
  expect(site.records("about")).toEqual([]);
  expect(site.records("unknown")).toEqual([]);
  // Records are never routes.
  expect(site.entries("cv")).toEqual([]);
  expect(site.allEntries().map((entry) => entry.id)).toEqual(["about"]);
  expect(site.bySlug("cv", "cv-1")).toBeUndefined();
  const sitemap = renderSitemapXml(site) ?? "";
  expect(sitemap).toContain("https://example.com/about");
  expect(sitemap).not.toContain("cv-");
});

test("a record resolves its links to routed entries", async () => {
  const site = await load(
    exported(
      [
        exportRecord("cv-1", "2026-09-01T00:00:00.000Z", {
          fields: { link: "entry:about" },
          internalLinks: [
            { area: "fields", pointer: "/link", sourceKey: "$fields", targetId: "about" },
          ],
        }),
      ],
      [about],
    ),
  );
  const record = site.records("cv")[0]!;
  expect(record.link(record.fields.link)).toEqual({
    href: "/about",
    state: "resolved",
    targetId: "about",
  });
  expect(site.linkDiagnostics.total).toBe(0);
});

test("rejects records sharing a model with entries", async () => {
  const records = [exportRecord("x", "2026-09-01T00:00:00.000Z", { modelKey: "about" })];
  const error = await load(exported(records, [about])).catch((caught) => caught);
  expect(error.code).toBe("invalid_export");
  expect(error.message).toContain("about");
});

test("rejects a duplicate record as an inconsistent export", async () => {
  const records = [
    exportRecord("x", "2026-09-01T00:00:00.000Z"),
    exportRecord("x", "2026-09-02T00:00:00.000Z"),
  ];
  const error = await load(exported(records, [about])).catch((caught) => caught);
  expect(error).toBeInstanceOf(LaceContractError);
});

import * as v from "valibot";
import type {
  BuildExportDto,
  PublicBlockDto,
  PublicEntryDto,
  PublicGlobalDto,
  PublicMediaDto,
} from "@lacecms/contracts";
import { expect, test } from "vitest";
import { LaceSdkError } from "../client/errors.js";
import { createPublishedSiteLoader } from "./published-site.js";

const timestamp = "2026-09-20T00:00:00.000Z";
const token = "lace_build_secret-token-value";
const environment = Object.freeze({
  LACE_API_BASE_URL: "https://api.example.test/lace",
  LACE_BUILD_TOKEN: token,
});

type WireBlock = Omit<PublicBlockDto, "settings"> & {
  settings?: PublicBlockDto["settings"];
  hidden?: unknown;
};
function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Expected fixture value");
  return value;
}
function exportEntry({
  id,
  modelKey = "posts",
  path,
  slug,
  blocks = [],
  fields = {},
}: {
  id: string;
  modelKey?: string;
  path: string;
  slug?: string;
  blocks?: WireBlock[];
  fields?: PublicEntryDto["fields"];
}) {
  return {
    blocks,
    fields,
    id,
    modelKey,
    path,
    publishedAt: timestamp,
    ...(slug === undefined ? {} : { slug }),
    internalLinks: [],
    title: `${id} published`,
  };
}

function block(
  key: string,
  position: number,
  data: PublicBlockDto["data"] = { heading: key },
): PublicBlockDto {
  return { data, key, position, schemaVersion: 1, settings: {}, type: "hero" };
}

function mediaItem(id: string, overrides: Partial<PublicMediaDto> = {}): PublicMediaDto {
  return {
    alt: null,
    caption: null,
    focalPoint: null,
    height: null,
    id,
    mimeType: "image/png",
    url: `https://public.example.test/lace/api/v1/public/media/${id}`,
    width: null,
    ...overrides,
  };
}

function buildExport(version: number, entries: unknown[], media: BuildExportDto["media"] = {}) {
  return {
    entries,
    formatVersion: 2,
    globals: [] as PublicGlobalDto[],
    media,
    seo: { defaults: null, models: {} },
    version,
  };
}

function exportResponse<T extends { version: number }>(value: T, etag = `"${value.version}"`) {
  return Response.json(value, { headers: { etag } });
}

function scriptedFetch(
  responses: (Response | Error | (() => Response | Promise<Response>) | undefined)[],
) {
  const requests: { headers: Headers; url: string }[] = [];
  return {
    fetch: async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({
        headers: new Headers(init?.headers),
        url: url instanceof Request ? url.url : url.toString(),
      });
      const next = responses.shift();
      if (next === undefined) throw new Error("Unexpected request.");
      if (next instanceof Error) throw next;
      return typeof next === "function" ? next() : next;
    },
    requests,
  };
}

const homeExport = buildExport(
  3,
  [
    exportEntry({
      blocks: [block("second", 1), block("first", 0)],
      fields: { summary: "Welcome" },
      id: "home",
      modelKey: "home",
      path: "/",
    }),
    exportEntry({ id: "post-b", path: "/blog/b", slug: "b" }),
    exportEntry({ id: "post-a", path: "/blog/a", slug: "a" }),
    exportEntry({ id: "recipe", modelKey: "recipes", path: "/recipes/soup", slug: "soup" }),
  ],
  {
    "hero-media": mediaItem("hero-media", {
      alt: "Office",
      caption: "Our office",
      focalPoint: { x: 0.25, y: 0.4 },
      height: 900,
      width: 1600,
    }),
    plain: mediaItem("plain"),
  },
);

async function captureError(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return error;
  }
  throw new Error("Expected the promise to reject.");
}

function exportGlobal({
  id = "settings-entry",
  modelKey = "settings",
  blocks = [],
  fields = {},
}: {
  id?: string;
  modelKey?: string;
  blocks?: PublicBlockDto[];
  fields?: PublicGlobalDto["fields"];
} = {}): PublicGlobalDto {
  return { blocks, fields, id, internalLinks: [], modelKey, publishedAt: timestamp };
}

test("the site view exposes published globals by model key", async () => {
  const value = {
    ...buildExport(4, [exportEntry({ id: "home", modelKey: "home", path: "/" })], {
      logo: mediaItem("logo", { alt: "Lace logo" }),
    }),
    globals: [
      exportGlobal({
        blocks: [block("second", 2000), block("first", 1000)],
        fields: { logo: "logo", siteName: "Lace" },
      }),
    ],
  };
  const site = await createPublishedSiteLoader({
    environment: { ...environment, LACE_PUBLIC_BASE_URL: "https://media.example.test/base" },
    fetch: scriptedFetch([exportResponse(value)]).fetch,
  })();
  const settings = required(site.global("settings"));
  expect(settings).toMatchObject({
    fields: { logo: "logo", siteName: "Lace" },
    id: "settings-entry",
    modelKey: "settings",
    publishedAt: timestamp,
  });
  expect(settings.blocks.map((item) => item.key)).toEqual(["first", "second"]);
  for (const key of ["path", "slug", "title", "draft"]) expect(settings).not.toHaveProperty(key);
  expect(Object.isFrozen(settings)).toBe(true);
  expect(settings.image("logo")).toMatchObject({
    alt: "Lace logo",
    url: "https://media.example.test/base/api/v1/public/media/logo",
  });
  expect(settings.image("logo", "Brand")).toMatchObject({ alt: "Brand" });
  expect(site.global("home")).toBeUndefined();
  expect(site.global("footer")).toBeUndefined();
  expect(site.entries("settings")).toEqual([]);
  expect(site.byPath("/")).toMatchObject({ id: "home" });
});

test("an export without globals has no globals", async () => {
  const site = await createPublishedSiteLoader({
    environment,
    fetch: scriptedFetch([exportResponse(buildExport(1, []))]).fetch,
  })();
  expect(site.global("settings")).toBeUndefined();
});

test.each([
  ["a duplicate global key", [], [exportGlobal(), exportGlobal({ id: "other" })]],
  [
    "a global key shared with entries",
    [exportEntry({ id: "page", modelKey: "settings", path: "/settings" })],
    [exportGlobal()],
  ],
])("rejects %s", async (_name, entries, globals) => {
  const error = await captureError(
    createPublishedSiteLoader({
      environment,
      fetch: scriptedFetch([exportResponse({ ...buildExport(1, entries), globals })]).fetch,
    })(),
  );
  expect(error).toMatchObject({ code: "invalid_export" });
  expect(error.message).toContain("settings");
});

test("published entries pass stored SEO values through without resolving fallbacks", async () => {
  const seo = {
    canonical: null,
    description: null,
    image: "share",
    noindex: true,
    title: "Hello",
  };
  const value = {
    ...buildExport(
      5,
      [
        { ...exportEntry({ id: "hello", path: "/blog/hello", slug: "hello" }), seo },
        exportEntry({ id: "note", modelKey: "notes", path: "/notes/n", slug: "n" }),
      ],
      { share: mediaItem("share") },
    ),
    seo: {
      defaults: null,
      models: { posts: { description: "summary", image: null } },
    },
  };
  const site = await createPublishedSiteLoader({
    environment,
    fetch: scriptedFetch([exportResponse(value)]).fetch,
  })();
  expect(required(site.byPath("/blog/hello")).seo).toEqual(seo);
  expect(Object.isFrozen(required(site.byPath("/blog/hello")).seo)).toBe(true);
  expect(required(site.byPath("/notes/n")).seo).toBeUndefined();
});

test.each([
  ["a relative path", "/blog"],
  ["another scheme", "ftp://site.example/"],
  ["credentials", "https://user:secret@site.example/"],
  ["a query", "https://site.example/?preview=secret"],
  ["a fragment", "https://site.example/#top"],
  ["a bare query mark", "https://site.example/?"],
])("rejects a site URL with %s without echoing it", async (_name, value) => {
  const transport = scriptedFetch([]);
  const error = await captureError(
    createPublishedSiteLoader({
      environment: { ...environment, LACE_BUILD_SITE_URL: value },
      fetch: transport.fetch,
    })(),
  );
  expect(error).toMatchObject({ code: "missing_configuration" });
  expect(error.message).toContain("LACE_BUILD_SITE_URL");
  expect(error.message).not.toContain(value);
  expect(transport.requests).toHaveLength(0);
});

test.each(["no", "OFF", "true"])("rejects the indexing switch %s", async (value) => {
  const transport = scriptedFetch([]);
  const error = await captureError(
    createPublishedSiteLoader({
      environment: { ...environment, LACE_SITE_INDEXING: value },
      fetch: transport.fetch,
    })(),
  );
  expect(error).toMatchObject({ code: "missing_configuration" });
  expect(error.message).toBe("LACE_SITE_INDEXING must be on or off.");
  expect(transport.requests).toHaveLength(0);
});

test("without a site URL the view has no URLs and indexing is on", async () => {
  const site = await createPublishedSiteLoader({
    environment: { ...environment, LACE_BUILD_SITE_URL: "  ", LACE_SITE_INDEXING: "" },
    fetch: scriptedFetch([exportResponse(homeExport)]).fetch,
  })();
  expect(site.url).toBeUndefined();
  expect(site.urlFor("/")).toBeUndefined();
  expect(site.indexing).toBe(true);
});

test("a site URL with a base path keeps it and joins public paths under it", async () => {
  const site = await createPublishedSiteLoader({
    environment: {
      ...environment,
      LACE_BUILD_SITE_URL: "https://Example.com/blog",
      LACE_SITE_INDEXING: " off ",
    },
    fetch: scriptedFetch([exportResponse(homeExport)]).fetch,
  })();
  expect(site.url).toBe("https://example.com/blog/");
  expect(site.urlFor("/posts/hello")).toBe("https://example.com/blog/posts/hello");
  expect(site.urlFor("/")).toBe("https://example.com/blog/");
  expect(site.indexing).toBe(false);
});

test("explicit site URL and indexing take precedence over the environment record", async () => {
  const site = await createPublishedSiteLoader({
    environment: {
      ...environment,
      LACE_BUILD_SITE_URL: "https://env.example/",
      LACE_SITE_INDEXING: "off",
    },
    fetch: scriptedFetch([exportResponse(homeExport)]).fetch,
    indexing: "on",
    siteUrl: "https://explicit.example",
  })();
  expect(site.url).toBe("https://explicit.example/");
  expect(site.urlFor("/")).toBe("https://explicit.example/");
  expect(site.indexing).toBe(true);
});

test("all entries span every model in path order and leave globals out", async () => {
  const site = await createPublishedSiteLoader({
    environment,
    fetch: scriptedFetch([
      exportResponse({
        ...homeExport,
        globals: [
          {
            blocks: [],
            fields: {},
            id: "settings-entry",
            internalLinks: [],
            modelKey: "settings",
            publishedAt: timestamp,
          },
        ],
      }),
    ]).fetch,
  })();
  expect(site.allEntries().map((entry) => entry.path)).toEqual([
    "/",
    "/blog/a",
    "/blog/b",
    "/recipes/soup",
  ]);
  expect(Object.isFrozen(site.allEntries())).toBe(true);
});

test("published blocks carry their envelope and legacy blocks default their settings", async () => {
  const anchored = {
    ...block("first", 0),
    anchor: "pricing",
    className: "wide",
    settings: { align: "center" },
  };
  const { settings: _settings, ...legacy } = block("second", 1);
  const transport = scriptedFetch([
    exportResponse(
      buildExport(4, [exportEntry({ blocks: [anchored, legacy], id: "home", path: "/" })]),
    ),
  ]);
  const site = await createPublishedSiteLoader({ environment, fetch: transport.fetch })();
  expect(required(site.byPath("/")).blocks).toEqual([anchored, block("second", 1)]);

  const hidden = scriptedFetch([
    exportResponse(
      buildExport(5, [
        exportEntry({ blocks: [{ ...block("first", 0), hidden: true }], id: "home", path: "/" }),
      ]),
    ),
  ]);
  await expect(
    createPublishedSiteLoader({ environment, fetch: hidden.fetch })(),
  ).rejects.toBeInstanceOf(LaceSdkError);
});

test("published-site preserves nested fields, empty composites and nested media IDs", async () => {
  const fields = { team: [{ profile: { photo: "portrait" } }], empty: {}, tags: [] };
  const exported = buildExport(
    1,
    [
      exportEntry({
        id: "nested",
        path: "/blog/nested",
        slug: "nested",
        fields,
        blocks: [block("b", 0, { images: ["portrait"] })],
      }),
    ],
    { portrait: mediaItem("portrait") },
  );
  exported.globals = [exportGlobal({ fields })];
  const site = await createPublishedSiteLoader({
    environment,
    fetch: scriptedFetch([exportResponse(exported)]).fetch,
  })();
  const entry = required(site.byPath("/blog/nested"));
  expect(entry.fields).toEqual(fields);
  expect(entry.blocks[0]?.data.images).toEqual(["portrait"]);
  const nested = v.parse(
    v.object({ team: v.array(v.object({ profile: v.object({ photo: v.string() }) })) }),
    entry.fields,
  );
  expect(entry.image(required(nested.team[0]).profile.photo)).toMatchObject({ id: "portrait" });
  expect(required(site.global("settings")).fields).toEqual(fields);
});

test("the site view exposes published content only, ordered and immutable", async () => {
  const transport = scriptedFetch([exportResponse(homeExport)]);
  const site = await createPublishedSiteLoader({ environment, fetch: transport.fetch })();
  expect(site.version).toBe(3);
  const home = required(site.byPath("/"));
  expect(home).toEqual({
    internalLinks: [],
    link: expect.any(Function),
    reference: expect.any(Function),
    blocks: [block("first", 0), block("second", 1)],
    fields: { summary: "Welcome" },
    id: "home",
    image: expect.any(Function),
    media: expect.any(Function),
    modelKey: "home",
    path: "/",
    publishedAt: timestamp,
    title: "home published",
  });
  expect(JSON.stringify(home)).not.toContain("draft");
  expect(Object.isFrozen(site)).toBe(true);
  expect(Object.isFrozen(home)).toBe(true);
  expect(Object.isFrozen(home.blocks)).toBe(true);
  expect(site.entries("posts").map((entry) => entry.path)).toEqual(["/blog/a", "/blog/b"]);
  expect(Object.isFrozen(site.entries("posts"))).toBe(true);
  expect(site.bySlug("posts", "b")?.id).toBe("post-b");
  expect(site.entries("recipes").map((entry) => entry.slug)).toEqual(["soup"]);
  expect(site.byPath("/missing")).toBeUndefined();
  expect(site.byPath("/blog/a/")).toBeUndefined();
  expect(site.bySlug("posts", "missing")).toBeUndefined();
  expect(site.bySlug("constructor", "toString")).toBeUndefined();
  expect(site.entries("unknown")).toEqual([]);
  expect(site.entries("constructor")).toEqual([]);
});

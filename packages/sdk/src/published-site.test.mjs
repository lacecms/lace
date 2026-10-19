import { expect, test } from "vitest";
import {
  LaceContractError,
  LaceHttpError,
  LacePublishedSiteError,
  LaceSdkError,
  createPublishedSiteLoader,
} from "../dist/index.js";

const timestamp = "2026-09-20T00:00:00.000Z";
const token = "lace_build_secret-token-value";
const environment = Object.freeze({
  LACE_API_BASE_URL: "https://api.example.test/lace",
  LACE_BUILD_TOKEN: token,
});

function exportEntry({ id, modelKey = "posts", path, slug, blocks = [], fields = {} }) {
  return {
    blocks,
    fields,
    id,
    modelKey,
    path,
    publishedAt: timestamp,
    ...(slug === undefined ? {} : { slug }),
    title: `${id} published`,
  };
}

function block(key, position, data = { heading: key }) {
  return { data, key, position, schemaVersion: 1, settings: {}, type: "hero" };
}

function mediaItem(id, overrides = {}) {
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

function buildExport(version, entries, media = {}) {
  return {
    entries,
    formatVersion: 1,
    globals: [],
    media,
    seo: { defaults: null, models: {} },
    version,
  };
}

function exportResponse(value, etag = `"${value.version}"`) {
  return Response.json(value, { headers: { etag } });
}

function notModified(etag) {
  return new Response(null, { headers: { etag }, status: 304 });
}

function errorResponse(status, code = "AUTHORIZATION_DENIED") {
  return Response.json({ error: { code, message: "Denied." } }, { status });
}

function scriptedFetch(responses) {
  const requests = [];
  return {
    fetch: async (url, init) => {
      requests.push({ headers: new Headers(init.headers), url: url.toString() });
      const next = responses.shift();
      if (next === undefined) throw new Error("Unexpected request.");
      if (next instanceof Error) throw next;
      return typeof next === "function" ? next() : next;
    },
    requests,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
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

async function captureError(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the promise to reject.");
}

test("creating a loader reads no configuration and sends no request", () => {
  const transport = scriptedFetch([]);
  expect(() =>
    createPublishedSiteLoader({ environment: {}, fetch: transport.fetch }),
  ).not.toThrow();
  expect(transport.requests).toHaveLength(0);
});

test.each([
  [{}, "LACE_API_BASE_URL"],
  [{ LACE_API_BASE_URL: "https://api.example.test" }, "LACE_BUILD_TOKEN"],
  [{ LACE_API_BASE_URL: "https://api.example.test", LACE_BUILD_TOKEN: "  " }, "LACE_BUILD_TOKEN"],
  [{ ...environment, LACE_API_BASE_URL: "not a url" }, "LACE_API_BASE_URL"],
  [{ ...environment, LACE_PUBLIC_BASE_URL: "ftp://media.example" }, "LACE_PUBLIC_BASE_URL"],
  [{ ...environment, LACE_EXPECTED_PUBLISHED_VERSION: "v3" }, "LACE_EXPECTED_PUBLISHED_VERSION"],
])("missing or invalid configuration fails before any request (%#)", async (env, setting) => {
  const transport = scriptedFetch([]);
  const error = await captureError(
    createPublishedSiteLoader({ environment: env, fetch: transport.fetch })(),
  );
  expect(error).toBeInstanceOf(LacePublishedSiteError);
  expect(error).toBeInstanceOf(LaceSdkError);
  expect(error.code).toBe("missing_configuration");
  expect(error.message).toContain(setting);
  expect(transport.requests).toHaveLength(0);
});

test("explicit values take precedence over the environment record", async () => {
  const transport = scriptedFetch([exportResponse(homeExport)]);
  const site = await createPublishedSiteLoader({
    baseUrl: "https://explicit.example.test/cms",
    environment: { ...environment, LACE_EXPECTED_PUBLISHED_VERSION: "99" },
    expectedPublishedVersion: 3,
    fetch: transport.fetch,
    publicBaseUrl: "https://media.example.test",
    token: "explicit-token",
  })();
  expect(transport.requests[0].url).toBe(
    "https://explicit.example.test/cms/api/v1/public/build-export",
  );
  expect(transport.requests[0].headers.get("authorization")).toBe("Bearer explicit-token");
  expect(site.mediaUrl("hero-media")).toBe(
    "https://media.example.test/api/v1/public/media/hero-media",
  );
});

test("media URLs keep the export URL without a public origin and never carry the token", async () => {
  const transport = scriptedFetch([exportResponse(homeExport)]);
  const site = await createPublishedSiteLoader({
    environment: { ...environment, LACE_PUBLIC_BASE_URL: "" },
    fetch: transport.fetch,
  })();
  const url = site.mediaUrl("hero-media");
  expect(url).toBe("https://public.example.test/lace/api/v1/public/media/hero-media");
  expect(site.media("hero-media").url).toBe(url);
  expect(site.byPath("/").media("hero-media").url).toBe(url);
  // An ID the export does not resolve falls back to the API base URL.
  expect(site.mediaUrl("unknown")).toBe(
    "https://api.example.test/lace/api/v1/public/media/unknown",
  );
  expect(url).not.toContain(token);
});

test("a configured public origin rewrites resolved media URLs", async () => {
  const site = await createPublishedSiteLoader({
    environment: { ...environment, LACE_PUBLIC_BASE_URL: "https://media.example.test/base" },
    fetch: scriptedFetch([exportResponse(homeExport)]).fetch,
  })();
  const expected = "https://media.example.test/base/api/v1/public/media/hero-media";
  expect(site.media("hero-media").url).toBe(expected);
  expect(site.image("hero-media").url).toBe(expected);
  expect(site.mediaUrl("hero-media")).toBe(expected);
});

test("resolved media carry a token-free build source under the API base URL", async () => {
  const site = await createPublishedSiteLoader({
    environment: {
      ...environment,
      LACE_API_BASE_URL: "http://api:8787/lace",
      LACE_PUBLIC_BASE_URL: "https://cms.example.com",
    },
    fetch: scriptedFetch([exportResponse(homeExport)]).fetch,
  })();
  expect(site.media("hero-media").url).toBe(
    "https://cms.example.com/api/v1/public/media/hero-media",
  );
  expect(site.media("hero-media").sourceUrl).toBe(
    "http://api:8787/lace/api/v1/public/media/hero-media",
  );
  expect(site.image("hero-media").sourceUrl).toBe(site.media("hero-media").sourceUrl);
  expect(site.byPath("/").media("hero-media").sourceUrl).toBe(site.media("hero-media").sourceUrl);
  expect(site.media("hero-media").sourceUrl).not.toContain(token);
});

test("optimizeImages false leaves out build sources and nothing else", async () => {
  const optimized = await createPublishedSiteLoader({
    environment,
    fetch: scriptedFetch([exportResponse(homeExport)]).fetch,
  })();
  const site = await createPublishedSiteLoader({
    environment,
    fetch: scriptedFetch([exportResponse(homeExport)]).fetch,
    optimizeImages: false,
  })();
  expect(site.media("hero-media")).not.toHaveProperty("sourceUrl");
  expect(site.image("hero-media", "Team")).not.toHaveProperty("sourceUrl");
  const { sourceUrl: _sourceUrl, ...rest } = optimized.media("hero-media");
  expect(site.media("hero-media")).toEqual(rest);
  expect(site.mediaUrl("hero-media")).toBe(optimized.mediaUrl("hero-media"));
});

test("image lookups resolve the effective alt text and keep the media description", async () => {
  const site = await createPublishedSiteLoader({
    environment,
    fetch: scriptedFetch([exportResponse(homeExport)]).fetch,
  })();
  const home = site.byPath("/");
  expect(home.image("hero-media", "Team at work")).toEqual({
    alt: "Team at work",
    caption: "Our office",
    focalPoint: { x: 0.25, y: 0.4 },
    height: 900,
    id: "hero-media",
    mimeType: "image/png",
    sourceUrl: "https://api.example.test/lace/api/v1/public/media/hero-media",
    url: "https://public.example.test/lace/api/v1/public/media/hero-media",
    width: 1600,
  });
  expect(home.image("hero-media").alt).toBe("Office");
  expect(home.image("hero-media", "  ").alt).toBe("Office");
  expect(site.image("plain").alt).toBe("");
  expect(site.media("plain").alt).toBeNull();
  expect(site.media("unknown")).toBeUndefined();
  expect(site.image("unknown")).toBeUndefined();
  expect(site.media("__proto__")).toBeUndefined();
  expect(site.media("constructor")).toBeUndefined();
  expect(Object.isFrozen(site.media("hero-media"))).toBe(true);
  expect(Object.isFrozen(site.media("hero-media").focalPoint)).toBe(true);
});

test("the site view exposes published content only, ordered and immutable", async () => {
  const transport = scriptedFetch([exportResponse(homeExport)]);
  const site = await createPublishedSiteLoader({ environment, fetch: transport.fetch })();
  expect(site.version).toBe(3);
  const home = site.byPath("/");
  expect(home).toEqual({
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

test("static mode shares one export across sequential and concurrent calls", async () => {
  const transport = scriptedFetch([exportResponse(homeExport)]);
  const load = createPublishedSiteLoader({ environment, fetch: transport.fetch });
  const [first, second] = await Promise.all([load(), load()]);
  const third = await load();
  expect(first).toBe(second);
  expect(third).toBe(first);
  expect(transport.requests).toHaveLength(1);
  expect(transport.requests[0].headers.get("if-none-match")).toBeNull();
});

test("static mode forgets a failed read and retries", async () => {
  const transport = scriptedFetch([
    new TypeError("connect ECONNREFUSED"),
    exportResponse(homeExport),
  ]);
  const load = createPublishedSiteLoader({ environment, fetch: transport.fetch });
  const error = await captureError(load());
  expect(error.code).toBe("api_unavailable");
  const site = await load();
  expect(site.version).toBe(3);
  expect(transport.requests).toHaveLength(2);
});

test("revalidate mode sends the last ETag, reuses on 304, and replaces on change", async () => {
  const next = buildExport(4, [exportEntry({ id: "home", modelKey: "home", path: "/" })]);
  const transport = scriptedFetch([
    exportResponse(homeExport),
    notModified('"3"'),
    exportResponse(next),
  ]);
  const load = createPublishedSiteLoader({ environment, fetch: transport.fetch, revalidate: true });
  const first = await load();
  const second = await load();
  const third = await load();
  expect(second).toBe(first);
  expect(third.version).toBe(4);
  expect(transport.requests.map((request) => request.headers.get("if-none-match"))).toEqual([
    null,
    '"3"',
    '"3"',
  ]);
});

test("revalidate mode shares one in-flight request between concurrent calls", async () => {
  const gate = deferred();
  const transport = scriptedFetch([async () => (await gate.promise, exportResponse(homeExport))]);
  const load = createPublishedSiteLoader({ environment, fetch: transport.fetch, revalidate: true });
  const calls = [load(), load(), load()];
  gate.resolve();
  const sites = await Promise.all(calls);
  expect(new Set(sites).size).toBe(1);
  expect(transport.requests).toHaveLength(1);
});

test("a failed revalidation keeps the previous ETag for the next call", async () => {
  const transport = scriptedFetch([
    exportResponse(homeExport),
    new TypeError("socket hang up"),
    notModified('"3"'),
  ]);
  const load = createPublishedSiteLoader({ environment, fetch: transport.fetch, revalidate: true });
  const first = await load();
  expect((await captureError(load())).code).toBe("api_unavailable");
  expect(await load()).toBe(first);
  expect(transport.requests[2].headers.get("if-none-match")).toBe('"3"');
});

test.each([false, true])(
  "a 304 without a prior export is invalid (revalidate %s)",
  async (revalidate) => {
    const transport = scriptedFetch([notModified('"3"')]);
    const error = await captureError(
      createPublishedSiteLoader({ environment, fetch: transport.fetch, revalidate })(),
    );
    expect(error.code).toBe("invalid_export");
  },
);

test("an expected published version that differs fails the build", async () => {
  const transport = scriptedFetch([exportResponse(buildExport(8, []))]);
  const error = await captureError(
    createPublishedSiteLoader({
      environment: { ...environment, LACE_EXPECTED_PUBLISHED_VERSION: "7" },
      fetch: transport.fetch,
    })(),
  );
  expect(error.code).toBe("version_mismatch");
  expect(error.message).toContain("7");
  expect(error.message).toContain("8");
});

test("a matching expected version passes", async () => {
  const transport = scriptedFetch([exportResponse(homeExport)]);
  const site = await createPublishedSiteLoader({
    environment: { ...environment, LACE_EXPECTED_PUBLISHED_VERSION: "3" },
    fetch: transport.fetch,
  })();
  expect(site.version).toBe(3);
});

test.each([401, 403])("HTTP %i from the export is a rejected token", async (status) => {
  const transport = scriptedFetch([errorResponse(status)]);
  const error = await captureError(
    createPublishedSiteLoader({ environment, fetch: transport.fetch })(),
  );
  expect(error.code).toBe("rejected_token");
  expect(error.cause).toBeInstanceOf(LaceHttpError);
  expect(error.message).not.toContain(token);
});

test("caller hints are appended to the matching code only", async () => {
  const hints = {
    api_unavailable: "Run `pnpm dev:api` first.",
    rejected_token: "Use Admin Settings.",
  };
  const unavailable = await captureError(
    createPublishedSiteLoader({
      environment,
      fetch: scriptedFetch([new TypeError("offline")]).fetch,
      hints,
    })(),
  );
  expect(unavailable.message.endsWith(" Run `pnpm dev:api` first.")).toBe(true);
  expect(unavailable.message).not.toContain("Admin Settings");
});

test("other SDK failures propagate unchanged", async () => {
  const serverError = await captureError(
    createPublishedSiteLoader({
      environment,
      fetch: scriptedFetch([errorResponse(500, "INTERNAL_ERROR")]).fetch,
    })(),
  );
  expect(serverError).toBeInstanceOf(LaceHttpError);
  expect(serverError.status).toBe(500);
  const contractError = await captureError(
    createPublishedSiteLoader({
      environment,
      fetch: scriptedFetch([exportResponse({ entries: "nope", version: 1 }, '"1"')]).fetch,
    })(),
  );
  expect(contractError).toBeInstanceOf(LaceContractError);
});

test.each([
  [
    "duplicate paths",
    [
      exportEntry({ id: "a", modelKey: "home", path: "/" }),
      exportEntry({ id: "b", modelKey: "landing", path: "/" }),
    ],
    ["/"],
  ],
  [
    "duplicate slugs in a model",
    [
      exportEntry({ id: "a", path: "/blog/hello", slug: "hello" }),
      exportEntry({ id: "b", path: "/news/hello", slug: "hello" }),
    ],
    ["posts", "hello"],
  ],
])("rejects %s", async (_name, entries, named) => {
  const error = await captureError(
    createPublishedSiteLoader({
      environment,
      fetch: scriptedFetch([exportResponse(buildExport(1, entries))]).fetch,
    })(),
  );
  expect(error.code).toBe("invalid_export");
  for (const value of named) expect(error.message).toContain(value);
});

test("the same slug in different models is allowed", async () => {
  const site = await createPublishedSiteLoader({
    environment,
    fetch: scriptedFetch([
      exportResponse(
        buildExport(1, [
          exportEntry({ id: "a", path: "/blog/hello", slug: "hello" }),
          exportEntry({ id: "b", modelKey: "notes", path: "/notes/hello", slug: "hello" }),
        ]),
      ),
    ]).fetch,
  })();
  expect(site.bySlug("notes", "hello")?.id).toBe("b");
});

test("rejects a legacy-shaped export as a contract violation", async () => {
  const legacy = {
    entries: [{ entry: { draft: {}, id: "home", model: {}, published: {} }, path: "/" }],
    version: 1,
  };
  const error = await captureError(
    createPublishedSiteLoader({
      environment,
      fetch: scriptedFetch([exportResponse(legacy)]).fetch,
    })(),
  );
  expect(error).toBeInstanceOf(LaceContractError);
});

test("an export in a newer format fails with invalid_export and upgrade guidance", async () => {
  const error = await captureError(
    createPublishedSiteLoader({
      environment,
      fetch: scriptedFetch([exportResponse({ ...buildExport(2, []), formatVersion: 2 })]).fetch,
    })(),
  );
  expect(error).toBeInstanceOf(LaceSdkError);
  expect(error.code).toBe("invalid_export");
  expect(error.message).toContain("Upgrade @lacecms/sdk");
  expect(error.message).not.toContain(token);
  expect(error.cause).toBeInstanceOf(LaceContractError);
  expect(error.cause).toMatchObject({ received: 2, supported: 1 });
});

test("revalidation retains the latest weak 304 validator and recovers after malformed headers", async () => {
  const conditions = [];
  const responses = [
    exportResponse(buildExport(7, [])),
    notModified('W/"7"'),
    exportResponse(buildExport(8, []), '"bad"'),
    exportResponse(buildExport(8, []), 'W/"8"'),
  ];
  const getSite = createPublishedSiteLoader({
    baseUrl: "https://cms.example",
    token: "build-secret",
    revalidate: true,
    fetch: async (_url, init) => {
      conditions.push(new Headers(init.headers).get("if-none-match"));
      return responses.shift();
    },
  });
  const first = await getSite();
  expect(await getSite()).toBe(first);
  await expect(getSite()).rejects.toBeInstanceOf(LaceContractError);
  expect((await getSite()).version).toBe(8);
  expect(conditions).toEqual([null, '"7"', 'W/"7"', 'W/"7"']);
});

function exportGlobal({
  id = "settings-entry",
  modelKey = "settings",
  blocks = [],
  fields = {},
} = {}) {
  return { blocks, fields, id, modelKey, publishedAt: timestamp };
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
  const settings = site.global("settings");
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
  expect(error.code).toBe("invalid_export");
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
  expect(site.byPath("/blog/hello").seo).toEqual(seo);
  expect(Object.isFrozen(site.byPath("/blog/hello").seo)).toBe(true);
  expect(site.byPath("/notes/n").seo).toBeUndefined();
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
  expect(error.code).toBe("missing_configuration");
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
  expect(error.code).toBe("missing_configuration");
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

test("revalidate mode keeps the settings of the read that produced the view", async () => {
  const env = { ...environment, LACE_BUILD_SITE_URL: "https://one.example/" };
  const load = createPublishedSiteLoader({
    environment: env,
    fetch: scriptedFetch([
      exportResponse(homeExport),
      exportResponse({ ...homeExport, version: 4 }),
    ]).fetch,
    revalidate: true,
  });
  const first = await load();
  env.LACE_BUILD_SITE_URL = "https://two.example/";
  const second = await load();
  expect(first.url).toBe("https://one.example/");
  expect(second.url).toBe("https://two.example/");
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
  expect(site.byPath("/").blocks).toEqual([anchored, block("second", 1)]);

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
  const entry = site.byPath("/blog/nested");
  expect(entry.fields).toEqual(fields);
  expect(entry.blocks[0].data.images).toEqual(["portrait"]);
  expect(entry.image(entry.fields.team[0].profile.photo)).toMatchObject({ id: "portrait" });
  expect(site.global("settings").fields).toEqual(fields);
});

function pagedExport(version, paths) {
  const pages = paths.map((group, index) => {
    const entries = group.map((path) =>
      exportEntry({ id: `post-${path.slice(-1)}`, path, slug: path.slice(-1) }),
    );
    const nextCursor = index < paths.length - 1 ? `cursor-${version}-${index}` : undefined;
    const page = {
      entries,
      formatVersion: 1,
      media: {},
      ...(nextCursor === undefined ? {} : { nextCursor }),
      version,
    };
    return index === 0 ? { ...page, globals: [], seo: { defaults: null, models: {} } } : page;
  });
  return pages.map((page) => exportResponse(page));
}

function versionChanged(expectedVersion, actualVersion) {
  return Response.json(
    {
      error: {
        code: "BUILD_EXPORT_VERSION_CHANGED",
        details: { actualVersion, expectedVersion },
        message: "Changed.",
      },
    },
    { status: 409 },
  );
}

const threePages = [["/blog/a"], ["/blog/b"], ["/blog/c"]];

test("static mode reads one complete page traversal for every call", async () => {
  const transport = scriptedFetch(pagedExport(5, threePages));
  const load = createPublishedSiteLoader({ environment, fetch: transport.fetch });
  const sites = await Promise.all([load(), load(), load()]);
  expect(await load()).toBe(sites[0]);
  expect(new Set(sites).size).toBe(1);
  expect(sites[0].allEntries().map((entry) => entry.path)).toEqual([
    "/blog/a",
    "/blog/b",
    "/blog/c",
  ]);
  expect(transport.requests.map((request) => new URL(request.url).search)).toEqual([
    "",
    "?after=cursor-5-0",
    "?after=cursor-5-1",
  ]);
});

test("static mode restarts a traversal that failed on a later page", async () => {
  const transport = scriptedFetch([
    pagedExport(5, threePages)[0],
    new TypeError("socket hang up"),
    ...pagedExport(5, threePages),
  ]);
  const load = createPublishedSiteLoader({ environment, fetch: transport.fetch });
  expect((await captureError(load())).code).toBe("api_unavailable");
  expect((await load()).allEntries()).toHaveLength(3);
  expect(transport.requests.map((request) => new URL(request.url).search)).toEqual([
    "",
    "?after=cursor-5-0",
    "",
    "?after=cursor-5-0",
    "?after=cursor-5-1",
  ]);
});

test("revalidate mode reuses on a first-page 304 and traverses a changed export", async () => {
  const transport = scriptedFetch([
    ...pagedExport(3, [["/blog/a"], ["/blog/b"]]),
    notModified('"3"'),
    ...pagedExport(4, [["/blog/a"], ["/blog/b"], ["/blog/c"]]),
  ]);
  const load = createPublishedSiteLoader({ environment, fetch: transport.fetch, revalidate: true });
  const first = await load();
  expect(await load()).toBe(first);
  const next = await load();
  expect(next.version).toBe(4);
  expect(next.allEntries()).toHaveLength(3);
  expect(transport.requests.map((request) => request.headers.get("if-none-match"))).toEqual([
    null,
    null,
    '"3"',
    '"3"',
    null,
    null,
  ]);
});

test("an expected version is checked on the first page before continuing", async () => {
  const pinned = { ...environment, LACE_EXPECTED_PUBLISHED_VERSION: "7" };
  const early = scriptedFetch(pagedExport(8, threePages));
  const mismatch = await captureError(
    createPublishedSiteLoader({ environment: pinned, fetch: early.fetch })(),
  );
  expect(mismatch.code).toBe("version_mismatch");
  expect(mismatch.message).toContain("expected version 7, received 8");
  expect(early.requests).toHaveLength(1);

  const [page] = pagedExport(7, threePages);
  const interrupted = scriptedFetch([page, versionChanged(7, 8)]);
  const changed = await captureError(
    createPublishedSiteLoader({ environment: pinned, fetch: interrupted.fetch })(),
  );
  expect(changed.code).toBe("version_mismatch");
  expect(changed.message).toContain("expected version 7, received 8");
  expect(interrupted.requests).toHaveLength(2);
});

test("an export that keeps changing fails with version_mismatch after one restart", async () => {
  const [firstAttempt] = pagedExport(5, threePages);
  const [secondAttempt] = pagedExport(6, threePages);
  const transport = scriptedFetch([
    firstAttempt,
    versionChanged(5, 6),
    secondAttempt,
    versionChanged(6, 7),
  ]);
  const error = await captureError(
    createPublishedSiteLoader({ environment, fetch: transport.fetch })(),
  );
  expect(error.code).toBe("version_mismatch");
  expect(error.message).toContain("kept changing");
  expect(transport.requests).toHaveLength(4);

  const recovered = scriptedFetch([
    pagedExport(5, threePages)[0],
    versionChanged(5, 6),
    ...pagedExport(6, threePages),
  ]);
  expect((await createPublishedSiteLoader({ environment, fetch: recovered.fetch })()).version).toBe(
    6,
  );
});

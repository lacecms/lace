// @ts-nocheck
// TODO(rf2): Type mutable export fixtures, scripted transports and invalid loader inputs.
import { expect, test } from "vitest";
import { LaceContractError, LaceHttpError, LaceSdkError } from "../client/errors.js";
import { LacePublishedSiteError, createPublishedSiteLoader } from "./published-site.js";

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
    internalLinks: [],
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
    formatVersion: 2,
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
      fetch: scriptedFetch([exportResponse({ ...buildExport(2, []), formatVersion: 3 })]).fetch,
    })(),
  );
  expect(error).toBeInstanceOf(LaceSdkError);
  expect(error.code).toBe("invalid_export");
  expect(error.message).toContain("Upgrade @lacecms/sdk");
  expect(error.message).not.toContain(token);
  expect(error.cause).toBeInstanceOf(LaceContractError);
  expect(error.cause).toMatchObject({ received: 3, supported: 2 });
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

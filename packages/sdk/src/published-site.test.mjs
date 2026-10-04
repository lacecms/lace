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

function snapshot(id, state, overrides = {}) {
  return {
    blocks: [],
    createdAt: timestamp,
    entryId: id,
    fields: {},
    id: `${id}-${state}`,
    revision: 1,
    state,
    title: `${id} ${state}`,
    updatedAt: timestamp,
    updatedBy: { id: "admin-1", role: "admin" },
    ...overrides,
  };
}

function exportEntry({ id, modelKey = "posts", path, slug, blocks = [], fields = {} }) {
  const published = snapshot(id, "published", {
    blocks,
    fields,
    ...(slug === undefined ? {} : { slug }),
  });
  return {
    entry: {
      draft: snapshot(id, "draft", { blocks: [{ ...block("draft-only", 0), type: "quote" }] }),
      id,
      model:
        slug === undefined
          ? { key: modelKey, kind: "page", path }
          : { key: modelKey, kind: "collection", route: "/anything/:slug" },
      published,
    },
    path,
  };
}

function block(key, position, data = { heading: key }) {
  return { data, key, position, schemaVersion: 1, type: "hero" };
}

function buildExport(version, entries) {
  return { entries, version };
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

const homeExport = buildExport(3, [
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
]);

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

test("media URLs fall back to the API base URL and never carry the token", async () => {
  const transport = scriptedFetch([exportResponse(homeExport)]);
  const site = await createPublishedSiteLoader({
    environment: { ...environment, LACE_PUBLIC_BASE_URL: "" },
    fetch: transport.fetch,
  })();
  const url = site.mediaUrl("hero-media");
  expect(url).toBe("https://api.example.test/lace/api/v1/public/media/hero-media");
  expect(url).not.toContain(token);
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
    modelKey: "home",
    path: "/",
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

test("rejects an entry without a published snapshot", async () => {
  const entry = exportEntry({ id: "draft-only", modelKey: "home", path: "/" });
  delete entry.entry.published;
  const error = await captureError(
    createPublishedSiteLoader({
      environment,
      fetch: scriptedFetch([exportResponse(buildExport(1, [entry]))]).fetch,
    })(),
  );
  expect(error.code).toBe("invalid_export");
  expect(error.message).toContain("draft-only");
});

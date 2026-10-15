import { expect, test } from "vitest";
import {
  LaceContractError,
  LaceHttpError,
  LaceTimeoutError,
  LaceTransportError,
  LaceUnsupportedExportFormatError,
  createLaceClient,
  packageName,
  userAgent,
} from "../dist/index.js";

const timestamp = "2026-09-20T00:00:00.000Z";

function publicEntry({ id = "entry-1", modelKey = "posts", path = "/blog/entry-1" } = {}) {
  return { blocks: [], fields: {}, id, modelKey, path, publishedAt: timestamp, title: id };
}

function mediaItem(id, alt = null) {
  return {
    alt,
    caption: null,
    focalPoint: null,
    height: null,
    id,
    mimeType: "image/png",
    url: `https://cms.example/api/v1/public/media/${id}`,
    width: null,
  };
}

function single(options) {
  return { entry: publicEntry(options), media: {} };
}

function json(value, init) {
  return Response.json(value, init);
}

function queuedFetch(responses) {
  const requests = [];
  return {
    fetch: async (url, init) => {
      requests.push({ headers: new Headers(init.headers), url: url.toString() });
      const response = responses.shift();
      if (response === undefined) throw new Error("Unexpected request.");
      return response;
    },
    requests,
  };
}

function abortingFetch(_url, init) {
  return new Promise((_resolve, reject) => {
    if (init.signal?.aborted) {
      reject(init.signal.reason);
      return;
    }
    init.signal?.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  });
}

test("exports its package identity", () => expect(packageName).toBe("@lacecms/sdk"));

test("reads public resources with normalized base paths and encoded inputs", async () => {
  const mock = queuedFetch([
    json(single({ modelKey: "home", path: "/" })),
    json({ items: [publicEntry()], media: {}, nextCursor: "cursor-2" }),
    json(single({ id: "entry-two", path: "/blog/second" })),
    json(single({ id: "entry-three", path: "/blog/third" })),
  ]);
  const client = createLaceClient({ baseUrl: "https://cms.example/lace", fetch: mock.fetch });

  await client.getPage("home");
  await client.getCollection("posts", { after: "cursor-1", limit: 25 });
  await client.getCollectionBySlug("posts", "second");
  await client.getByPath("/blog/third");

  expect(mock.requests.map((request) => request.url)).toEqual([
    "https://cms.example/lace/api/v1/public/pages/home",
    "https://cms.example/lace/api/v1/public/collections/posts?after=cursor-1&limit=25",
    "https://cms.example/lace/api/v1/public/collections/posts/second",
    "https://cms.example/lace/api/v1/public/content/by-path?path=%2Fblog%2Fthird",
  ]);
  expect(mock.requests[0].headers.get("authorization")).toBeNull();
  expect(mock.requests[0].headers.get("user-agent")).toBe(userAgent);
  expect(client.getPublicMediaUrl("media/a?x=y")).toBe(
    "https://cms.example/lace/api/v1/public/media/media%2Fa%3Fx%3Dy",
  );
});

test("follows cursors only through getAllCollection", async () => {
  const mock = queuedFetch([
    json({
      items: [publicEntry({ id: "one" })],
      media: { b: mediaItem("b", "Old"), c: mediaItem("c") },
      nextCursor: "opaque+cursor",
    }),
    json({ items: [publicEntry({ id: "two" })], media: { a: mediaItem("a"), b: mediaItem("b") } }),
  ]);
  const client = createLaceClient({ baseUrl: "https://cms.example/", fetch: mock.fetch });

  const all = await client.getAllCollection("posts", { limit: 1 });

  expect(all.items.map((entry) => entry.id)).toEqual(["one", "two"]);
  expect(Object.keys(all.media)).toEqual(["a", "b", "c"]);
  expect(all.media.b.alt).toBeNull();
  expect(mock.requests.map((request) => request.url)).toEqual([
    "https://cms.example/api/v1/public/collections/posts?limit=1",
    "https://cms.example/api/v1/public/collections/posts?after=opaque%2Bcursor&limit=1",
  ]);
});

test("scopes the build token to exports and supports changed and unchanged exports", async () => {
  const mock = queuedFetch([
    json(
      {
        globals: [],
        seo: { defaults: null, models: {} },
        formatVersion: 1,
        entries: [publicEntry()],
        media: {},
        version: 7,
      },
      { headers: { etag: '"7"' } },
    ),
    new Response(null, { headers: { etag: '"7"' }, status: 304 }),
    json(single({ modelKey: "home", path: "/" })),
  ]);
  const client = createLaceClient({
    baseUrl: "https://cms.example/lace/",
    fetch: mock.fetch,
    token: "build-secret",
  });

  await expect(client.getBuildExport()).resolves.toMatchObject({
    changed: true,
    etag: '"7"',
    export: { version: 7 },
  });
  await expect(client.getBuildExport({ etag: '"7"' })).resolves.toEqual({
    changed: false,
    etag: '"7"',
  });
  await client.getPage("home");

  expect(mock.requests[0].headers.get("authorization")).toBe("Bearer build-secret");
  expect(mock.requests[1].headers.get("authorization")).toBe("Bearer build-secret");
  expect(mock.requests[1].headers.get("if-none-match")).toBe('"7"');
  expect(mock.requests[2].headers.get("authorization")).toBeNull();
});

test("maps Lace error envelopes and rejects malformed server data", async () => {
  const httpMock = queuedFetch([
    json(
      { error: { code: "NOT_FOUND", message: "The requested resource was not found." } },
      { status: 404 },
    ),
  ]);
  const httpClient = createLaceClient({ baseUrl: "https://cms.example", fetch: httpMock.fetch });
  let failure;
  try {
    await httpClient.getPage("missing");
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(LaceHttpError);
  expect(failure).toMatchObject({
    code: "NOT_FOUND",
    status: 404,
  });

  const malformedMock = queuedFetch([json({ formatVersion: 1, entries: "not-an-array" })]);
  const malformedClient = createLaceClient({
    baseUrl: "https://cms.example",
    fetch: malformedMock.fetch,
  });
  await expect(malformedClient.getCollection("posts")).rejects.toBeInstanceOf(LaceContractError);
});

test("maps a rejected build export without requiring an ETag", async () => {
  const mock = queuedFetch([
    json(
      { error: { code: "AUTHORIZATION_DENIED", message: "The build token is invalid." } },
      { status: 403 },
    ),
  ]);
  const client = createLaceClient({ baseUrl: "https://cms.example", fetch: mock.fetch });

  await expect(client.getBuildExport()).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
    status: 403,
  });
});

test("distinguishes timeout and caller abort transport failures", async () => {
  const timedClient = createLaceClient({
    baseUrl: "https://cms.example",
    fetch: abortingFetch,
    timeoutMs: 1,
  });
  await expect(timedClient.getPage("home")).rejects.toBeInstanceOf(LaceTimeoutError);

  const controller = new AbortController();
  const callerClient = createLaceClient({ baseUrl: "https://cms.example", fetch: abortingFetch });
  const pending = callerClient.getPage("home", { signal: controller.signal });
  const reason = new Error("caller cancelled");
  controller.abort(reason);
  await expect(pending).rejects.toBeInstanceOf(LaceTransportError);
  await expect(pending).rejects.toMatchObject({ cause: reason });
});

test.each(['"7"', 'W/"7"'])("preserves received and supplied build validators %s", async (etag) => {
  const mock = queuedFetch([
    json(
      {
        globals: [],
        seo: { defaults: null, models: {} },
        formatVersion: 1,
        entries: [publicEntry()],
        media: {},
        version: 7,
      },
      { headers: { etag } },
    ),
    new Response(null, { headers: { etag: 'W/"7"' }, status: 304 }),
  ]);
  const client = createLaceClient({ baseUrl: "https://cms.example", fetch: mock.fetch });
  expect(await client.getBuildExport()).toMatchObject({ etag, export: { version: 7 } });
  expect(await client.getBuildExport({ etag })).toEqual({ changed: false, etag: 'W/"7"' });
  expect(mock.requests[1].headers.get("if-none-match")).toBe(etag);
});

test.each([200, 304])("diagnoses missing and invalid ETags on %i safely", async (status) => {
  const token = "build-secret";
  for (const etag of [
    null,
    "",
    'W/"hash"',
    'w/"7"',
    "*",
    '"7", "8"',
    '"9007199254740992"',
    `Bearer ${token}\t${"x".repeat(200)}`,
  ]) {
    const response = new Response(status === 200 ? "PRIVATE EXPORT BODY" : null, {
      headers: etag === null ? {} : { etag },
      status,
    });
    const client = createLaceClient({
      baseUrl: "https://cms.example",
      token,
      fetch: async () => response,
    });
    const error = await client.getBuildExport({ etag: '"7"' }).catch((cause) => cause);
    expect(error).toBeInstanceOf(LaceContractError);
    expect(error.message).toContain(etag === null ? "missing its ETag" : "invalid ETag");
    expect(error.message).toContain('Expected "N" or W/"N"');
    expect(error.message).toContain("proxy preserves ETag");
    expect(error.message).not.toContain(token);
    expect(error.message).not.toContain("PRIVATE EXPORT BODY");
    expect(error.message).not.toContain("\t");
    expect(error.message.length).toBeLessThan(800);
    if (etag?.startsWith("Bearer")) {
      expect(error.message).toContain("[redacted]");
      expect(error.message).toContain("truncated");
      expect(error.message).toContain("\\t");
    }
  }
});

test("rejects inconsistent response versions and malformed caller validators", async () => {
  for (const response of [
    json(
      {
        globals: [],
        seo: { defaults: null, models: {} },
        formatVersion: 1,
        entries: [publicEntry()],
        media: {},
        version: 8,
      },
      { headers: { etag: 'W/"7"' } },
    ),
    new Response(null, { headers: { etag: 'W/"8"' }, status: 304 }),
  ]) {
    const client = createLaceClient({
      baseUrl: "https://cms.example",
      fetch: async () => response,
    });
    await expect(client.getBuildExport({ etag: '"7"' })).rejects.toBeInstanceOf(LaceContractError);
  }
  const mock = queuedFetch([]);
  const client = createLaceClient({ baseUrl: "https://cms.example", fetch: mock.fetch });
  await expect(client.getBuildExport({ etag: 'W/"hash"' })).rejects.toBeInstanceOf(TypeError);
  expect(mock.requests).toHaveLength(0);
});

test("reads a published global by model key and validates its shape", async () => {
  const global = {
    blocks: [],
    fields: { siteName: "Lace" },
    id: "settings-entry",
    modelKey: "settings",
    publishedAt: "2026-09-20T00:00:00.000Z",
  };
  const mock = queuedFetch([
    json({ global, media: { logo: mediaItem("logo") } }),
    json({ global: { ...global, path: "/settings" }, media: {} }),
    json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 }),
    json(
      {
        globals: [],
        seo: { defaults: null, models: {} },
        formatVersion: 1,
        entries: [],
        media: {},
        version: 3,
      },
      { headers: { etag: '"3"' } },
    ),
  ]);
  const client = createLaceClient({ baseUrl: "https://cms.example/lace/", fetch: mock.fetch });

  await expect(client.getGlobal("settings")).resolves.toEqual({
    global,
    media: { logo: mediaItem("logo") },
  });
  // A newer API's extra key is ignored rather than rejected.
  await expect(client.getGlobal("settings")).resolves.toEqual({ global, media: {} });
  await expect(client.getGlobal("missing")).rejects.toMatchObject({ status: 404 });
  expect(() => client.getGlobal("")).toThrow(TypeError);
  await expect(client.getBuildExport()).resolves.toMatchObject({
    export: { globals: [], version: 3 },
  });
  expect(mock.requests.map((request) => request.url)).toEqual([
    "https://cms.example/lace/api/v1/public/globals/settings",
    "https://cms.example/lace/api/v1/public/globals/settings",
    "https://cms.example/lace/api/v1/public/globals/missing",
    "https://cms.example/lace/api/v1/public/build-export",
  ]);
});

test("ignores keys a newer API adds while enforcing required values", async () => {
  const future = { addedLater: { nested: true } };
  const entry = {
    ...publicEntry(),
    ...future,
    blocks: [
      {
        data: { heading: "Hi", contentKey: 1 },
        key: "b1",
        position: 1000,
        schemaVersion: 1,
        settings: {},
        type: "hero",
        ...future,
      },
    ],
    seo: {
      canonical: null,
      description: null,
      image: null,
      noindex: false,
      title: null,
      ...future,
    },
  };
  const media = { m1: { ...mediaItem("m1"), ...future, focalPoint: { x: 0, y: 1, ...future } } };
  const mock = queuedFetch([
    json({ entry, media, ...future }),
    json({ items: [entry], media, ...future }),
    json({ global: { ...publicEntry(), ...future }, media: {} }),
    json({ entry: { ...publicEntry(), publishedAt: undefined }, media: {} }),
    json({ entry: { ...publicEntry(), title: 42 }, media: {} }),
  ]);
  const client = createLaceClient({ baseUrl: "https://cms.example", fetch: mock.fetch });

  const page = await client.getPage("home");
  expect(page).toEqual({
    entry: {
      ...publicEntry(),
      blocks: [
        {
          data: { contentKey: 1, heading: "Hi" },
          key: "b1",
          position: 1000,
          schemaVersion: 1,
          settings: {},
          type: "hero",
        },
      ],
      seo: { canonical: null, description: null, image: null, noindex: false, title: null },
    },
    media: { m1: { ...mediaItem("m1"), focalPoint: { x: 0, y: 1 } } },
  });
  expect(JSON.stringify(page)).not.toContain("addedLater");
  expect(JSON.stringify(await client.getCollection("posts"))).not.toContain("addedLater");
  await expect(client.getGlobal("settings")).resolves.toEqual({
    global: { blocks: [], fields: {}, id: "entry-1", modelKey: "posts", publishedAt: timestamp },
    media: {},
  });
  // A missing required value and a wrong type still violate the contract.
  await expect(client.getPage("home")).rejects.toBeInstanceOf(LaceContractError);
  await expect(client.getPage("home")).rejects.toBeInstanceOf(LaceContractError);
});

test("reports an error code introduced by a newer API", async () => {
  const mock = queuedFetch([
    json(
      { error: { code: "FUTURE_CONDITION", message: "Later.", addedLater: true } },
      { status: 409 },
    ),
  ]);
  const client = createLaceClient({ baseUrl: "https://cms.example", fetch: mock.fetch });
  const failure = await client.getPage("home").catch((error) => error);
  expect(failure).toBeInstanceOf(LaceHttpError);
  expect(failure).toMatchObject({ code: "FUTURE_CONDITION", status: 409 });
});

test("rejects a build export in a newer format with upgrade guidance", async () => {
  const mock = queuedFetch([
    json(
      {
        globals: [],
        seo: { defaults: null, models: {} },
        formatVersion: 2,
        entries: [],
        media: {},
        version: 4,
        addedLater: true,
      },
      { headers: { etag: '"4"' } },
    ),
    json(
      {
        globals: [],
        seo: { defaults: null, models: {} },
        formatVersion: 1,
        entries: [],
        media: {},
        version: 4,
        addedLater: true,
      },
      { headers: { etag: '"4"' } },
    ),
  ]);
  const client = createLaceClient({
    baseUrl: "https://cms.example",
    fetch: mock.fetch,
    token: "build-secret",
  });
  const failure = await client.getBuildExport().catch((error) => error);
  expect(failure).toBeInstanceOf(LaceUnsupportedExportFormatError);
  expect(failure).toBeInstanceOf(LaceContractError);
  expect(failure).toMatchObject({ received: 2, supported: 1 });
  expect(failure.message).toContain("Upgrade @lacecms/sdk");
  expect(failure.message).not.toContain("build-secret");

  const supported = await client.getBuildExport();
  expect(supported.export).toEqual({
    entries: [],
    formatVersion: 1,
    globals: [],
    media: {},
    seo: { defaults: null, models: {} },
    version: 4,
  });
});

const exportBase = "https://cms.example/api/v1/public/build-export";
const exportSeo = { defaults: null, models: { posts: { description: "summary", image: null } } };

function firstPage(version, paths, { media = {}, nextCursor, ...extra } = {}) {
  return {
    entries: paths.map((path) =>
      publicEntry({ id: path === "/" ? "home" : path.slice(1).replaceAll("/", "-"), path }),
    ),
    formatVersion: 1,
    globals: [{ blocks: [], fields: {}, id: "g", modelKey: "settings", publishedAt: timestamp }],
    media,
    ...(nextCursor === undefined ? {} : { nextCursor }),
    seo: exportSeo,
    version,
    ...extra,
  };
}

function nextPage(version, paths, { media = {}, nextCursor, ...extra } = {}) {
  const {
    globals: _globals,
    seo: _seo,
    ...page
  } = firstPage(version, paths, {
    media,
    nextCursor,
  });
  return { ...page, ...extra };
}

function page(value) {
  return json(value, { headers: { etag: `"${value.version}"` } });
}

function changed(expectedVersion, actualVersion) {
  return json(
    {
      error: {
        code: "BUILD_EXPORT_VERSION_CHANGED",
        details: { actualVersion, expectedVersion },
        message: "Published content changed during the build export.",
      },
    },
    { status: 409 },
  );
}

test("assembles a multi-page build export with merged media", async () => {
  const mock = queuedFetch([
    page(firstPage(9, ["/", "/a"], { media: { m2: mediaItem("m2") }, nextCursor: "c1" })),
    page(
      nextPage(9, ["/b"], {
        media: { m1: mediaItem("m1"), m2: mediaItem("m2") },
        nextCursor: "c2",
      }),
    ),
    page(nextPage(9, ["/c"], { media: { m1: mediaItem("m1") } })),
  ]);
  const client = createLaceClient({
    baseUrl: "https://cms.example/",
    fetch: mock.fetch,
    token: "t",
  });
  const result = await client.getBuildExport({ etag: '"8"', pageSize: 2 });
  expect(result.changed).toBe(true);
  expect(result.etag).toBe('"9"');
  expect(result.export.entries.map((entry) => entry.path)).toEqual(["/", "/a", "/b", "/c"]);
  expect(result.export.globals.map((global) => global.id)).toEqual(["g"]);
  expect(result.export.seo).toEqual(exportSeo);
  expect(result.export).toMatchObject({ formatVersion: 1, version: 9 });
  expect(Object.keys(result.export.media)).toEqual(["m1", "m2"]);
  expect(result.export).not.toHaveProperty("nextCursor");
  expect(mock.requests.map((request) => request.url)).toEqual([
    `${exportBase}?limit=2`,
    `${exportBase}?after=c1&limit=2`,
    `${exportBase}?after=c2&limit=2`,
  ]);
  // Only the first page is conditional; every page carries the build token.
  expect(mock.requests.map((request) => request.headers.get("if-none-match"))).toEqual([
    '"8"',
    null,
    null,
  ]);
  expect(
    mock.requests.every((request) => request.headers.get("authorization") === "Bearer t"),
  ).toBe(true);
});

test("an unchanged first page ends the traversal without parsing a body", async () => {
  const response = new Response(null, { headers: { etag: '"9"' }, status: 304 });
  response.json = () => {
    throw new Error("A 304 body must not be parsed.");
  };
  const mock = queuedFetch([response]);
  const client = createLaceClient({ baseUrl: "https://cms.example/", fetch: mock.fetch });
  await expect(client.getBuildExport({ etag: 'W/"9"' })).resolves.toEqual({
    changed: false,
    etag: '"9"',
  });
  expect(mock.requests).toHaveLength(1);
});

test("restarts once from an unconditional first page when content changes", async () => {
  const mock = queuedFetch([
    page(firstPage(9, ["/a"], { nextCursor: "c1" })),
    changed(9, 10),
    page(firstPage(10, ["/a"], { nextCursor: "c2" })),
    page(nextPage(10, ["/b"])),
  ]);
  const client = createLaceClient({ baseUrl: "https://cms.example/", fetch: mock.fetch });
  const result = await client.getBuildExport({ etag: '"8"' });
  expect(result).toMatchObject({ etag: '"10"', export: { version: 10 } });
  expect(result.export.entries.map((entry) => entry.path)).toEqual(["/a", "/b"]);
  expect(mock.requests.map((request) => request.headers.get("if-none-match"))).toEqual([
    '"8"',
    null,
    null,
    null,
  ]);

  const persistent = queuedFetch([
    page(firstPage(9, ["/a"], { nextCursor: "c1" })),
    changed(9, 10),
    page(firstPage(10, ["/a"], { nextCursor: "c2" })),
    changed(10, 11),
  ]);
  const failing = createLaceClient({ baseUrl: "https://cms.example/", fetch: persistent.fetch });
  const failure = await failing.getBuildExport().catch((error) => error);
  expect(failure).toBeInstanceOf(LaceHttpError);
  expect(failure).toMatchObject({
    code: "BUILD_EXPORT_VERSION_CHANGED",
    details: { actualVersion: 11, expectedVersion: 10 },
    status: 409,
  });
  expect(persistent.requests).toHaveLength(4);

  const once = queuedFetch([page(firstPage(9, ["/a"], { nextCursor: "c1" })), changed(9, 10)]);
  const pinned = createLaceClient({ baseUrl: "https://cms.example/", fetch: once.fetch });
  await expect(pinned.getBuildExport({ restart: false })).rejects.toMatchObject({ status: 409 });
  expect(once.requests).toHaveLength(2);
});

test("rejects build-export pages that disagree", async () => {
  const cases = [
    ["version", [firstPage(9, ["/a"], { nextCursor: "c" }), nextPage(8, ["/b"])]],
    ["repeated path", [firstPage(9, ["/a", "/b"], { nextCursor: "c" }), nextPage(9, ["/b"])]],
    ["earlier path", [firstPage(9, ["/b"], { nextCursor: "c" }), nextPage(9, ["/a"])]],
    [
      "media",
      [
        firstPage(9, ["/a"], { media: { m: mediaItem("m") }, nextCursor: "c" }),
        nextPage(9, ["/b"], { media: { m: mediaItem("m", "Changed") } }),
      ],
    ],
    [
      "continuation globals",
      [firstPage(9, ["/a"], { nextCursor: "c" }), { ...nextPage(9, ["/b"]), globals: [] }],
    ],
    [
      "continuation seo",
      [firstPage(9, ["/a"], { nextCursor: "c" }), { ...nextPage(9, ["/b"]), seo: exportSeo }],
    ],
    [
      "empty page with cursor",
      [firstPage(9, ["/a"], { nextCursor: "c" }), nextPage(9, [], { nextCursor: "d" })],
    ],
    ["first page without globals", [nextPage(9, ["/a"])]],
    ["first page without seo", [{ ...firstPage(9, ["/a"]), seo: undefined }]],
  ];
  for (const [name, pages] of cases) {
    const mock = queuedFetch(pages.map((value) => page(value)));
    const client = createLaceClient({ baseUrl: "https://cms.example/", fetch: mock.fetch });
    const failure = await client.getBuildExport().catch((error) => error);
    expect(failure, name).toBeInstanceOf(LaceContractError);
  }
  // A page whose ETag encodes another version is a contract violation too.
  const mismatched = queuedFetch([
    page(firstPage(9, ["/a"], { nextCursor: "c" })),
    json(nextPage(9, ["/b"]), { headers: { etag: '"10"' } }),
  ]);
  const client = createLaceClient({ baseUrl: "https://cms.example/", fetch: mismatched.fetch });
  await expect(client.getBuildExport()).rejects.toBeInstanceOf(LaceContractError);
});

test("reads single build-export pages and calls the first-page hook first", async () => {
  const mock = queuedFetch([
    page(firstPage(9, ["/a"], { nextCursor: "c1", addedLater: true })),
    page(nextPage(9, ["/b"])),
    new Response(null, { headers: { etag: '"9"' }, status: 304 }),
  ]);
  const client = createLaceClient({ baseUrl: "https://cms.example/", fetch: mock.fetch });
  const first = await client.getBuildExportPage({ limit: 1 });
  expect(first).toMatchObject({
    changed: true,
    etag: '"9"',
    page: { nextCursor: "c1", version: 9 },
  });
  expect(first.page).not.toHaveProperty("addedLater");
  const next = await client.getBuildExportPage({ after: "c1", limit: 1 });
  expect(next.page).not.toHaveProperty("globals");
  expect(await client.getBuildExportPage({ etag: '"9"' })).toEqual({ changed: false, etag: '"9"' });
  expect(mock.requests.map((request) => request.url)).toEqual([
    `${exportBase}?limit=1`,
    `${exportBase}?after=c1&limit=1`,
    exportBase,
  ]);
  await expect(client.getBuildExportPage({ after: "c1", etag: '"9"' })).rejects.toBeInstanceOf(
    TypeError,
  );
  for (const limit of [0, 101]) {
    await expect(client.getBuildExportPage({ limit })).rejects.toBeInstanceOf(TypeError);
    await expect(client.getBuildExport({ pageSize: limit })).rejects.toBeInstanceOf(TypeError);
  }

  const hooked = queuedFetch([page(firstPage(7, ["/a"], { nextCursor: "c1" }))]);
  const hookedClient = createLaceClient({ baseUrl: "https://cms.example/", fetch: hooked.fetch });
  const seen = [];
  await expect(
    hookedClient.getBuildExport({
      onFirstPage: (value) => {
        seen.push(value.version);
        throw new Error("stop");
      },
    }),
  ).rejects.toThrow("stop");
  expect(seen).toEqual([7]);
  expect(hooked.requests).toHaveLength(1);
});

import { expect, test } from "vitest";
import {
  LaceContractError,
  LaceHttpError,
  LaceTimeoutError,
  LaceTransportError,
  createLaceClient,
  packageName,
  userAgent,
} from "../dist/index.js";

const timestamp = "2026-09-20T00:00:00.000Z";

function publicEntry({ id = "entry-1", modelKey = "posts", path = "/blog/entry-1" } = {}) {
  const snapshot = {
    blocks: [],
    createdAt: timestamp,
    entryId: id,
    fields: {},
    id: `${id}-published`,
    revision: 1,
    state: "published",
    title: id,
    updatedAt: timestamp,
    updatedBy: { id: "admin-1", role: "admin" },
  };
  return {
    entry: {
      draft: { ...snapshot, id: `${id}-draft`, state: "draft" },
      id,
      model: { key: modelKey, kind: "collection", route: "/blog/:slug" },
      published: snapshot,
    },
    path,
  };
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
    json(publicEntry({ modelKey: "home", path: "/" })),
    json({ items: [publicEntry()], nextCursor: "cursor-2" }),
    json(publicEntry({ id: "entry-two", path: "/blog/second" })),
    json(publicEntry({ id: "entry-three", path: "/blog/third" })),
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
    json({ items: [publicEntry({ id: "one" })], nextCursor: "opaque+cursor" }),
    json({ items: [publicEntry({ id: "two" })] }),
  ]);
  const client = createLaceClient({ baseUrl: "https://cms.example/", fetch: mock.fetch });

  const entries = await client.getAllCollection("posts", { limit: 1 });

  expect(entries.map(({ entry }) => entry.id)).toEqual(["one", "two"]);
  expect(mock.requests.map((request) => request.url)).toEqual([
    "https://cms.example/api/v1/public/collections/posts?limit=1",
    "https://cms.example/api/v1/public/collections/posts?after=opaque%2Bcursor&limit=1",
  ]);
});

test("scopes the build token to exports and supports changed and unchanged exports", async () => {
  const mock = queuedFetch([
    json({ entries: [publicEntry()], version: 7 }, { headers: { etag: '"7"' } }),
    new Response(null, { headers: { etag: '"7"' }, status: 304 }),
    json(publicEntry({ modelKey: "home", path: "/" })),
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

  const malformedMock = queuedFetch([json({ entries: "not-an-array" })]);
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
    json({ entries: [publicEntry()], version: 7 }, { headers: { etag } }),
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
    json({ entries: [publicEntry()], version: 8 }, { headers: { etag: 'W/"7"' } }),
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

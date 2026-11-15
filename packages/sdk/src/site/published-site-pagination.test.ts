// @ts-nocheck
// TODO(rf2): Type mutable export fixtures, scripted transports and invalid loader inputs.
import { expect, test } from "vitest";

import { createPublishedSiteLoader } from "./published-site.js";

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

async function captureError(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the promise to reject.");
}

function pagedExport(version, paths) {
  const pages = paths.map((group, index) => {
    const entries = group.map((path) =>
      exportEntry({ id: `post-${path.slice(-1)}`, path, slug: path.slice(-1) }),
    );
    const nextCursor = index < paths.length - 1 ? `cursor-${version}-${index}` : undefined;
    const page = {
      entries,
      formatVersion: 2,
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

function linkedEntry(id, targetId, path = `/${id}`) {
  return {
    ...exportEntry({
      id,
      path,
      fields: { nested: [{ url: `entry:${targetId}` }], plainText: "entry:untracked" },
    }),
    internalLinks: [{ sourceKey: "$fields", area: "fields", pointer: "/nested/0/url", targetId }],
  };
}
function linkedExport(entries, globals = [], version = 1) {
  return { ...buildExport(version, entries), formatVersion: 2, globals };
}

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

test("format 2 preserves manifests across pages and resolves later destinations without target I/O", async () => {
  const source = linkedEntry("source", "target", "/a");
  const target = { ...exportEntry({ id: "target", path: "/z-new" }), internalLinks: [] };
  const global = {
    id: "global",
    modelKey: "navigation",
    fields: { url: "entry:target" },
    blocks: [],
    publishedAt: timestamp,
    internalLinks: [{ sourceKey: "$fields", area: "fields", pointer: "/url", targetId: "target" }],
  };
  const transport = scriptedFetch([
    exportResponse({ ...linkedExport([source], [global]), nextCursor: "later" }),
    exportResponse({ entries: [target], formatVersion: 2, media: {}, version: 1 }),
  ]);
  const load = createPublishedSiteLoader({ environment, fetch: transport.fetch });
  const site = await load();
  for (const owner of [site, site.byPath("/a"), site.global("navigation")]) {
    expect(owner.link("entry:target")).toEqual({
      state: "resolved",
      href: "/z-new",
      targetId: "target",
    });
    expect(owner.link("entry:absent")).toEqual({ state: "unavailable", targetId: "absent" });
    expect(owner.link("/manual#part")).toEqual({ state: "resolved", href: "/manual#part" });
    expect(owner.link(undefined)).toEqual({ state: "empty" });
    for (const value of ["entry:%74arget", "entry:", "javascript:bad", "//evil", 42])
      expect(() => owner.link(value)).toThrow();
  }
  expect(site.byPath("/a").fields.nested[0].url).toBe("entry:target");
  expect(site.byPath("/a").internalLinks).toEqual(source.internalLinks);
  expect(Object.isFrozen(site.byPath("/a").fields.nested[0])).toBe(true);
  expect(Object.isFrozen(site.global("navigation").internalLinks)).toBe(true);
  expect(site.linkDiagnostics).toEqual({ total: 0, items: [], truncated: false });
  expect(await load()).toBe(site);
  expect(transport.requests).toHaveLength(2);
  expect(transport.requests.every((request) => request.url.includes("/public/build-export"))).toBe(
    true,
  );
});

test("duplicate source IDs and inconsistent manifest locations fail before exposing a site", async () => {
  const source = linkedEntry("source", "target");
  const global = { ...source, modelKey: "navigation" };
  delete global.path;
  delete global.title;
  const cases = [
    linkedExport([source, { ...source, path: "/another" }]),
    linkedExport([source], [global]),
    linkedExport([
      { ...source, internalLinks: [...source.internalLinks, ...source.internalLinks] },
    ]),
    linkedExport([
      { ...source, internalLinks: [{ ...source.internalLinks[0], targetId: "different" }] },
    ]),
    linkedExport([
      { ...source, internalLinks: [{ ...source.internalLinks[0], pointer: "/not-found" }] },
    ]),
    linkedExport([
      {
        ...source,
        internalLinks: [{ sourceKey: "block", area: "data", pointer: "/url", targetId: "target" }],
      },
    ]),
    linkedExport([{ ...source, path: "//unsafe" }]),
  ];
  for (const exported of cases) {
    const loader = createPublishedSiteLoader({
      environment,
      fetch: scriptedFetch([exportResponse(exported)]).fetch,
    });
    await expect(loader()).rejects.toMatchObject({ code: "invalid_export" });
  }
});

test("unavailable diagnostics are bounded, deterministic, private and reported once per assembled view", async () => {
  const entries = Array.from({ length: 150 }, (_, i) =>
    linkedEntry(`source-${String(i).padStart(3, "0")}`, "missing"),
  ).reverse();
  const callbacks = [];
  const transport = scriptedFetch([
    exportResponse(linkedExport(entries)),
    notModified('"1"'),
    exportResponse(
      linkedExport(
        [...entries, { ...exportEntry({ id: "missing", path: "/recovered" }), internalLinks: [] }],
        [],
        2,
      ),
    ),
  ]);
  const loader = createPublishedSiteLoader({
    environment,
    fetch: transport.fetch,
    revalidate: true,
    onLinkDiagnostics: (diagnostics) => callbacks.push(diagnostics),
  });
  const first = await loader();
  expect(first.linkDiagnostics).toMatchObject({ total: 150, truncated: true });
  expect(first.linkDiagnostics.items).toHaveLength(100);
  expect(first.linkDiagnostics.items[0]).toEqual({
    sourceId: "source-000",
    modelKey: "posts",
    sourceKey: "$fields",
    area: "fields",
    pointer: "/nested/0/url",
    targetId: "missing",
  });
  expect(JSON.stringify(first.linkDiagnostics)).not.toContain("published");
  expect(JSON.stringify(first.linkDiagnostics)).not.toContain("entry:");
  expect(Object.isFrozen(first.linkDiagnostics.items[0])).toBe(true);
  first.link("entry:missing");
  first.byPath("/source-000").link("entry:missing");
  expect(await loader()).toBe(first);
  expect(callbacks).toHaveLength(1);
  const recovered = await loader();
  expect(recovered.link("entry:missing")).toEqual({
    state: "resolved",
    href: "/recovered",
    targetId: "missing",
  });
  expect(recovered.linkDiagnostics.total).toBe(0);
  expect(callbacks).toHaveLength(2);
});

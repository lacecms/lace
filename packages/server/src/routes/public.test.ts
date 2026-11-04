// @ts-nocheck
// TODO(rf2): Type partial build-token security adapters, export callbacks and mutable publication fixtures.
import { expect, test } from "vitest";
import {
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";
import { readAllBuildContentPages } from "@lacecms/test-utils";

import { admin, fixture, json } from "../test-support/app-harness.js";

test("serves public content and short-circuits matching build exports", async () => {
  const { app, content, exportLoads } = await fixture();
  const entry = await content.create({
    actor: admin,
    blocks: [],
    fields: {},
    modelKey: "posts",
    slug: "first",
    title: "First",
  });
  await content.publish({ actor: admin, entryId: entry.id, expectedRevision: 1 });
  expect(await json(app, "/api/v1/public/collections/posts?limit=1")).toMatchObject({
    body: { items: [{ path: "/blog/first" }] },
    response: { status: 200 },
  });
  const fresh = await json(app, "/api/v1/public/build-export");
  expect(fresh.response.headers.get("etag")).toBe('"1"');
  expect(fresh.body.formatVersion).toBe(2);
  expect(exportLoads()).toBe(1);
  expect(
    (await json(app, "/api/v1/public/build-export", { headers: { "if-none-match": '"1"' } }))
      .response.status,
  ).toBe(304);
  expect(exportLoads()).toBe(1);
  const weak = await json(app, "/api/v1/public/build-export", {
    headers: { "if-none-match": 'W/"1"' },
  });
  expect(weak.response.status).toBe(304);
  expect(weak.response.headers.get("etag")).toBe('"1"');
  expect(weak.body).toBeUndefined();
  expect(exportLoads()).toBe(1);
  expect(
    (await json(app, "/api/v1/public/build-export", { headers: { "if-none-match": '"0"' } }))
      .response.status,
  ).toBe(200);
  expect(exportLoads()).toBe(2);
  expect(
    await json(app, "/api/v1/public/build-export", { headers: { "if-none-match": "invalid" } }),
  ).toMatchObject({ body: { error: { code: "VALIDATION_FAILED" } }, response: { status: 422 } });
  const openApi = await json(app, "/api/v1/openapi.json");
  expect(openApi.body.paths).toHaveProperty("/api/v1/public/build-export");
  for (const path of [
    "/api/v1/public/pages/{modelKey}",
    "/api/v1/public/collections/{modelKey}",
    "/api/v1/public/collections/{modelKey}/{slug}",
    "/api/v1/public/content/by-path",
  ])
    expect(openApi.body.paths[path].get.responses).toHaveProperty("200");
});

test("public responses return published entries with one resolved media dictionary", async () => {
  const { app, store } = await fixture();
  const media = (id, extra = {}) => ({
    createdAt: unixMilliseconds(1),
    createdBy: admin.id,
    filename: "image.png",
    id: mediaId(id),
    mimeType: "image/png",
    size: 1,
    status: "active",
    storageKey: `private/${id}`,
    updatedAt: unixMilliseconds(1),
    ...extra,
  });
  store.registerMedia(media("shared", { alt: "Office", focalPoint: { x: 0.25, y: 0.4 } }));
  store.registerMedia(media("only-a"));
  store.registerMedia(media("draft-only"));
  for (const [id, ids] of [
    ["post-a", ["shared", "only-a"]],
    ["post-b", ["shared"]],
  ]) {
    await store.create({
      entry: createContentEntry({
        draft: {
          blocks: [],
          createdAt: unixMilliseconds(1),
          entryId: contentEntryId(id),
          fields: {},
          id: contentSnapshotId(`${id}-draft`),
          revision: 1,
          slug: id,
          state: "draft",
          title: id,
          updatedAt: unixMilliseconds(1),
          updatedBy: admin,
        },
        id: contentEntryId(id),
        model: { key: contentModelKey("posts"), kind: "collection", route: "/blog/:slug" },
      }),
      mediaReferences: ids.map((mediaValue, index) => ({
        fieldPath: `image${index}`,
        mediaId: mediaId(mediaValue),
        sourceKey: "$fields",
      })),
    });
    await store.publish({
      entryId: contentEntryId(id),
      expectedRevision: 1,
      publishedAt: unixMilliseconds(2),
      publishedBy: admin,
      publishedSnapshotId: contentSnapshotId(`${id}-published`),
    });
  }
  await store.saveCompleteDraft({
    entryId: contentEntryId("post-a"),
    mutation: {
      blocks: [],
      expectedRevision: 1,
      fields: {},
      mediaReferences: [
        { fieldPath: "image", mediaId: mediaId("draft-only"), sourceKey: "$fields" },
      ],
      title: "DRAFT ONLY",
      updatedAt: unixMilliseconds(3),
      updatedBy: admin,
    },
  });
  const list = await json(app, "/api/v1/public/collections/posts?limit=10");
  expect(Object.keys(list.body.media)).toEqual(["only-a", "shared"]);
  expect(list.body.media.shared).toEqual({
    alt: "Office",
    caption: null,
    focalPoint: { x: 0.25, y: 0.4 },
    height: null,
    id: "shared",
    mimeType: "image/png",
    url: "https://lace.test/api/v1/public/media/shared",
    width: null,
  });
  const single = await json(app, "/api/v1/public/content/by-path?path=/blog/post-b");
  expect(Object.keys(single.body)).toEqual(["entry", "media"]);
  expect(single.body.entry).toEqual({
    internalLinks: [],
    blocks: [],
    fields: {},
    id: "post-b",
    modelKey: "posts",
    path: "/blog/post-b",
    publishedAt: new Date(2).toISOString(),
    slug: "post-b",
    title: "post-b",
  });
  expect(Object.keys(single.body.media)).toEqual(["shared"]);
  const exported = await json(app, "/api/v1/public/build-export");
  expect(Object.keys(exported.body.media)).toEqual(["only-a", "shared"]);
  for (const body of [list.body, single.body, exported.body]) {
    expect(JSON.stringify(body)).not.toContain("DRAFT ONLY");
    expect(JSON.stringify(body)).not.toContain("draft-only");
    expect(JSON.stringify(body)).not.toContain("private/");
  }
});

test.each([[[1000, 1000]], [[2000, 1000]], [[0, 1000]]])(
  "rejects ordered-draft positions %j atomically with actionable diagnostics",
  async (positions) => {
    const { app, content, store } = await fixture({ maxBodyBytes: 4096 });
    const created = await content.create({
      actor: admin,
      modelKey: "posts",
      title: "Order",
      slug: "order",
      fields: {},
      blocks: [],
    });
    await content.publish({
      actor: admin,
      entryId: created.id,
      expectedRevision: 1,
      idempotencyKey: "order-test",
    });
    const before = await store.load({ entryId: created.id });
    const exported = await readAllBuildContentPages(store);
    const response = await app.fetch(
      new Request(`https://lace.test/api/v1/admin/entries/${created.id}/draft`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: 1,
          title: "Order",
          fields: {},
          slug: "order",
          blocks: positions.map((position, index) => ({
            data: { heading: "secret-content" },
            key: `01ARZ3NDEKTSV4RRFFQ69G5FA${index + 1}`,
            position,
            schemaVersion: 1,
            type: "hero",
          })),
        }),
      }),
    );
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("CONTENT_INVALID_STATE");
    expect(body.error.message).toContain(`Block at index ${positions[0] === 0 ? 0 : 1}`);
    expect(body.error.message).toContain("Resubmit positions");
    expect(body.error.message).not.toContain("secret-content");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(await store.load({ entryId: created.id })).toEqual(before);
    expect(await readAllBuildContentPages(store)).toEqual(exported);
  },
);

test("the export ETag follows its payload when publication races the version lookup", async () => {
  const { app, store, content } = await fixture();
  const entry = await content.create({
    actor: admin,
    blocks: [],
    fields: {},
    modelKey: "posts",
    slug: "race",
    title: "Race",
  });
  const original = store.exportBuildContentPage.bind(store);
  store.exportBuildContentPage = async (input) => {
    await content.publish({ actor: admin, entryId: entry.id, expectedRevision: 1 });
    return original(input);
  };
  const result = await json(app, "/api/v1/public/build-export");
  expect(result.body.version).toBe(1);
  expect(result.response.headers.get("etag")).toBe('"1"');
});

test("serves the build export in version-bound keyset pages", async () => {
  const { app, content, exportLoads, media, store } = await fixture();
  const image = await media.create({
    actor: admin,
    body: (async function* () {
      yield new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    })(),
    filename: "cover.png",
  });
  const publishPost = async (slug, fields = {}) => {
    const created = await content.create({
      actor: admin,
      blocks: [],
      fields,
      modelKey: "posts",
      slug,
      title: slug,
    });
    await content.publish({ actor: admin, entryId: created.id, expectedRevision: 1 });
  };
  for (const slug of ["c", "a", "e", "b"]) await publishPost(slug);
  await publishPost("d", { image: image.id });
  const version = await store.publishedContentVersion();
  const path = "/api/v1/public/build-export";

  const first = await json(app, `${path}?limit=2`);
  expect(first.response.status).toBe(200);
  expect(first.response.headers.get("etag")).toBe(`"${version}"`);
  expect(first.body).toMatchObject({ formatVersion: 2, globals: [], media: {}, version });
  expect(first.body.seo).toEqual({ defaults: null, models: {} });
  expect(first.body.entries.map((entry) => entry.path)).toEqual(["/blog/a", "/blog/b"]);

  // A continuation ignores If-None-Match and carries no globals or SEO section.
  const after = encodeURIComponent(first.body.nextCursor);
  const second = await json(app, `${path}?after=${after}&limit=2`, {
    headers: { "if-none-match": `"${version}"` },
  });
  expect(second.response.status).toBe(200);
  expect(second.response.headers.get("etag")).toBe(`"${version}"`);
  expect(Object.keys(second.body).sort()).toEqual([
    "entries",
    "formatVersion",
    "media",
    "nextCursor",
    "version",
  ]);
  expect(second.body.entries.map((entry) => entry.path)).toEqual(["/blog/c", "/blog/d"]);
  // Only the page whose entry delivers the media resolves it.
  expect(Object.keys(second.body.media)).toEqual([image.id]);
  const third = await json(app, `${path}?after=${encodeURIComponent(second.body.nextCursor)}`);
  expect(third.body.entries.map((entry) => entry.path)).toEqual(["/blog/e"]);
  expect(third.body).not.toHaveProperty("nextCursor");
  expect(third.body.media).toEqual({});

  // The default limit returns everything at once for a small site.
  const whole = await json(app, path);
  expect(whole.body.entries).toHaveLength(5);
  expect(whole.body).not.toHaveProperty("nextCursor");

  // A publication between pages invalidates the cursor with a 409.
  await publishPost("f");
  const stale = await json(app, `${path}?after=${after}&limit=2`);
  expect(stale.response.status).toBe(409);
  expect(stale.body).toEqual({
    error: {
      code: "BUILD_EXPORT_VERSION_CHANGED",
      details: { actualVersion: version + 1, expectedVersion: version },
      message: "Published content changed during the build export. Restart from the first page.",
    },
  });

  // Invalid paging input is rejected before any content is read.
  const collectionCursor = (await json(app, "/api/v1/public/collections/posts?limit=1")).body
    .nextCursor;
  const loads = exportLoads();
  for (const query of [
    "limit=0",
    "limit=101",
    "limit=abc",
    "after=",
    "unknown=1",
    "limit=1&limit=2",
    `after=${encodeURIComponent(collectionCursor)}`,
  ]) {
    const rejected = await json(app, `${path}?${query}`);
    expect(rejected.response.status, query).toBe(422);
    expect(rejected.body.error.code, query).toBe("VALIDATION_FAILED");
  }
  // Only the collection cursor reaches the port, which decodes it before any read.
  expect(exportLoads()).toBe(loads + 1);
  const openApi = await json(app, "/api/v1/openapi.json");
  const operation = openApi.body.paths[path].get;
  expect(operation.parameters.map((parameter) => parameter.name).sort()).toEqual([
    "after",
    "limit",
  ]);
  expect(operation.responses).toHaveProperty("409");
});

test("checks build credentials before conditional or page reads", async () => {
  const { app, exportLoads, store } = await fixture({
    security: { verifyBuildToken: async ({ token }) => token === "build-token" },
  });
  const version = await store.publishedContentVersion();
  const path = "/api/v1/public/build-export";
  for (const headers of [
    { "if-none-match": `W/"${version}"` },
    { authorization: "Bearer wrong", "if-none-match": `"${version}"` },
    { authorization: "Bearer wrong" },
  ]) {
    const denied = await json(app, `${path}?limit=0`, { headers });
    expect(denied.response.status).toBe(403);
  }
  expect(exportLoads()).toBe(0);
  const unchanged = await json(app, path, {
    headers: { authorization: "Bearer build-token", "if-none-match": `W/"${version}"` },
  });
  expect(unchanged.response.status).toBe(304);
  expect(unchanged.response.headers.get("etag")).toBe(`"${version}"`);
  expect(exportLoads()).toBe(0);
});

import { seedSqliteMedia } from "@lacecms/test-utils/sqlite";
import { siteBuildEvent } from "@lacecms/application";
import * as v from "valibot";
import { buildExportFirstPageSchema, buildExportContinuationPageSchema } from "@lacecms/contracts";
import type { JsonObject } from "@lacecms/content";
import type { MediaMetadata } from "@lacecms/domain";
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

import {
  admin,
  buildExportJson,
  buildTokenSecurity,
  fixture,
  json,
} from "../test-support/app-harness.js";

test("serves public content and short-circuits matching build exports", async () => {
  const { app, content, exportLoads } = await fixture({ security: buildTokenSecurity });
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
  const fresh = await buildExportJson(app);
  expect(fresh.response.headers.get("etag")).toBe('"1"');
  expect(fresh.body.formatVersion).toBe(2);
  expect(exportLoads()).toBe(1);
  expect(
    (
      await buildExportJson(app, "/api/v1/public/build-export", {
        headers: { "if-none-match": '"1"' },
      })
    ).response.status,
  ).toBe(304);
  expect(exportLoads()).toBe(1);
  const weak = await buildExportJson(app, "/api/v1/public/build-export", {
    headers: { "if-none-match": 'W/"1"' },
  });
  expect(weak.response.status).toBe(304);
  expect(weak.response.headers.get("etag")).toBe('"1"');
  expect(weak.body).toBeUndefined();
  expect(exportLoads()).toBe(1);
  expect(
    (
      await buildExportJson(app, "/api/v1/public/build-export", {
        headers: { "if-none-match": '"0"' },
      })
    ).response.status,
  ).toBe(200);
  expect(exportLoads()).toBe(2);
  expect(
    await buildExportJson(app, "/api/v1/public/build-export", {
      headers: { "if-none-match": "invalid" },
    }),
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

test("public collection slugs follow the full shared slug rule", async () => {
  const { app } = await fixture();
  for (const slug of ["Release_Notes", "release--notes", "-release", "a".repeat(101)])
    expect(await json(app, `/api/v1/public/collections/posts/${slug}`)).toMatchObject({
      body: {
        error: {
          code: "VALIDATION_FAILED",
          details: { issues: [{ code: "invalid_value", path: "/slug" }] },
        },
      },
      response: { status: 422 },
    });
  expect(
    (await json(app, `/api/v1/public/collections/posts/${"a".repeat(100)}`)).response.status,
  ).toBe(404);
});

test("public route aliases track republication, moves and withdrawal", async () => {
  const { app, content } = await fixture();
  const page = await content.create({
    actor: admin,
    blocks: [],
    fields: {},
    modelKey: "home",
    title: "Home",
  });
  const publishedPage = await content.publish({
    actor: admin,
    entryId: page.id,
    expectedRevision: 1,
  });
  const post = await content.create({
    actor: admin,
    blocks: [],
    fields: { author: "Ada" },
    modelKey: "posts",
    slug: "stable",
    title: "First title",
  });
  await content.publish({ actor: admin, entryId: post.id, expectedRevision: 1 });

  const byPath = (path: string) =>
    `/api/v1/public/content/by-path?path=${encodeURIComponent(path)}`;
  const slugPath = (slug: string) => `/api/v1/public/collections/posts/${slug}`;
  const expectAliases = async (paths: readonly [string, string], title: string) => {
    const [first, second] = await Promise.all(paths.map((path) => json(app, path)));
    expect(first).toMatchObject({
      response: { status: 200 },
      body: { entry: { title }, media: {} },
    });
    expect(second?.response.status).toBe(200);
    expect(second?.body).toEqual(first?.body);
  };
  const pageAliases = ["/api/v1/public/pages/home", byPath("/")] as const;
  const stableAliases = [slugPath("stable"), byPath("/blog/stable")] as const;
  await expectAliases(pageAliases, "Home");
  await expectAliases(stableAliases, "First title");

  const republish = async (revision: number, slug: string, title: string) => {
    await content.save({
      ...post.draft,
      actor: admin,
      entryId: post.id,
      expectedRevision: revision,
      slug,
      title,
      fields: { author: "Grace" },
    });
    await content.publish({ actor: admin, entryId: post.id, expectedRevision: revision + 1 });
  };
  await republish(1, "stable", "Revised title");
  await expectAliases(stableAliases, "Revised title");
  await republish(2, "moved", "Moved title");
  await expectAliases([slugPath("moved"), byPath("/blog/moved")], "Moved title");

  await content.unpublish({
    actor: admin,
    entryId: page.id,
    expectedPublishedSnapshotId: publishedPage.entry.published!.id,
  });
  for (const path of [...stableAliases, ...pageAliases]) {
    expect(await json(app, path)).toMatchObject({
      response: { status: 404 },
      body: { error: { code: "NOT_FOUND" } },
    });
  }
});

test("public responses return published entries with one resolved media dictionary", async () => {
  const {
    app,
    sqlite: { connection },
    store,
  } = await fixture({ security: buildTokenSecurity });
  const media = (id: string, extra: Partial<MediaMetadata> = {}): MediaMetadata => ({
    createdAt: unixMilliseconds(1),
    createdBy: admin.id,
    filename: "image.png",
    id: mediaId(id),
    mimeType: "image/png",
    size: 1,
    status: "active",
    tags: [],
    storageKey: `private/${id}`,
    updatedAt: unixMilliseconds(1),
    ...extra,
  });
  seedSqliteMedia(connection, media("shared", { alt: "Office", focalPoint: { x: 0.25, y: 0.4 } }));
  seedSqliteMedia(connection, media("only-a"));
  seedSqliteMedia(connection, media("draft-only"));
  for (const [id, ids] of [
    ["post-a", ["shared", "only-a"]],
    ["post-b", ["shared"]],
  ] as const) {
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
      events: [
        siteBuildEvent({
          reason: "publication",
          requestedAt: 2,
          requestedBy: admin.id,
          publishedSnapshotId: `${id}-published`,
        }),
      ],
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
  const exported = await buildExportJson(app);
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
  const { app, content } = await fixture({
    security: buildTokenSecurity,
    exportBuildContentPage: (read) => async (input) => {
      await publish();
      return read(input);
    },
  });
  const entry = await content.create({
    actor: admin,
    blocks: [],
    fields: {},
    modelKey: "posts",
    slug: "race",
    title: "Race",
  });
  const publish = () => content.publish({ actor: admin, entryId: entry.id, expectedRevision: 1 });
  const result = await buildExportJson(app);
  expect(result.body.version).toBe(1);
  expect(result.response.headers.get("etag")).toBe('"1"');
});

test("serves the build export in version-bound keyset pages", async () => {
  const { app, content, exportLoads, media, store } = await fixture({
    security: buildTokenSecurity,
  });
  const image = await media.create({
    actor: admin,
    body: (async function* () {
      yield new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    })(),
    filename: "cover.png",
  });
  const publishPost = async (slug: string, fields: JsonObject = {}) => {
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

  const first = await buildExportJson(app, `${path}?limit=2`);
  expect(first.response.status).toBe(200);
  expect(first.response.headers.get("etag")).toBe(`"${version}"`);
  expect(first.body).toMatchObject({ formatVersion: 2, globals: [], media: {}, version });
  expect(first.body.seo).toEqual({ defaults: null, models: {} });
  expect(
    v.parse(buildExportFirstPageSchema, first.body).entries.map((entry) => entry.path),
  ).toEqual(["/blog/a", "/blog/b"]);

  // A continuation ignores If-None-Match and carries no globals or SEO section.
  const after = encodeURIComponent(first.body.nextCursor);
  const second = await buildExportJson(app, `${path}?after=${after}&limit=2`, {
    headers: { "if-none-match": `"${version}"` },
  });
  expect(second.response.status).toBe(200);
  expect(second.response.headers.get("etag")).toBe(`"${version}"`);
  expect(Object.keys(second.body).sort()).toEqual([
    "entries",
    "formatVersion",
    "media",
    "nextCursor",
    "records",
    "version",
  ]);
  expect(
    v.parse(buildExportContinuationPageSchema, second.body).entries.map((entry) => entry.path),
  ).toEqual(["/blog/c", "/blog/d"]);
  // Only the page whose entry delivers the media resolves it.
  expect(Object.keys(second.body.media)).toEqual([image.id]);
  const third = await buildExportJson(
    app,
    `${path}?after=${encodeURIComponent(second.body.nextCursor)}`,
  );
  expect(
    v.parse(buildExportContinuationPageSchema, third.body).entries.map((entry) => entry.path),
  ).toEqual(["/blog/e"]);
  expect(third.body).not.toHaveProperty("nextCursor");
  expect(third.body.media).toEqual({});

  // The default limit returns everything at once for a small site.
  const whole = await buildExportJson(app, path);
  expect(whole.body.entries).toHaveLength(5);
  expect(whole.body).not.toHaveProperty("nextCursor");

  // A publication between pages invalidates the cursor with a 409.
  await publishPost("f");
  const stale = await buildExportJson(app, `${path}?after=${after}&limit=2`);
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
    const rejected = await buildExportJson(app, `${path}?${query}`);
    expect(rejected.response.status, query).toBe(422);
    expect(rejected.body.error.code, query).toBe("VALIDATION_FAILED");
  }
  // Only the collection cursor reaches the port, which decodes it before any read.
  expect(exportLoads()).toBe(loads + 1);
  const openApi = await json(app, "/api/v1/openapi.json");
  const operation = openApi.body.paths[path].get;
  expect(operation.parameters.map((parameter: { name: string }) => parameter.name).sort()).toEqual([
    "after",
    "limit",
  ]);
  expect(operation.responses).toHaveProperty("409");
});

test("omits build routes and their documentation without a verifier", async () => {
  const { app, exportLoads, exportVersionReads } = await fixture();
  const path = "/api/v1/public/build-export";
  expect(await json(app, path)).toMatchObject({
    body: { error: { code: "NOT_FOUND" } },
    response: { status: 404 },
  });
  const head = await app.request(path, { method: "HEAD" });
  expect(head.status).toBe(404);
  expect(head.body).toBeNull();
  expect((await json(app, "/api/v1/openapi.json")).body.paths).not.toHaveProperty(path);
  const thumbnailPath = "/api/v1/public/build-media/media-1/thumbnail";
  for (const method of ["GET", "HEAD"]) {
    expect((await app.request(thumbnailPath, { method })).status).toBe(404);
  }
  expect((await json(app, "/api/v1/openapi.json")).body.paths).not.toHaveProperty(
    "/api/v1/public/build-media/{mediaId}/thumbnail",
  );
  expect((await json(app, "/api/v1/public/collections/posts")).response.status).toBe(200);
  expect(exportLoads()).toBe(0);
  expect(exportVersionReads()).toBe(0);
});

test("checks build credentials before conditional or page reads", async () => {
  const { app, exportLoads, exportVersionReads, store } = await fixture({
    security: buildTokenSecurity,
  });
  const version = await store.publishedContentVersion();
  const path = "/api/v1/public/build-export";
  for (const headers of [
    new Headers({ "if-none-match": `W/"${version}"` }),
    new Headers({ authorization: "Bearer wrong", "if-none-match": `"${version}"` }),
  ]) {
    for (const query of ["", "?limit=0", "?after=continuation"]) {
      const denied = await json(app, `${path}${query}`, { headers });
      expect(denied).toMatchObject({
        body: { error: { code: "AUTHENTICATION_REQUIRED" } },
        response: { status: 401 },
      });
      expect(denied.response.headers.get("www-authenticate")).toBe('Bearer realm="lace"');
      expect(denied.response.headers.get("cache-control")).toBe("no-store");
    }
  }
  expect(exportLoads()).toBe(0);
  expect(exportVersionReads()).toBe(0);
  const unchanged = await buildExportJson(app, path, {
    headers: { "if-none-match": `W/"${version}"` },
  });
  expect(unchanged.response.status).toBe(304);
  expect(unchanged.response.headers.get("etag")).toBe(`"${version}"`);
  expect(exportLoads()).toBe(0);
  expect(exportVersionReads()).toBe(1);
});

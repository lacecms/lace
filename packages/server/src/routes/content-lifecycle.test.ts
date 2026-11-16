import { seedSqliteMedia } from "@lacecms/test-utils/sqlite";
import * as v from "valibot";
import { contentModelListSchema, buildExportSchema } from "@lacecms/contracts";
import type { JsonObject } from "@lacecms/content";
import type { Actor } from "@lacecms/domain";
import { expect, test } from "vitest";
import { defineCollection, defineGlobal, definePage } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";
import { actorId, mediaId, unixMilliseconds } from "@lacecms/domain";

import { admin, editor, fixture, json } from "../test-support/app-harness.js";

const issueEnvelope = v.object({
  error: v.object({
    details: v.object({ issues: v.array(v.object({ path: v.string(), code: v.string() })) }),
  }),
});

test("globals are read by model key and refused as routed or deletable entries", async () => {
  const models = [
    definePage({ key: "home", path: "/", version: 1 }),
    defineCollection({ key: "posts", route: "/blog/:slug", version: 1 }),
    defineGlobal({
      fields: { logo: field.media(), siteName: field.text({ required: true }) },
      key: "settings",
      label: "Site settings",
      version: 1,
    }),
  ];
  const {
    app,
    sqlite: { connection },
  } = await fixture({ maxBodyBytes: 4096, models });
  seedSqliteMedia(connection, {
    createdAt: unixMilliseconds(1),
    createdBy: admin.id,
    filename: "logo.png",
    id: mediaId("logo"),
    mimeType: "image/png",
    size: 1,
    status: "active",
    tags: [],
    storageKey: "private/logo",
    updatedAt: unixMilliseconds(1),
  });
  const call = (
    path: string,
    { body, method = "POST" }: { body?: unknown; method?: string } = {},
  ) =>
    json(app, path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: { "content-type": "application/json" },
    });

  const listed = await json(app, "/api/v1/admin/content-models");
  const settingsModel = v
    .parse(contentModelListSchema, listed.body)
    .items.find((model) => model.key === "settings");
  expect(settingsModel).toMatchObject({ key: "settings", kind: "global", label: "Site settings" });
  expect(settingsModel).not.toHaveProperty("path");
  expect(settingsModel).not.toHaveProperty("route");

  const created = await call("/api/v1/admin/models/settings/entries", {
    body: { blocks: [], fields: { logo: "logo", siteName: "Lace" }, title: "Ignored" },
  });
  expect(created.response.status).toBe(201);
  expect(created.body).toMatchObject({
    draft: { title: "Site settings" },
    model: { key: "settings", kind: "global" },
  });
  expect(
    await call("/api/v1/admin/models/settings/entries", {
      body: { blocks: [], fields: { siteName: "Again" }, title: "Again" },
    }),
  ).toMatchObject({
    body: { error: { code: "CONTENT_MODEL_CARDINALITY_CONFLICT" } },
    response: { status: 409 },
  });
  const entryPath = `/api/v1/admin/entries/${created.body.id}`;
  expect(await json(app, "/api/v1/public/globals/settings")).toMatchObject({
    body: { error: { code: "NOT_FOUND" } },
    response: { status: 404 },
  });

  const before = await json(app, "/api/v1/public/build-export");
  const published = await call(`${entryPath}/publish`, { body: { expectedRevision: 1 } });
  expect(published.response.status).toBe(200);
  const read = await json(app, "/api/v1/public/globals/settings");
  expect(read.response.status).toBe(200);
  expect(Object.keys(read.body)).toEqual(["global", "media"]);
  expect(read.body.global).toEqual({
    internalLinks: [],
    blocks: [],
    fields: { logo: "logo", siteName: "Lace" },
    id: created.body.id,
    modelKey: "settings",
    publishedAt: new Date(1).toISOString(),
  });
  expect(read.body.media.logo).toMatchObject({
    url: "https://lace.test/api/v1/public/media/logo",
  });
  for (const path of ["/api/v1/public/globals/home", "/api/v1/public/globals/missing"]) {
    expect((await json(app, path)).response.status, path).toBe(404);
  }
  expect((await json(app, "/api/v1/public/globals/Not%20Valid")).response.status).not.toBe(200);
  expect((await json(app, "/api/v1/public/pages/settings")).response.status).toBe(404);

  const exported = await json(app, "/api/v1/public/build-export");
  expect(exported.response.headers.get("etag")).not.toBe(before.response.headers.get("etag"));
  expect(exported.body.entries).toEqual([]);
  expect(v.parse(buildExportSchema, exported.body).globals.map((item) => item.modelKey)).toEqual([
    "settings",
  ]);
  expect(Object.keys(exported.body.media)).toEqual(["logo"]);

  for (const [path, init] of [
    [entryPath, { headers: { "if-match": '"1"' }, method: "DELETE" }],
    [
      `${entryPath}/duplicate`,
      { body: "{}", headers: { "content-type": "application/json" }, method: "POST" },
    ],
  ] as const) {
    expect(await json(app, path, init), path).toMatchObject({
      body: { error: { code: "CONTENT_PAGE_SINGLETON" } },
      response: { status: 409 },
    });
  }

  const unpublished = await call(`${entryPath}/unpublish`, {
    body: { expectedPublishedSnapshotId: published.body.entry.published.id },
  });
  expect(unpublished.response.status).toBe(200);
  expect((await json(app, "/api/v1/public/globals/settings")).response.status).toBe(404);
  const afterUnpublish = await json(app, "/api/v1/public/build-export");
  expect(afterUnpublish.response.headers.get("etag")).not.toBe(
    exported.response.headers.get("etag"),
  );
  expect(afterUnpublish.body.globals).toEqual([]);

  const openApi = await json(app, "/api/v1/openapi.json");
  expect(openApi.body.paths["/api/v1/public/globals/{modelKey}"].get.responses).toHaveProperty(
    "200",
  );
});

test("entry lifecycle routes unpublish, revert, and duplicate with stable contracts", async () => {
  let current: Actor = admin;
  const viewer: Actor = { id: actorId("viewer"), role: "viewer" };
  const { app, store } = await fixture({ maxBodyBytes: 4096, resolveActor: async () => current });
  const call = (
    path: string,
    {
      body,
      headers = {},
      method = "POST",
    }: { body?: unknown; headers?: Record<string, string>; method?: string } = {},
  ) =>
    json(app, path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: { "content-type": "application/json", ...headers },
    });
  const post = await call("/api/v1/admin/models/posts/entries", {
    body: { blocks: [], fields: { author: "Ada" }, slug: "launch", title: "Launch" },
  });
  const page = await call("/api/v1/admin/models/home/entries", {
    body: { blocks: [], fields: {}, title: "Home" },
  });
  const entryPath = `/api/v1/admin/entries/${post.body.id}`;
  const published = await call(`${entryPath}/publish`, { body: { expectedRevision: 1 } });
  const publishedId = published.body.entry.published.id;
  await call(`${entryPath}/draft`, {
    body: { blocks: [], expectedRevision: 1, fields: {}, slug: "changed", title: "Changed" },
    method: "PUT",
  });

  for (const actor of [viewer, editor]) {
    current = actor;
    expect(
      await call(`${entryPath}/unpublish`, { body: { expectedPublishedSnapshotId: publishedId } }),
    ).toMatchObject({
      body: { error: { code: "AUTHORIZATION_DENIED" } },
      response: { status: 403 },
    });
  }
  current = viewer;
  for (const action of ["revert", "duplicate"]) {
    expect(await call(`${entryPath}/${action}`, { body: { expectedRevision: 2 } })).toMatchObject({
      response: { status: 403 },
    });
  }

  current = editor;
  expect(
    await call(`${entryPath}/revert`, {
      body: { expectedRevision: 2 },
      headers: { "if-match": '"3"' },
    }),
  ).toMatchObject({ body: { error: { code: "VALIDATION_FAILED" } }, response: { status: 422 } });
  expect(await call(`${entryPath}/revert`, { headers: { "if-match": 'W/"2"' } })).toMatchObject({
    response: { status: 422 },
  });
  expect(await call(`${entryPath}/revert`, { body: {} })).toMatchObject({
    response: { status: 422 },
  });
  const reverted = await call(`${entryPath}/revert`, { headers: { "if-match": '"2"' } });
  expect(reverted).toMatchObject({
    body: {
      draft: { revision: 3, slug: "launch", title: "Launch" },
      published: { id: publishedId, revision: 3 },
      updatedBy: { id: "editor" },
    },
    response: { status: 200 },
  });

  const copy = await call(`${entryPath}/duplicate`);
  expect(copy).toMatchObject({
    body: { draft: { fields: { author: "Ada" }, revision: 1, title: "Launch (copy)" } },
    response: { status: 201 },
  });
  expect(copy.body.draft).not.toHaveProperty("slug");
  expect(copy.body).not.toHaveProperty("published");
  expect(await call(`${entryPath}/duplicate`, { body: { expectedRevision: 1 } })).toMatchObject({
    body: { error: { code: "CONTENT_REVISION_CONFLICT" } },
    response: { status: 409 },
  });
  expect(await call(`${entryPath}/duplicate`, { body: { title: "Other" } })).toMatchObject({
    response: { status: 422 },
  });

  current = admin;
  const pagePath = `/api/v1/admin/entries/${page.body.id}`;
  expect(await call(`${pagePath}/duplicate`)).toMatchObject({
    body: { error: { code: "CONTENT_PAGE_SINGLETON" } },
    response: { status: 409 },
  });
  expect(await call(pagePath, { body: { expectedRevision: 1 }, method: "DELETE" })).toMatchObject({
    body: { error: { code: "CONTENT_PAGE_SINGLETON" } },
    response: { status: 409 },
  });
  expect(
    await call(`${pagePath}/unpublish`, { body: { expectedPublishedSnapshotId: "none" } }),
  ).toMatchObject({
    body: { error: { code: "CONTENT_NOT_PUBLISHED" } },
    response: { status: 409 },
  });
  expect(await call(`${entryPath}/unpublish`, { body: {} })).toMatchObject({
    body: { error: { code: "VALIDATION_FAILED" } },
    response: { status: 422 },
  });
  const publicPath = "/api/v1/public/collections/posts/launch";
  expect((await json(app, publicPath)).response.status).toBe(200);
  const unpublishRequest = {
    body: { expectedPublishedSnapshotId: publishedId },
    headers: { "idempotency-key": "unpublish-key" },
  };
  const unpublished = await call(`${entryPath}/unpublish`, unpublishRequest);
  expect(unpublished).toMatchObject({
    body: {
      build: { status: "queued", targetVersion: 2 },
      entry: { draft: { revision: 3 } },
      unpublication: "unpublished",
    },
    response: { status: 200 },
  });
  expect(unpublished.body.entry).not.toHaveProperty("published");
  expect(await store.loadPublic("/blog/launch")).toBeNull();
  expect((await json(app, publicPath)).response.status).toBe(404);
  expect(await call(`${entryPath}/unpublish`, unpublishRequest)).toMatchObject({
    body: { build: { status: "not-dispatched" }, unpublication: "replayed" },
    response: { status: 200 },
  });
  expect(
    await call(`${entryPath}/unpublish`, { body: { expectedPublishedSnapshotId: publishedId } }),
  ).toMatchObject({
    body: { error: { code: "CONTENT_NOT_PUBLISHED" } },
    response: { status: 409 },
  });
});

test("SEO values travel through admin, public and export contracts", async () => {
  const models = [
    definePage({ key: "home", path: "/", seo: true, version: 1 }),
    defineCollection({
      fields: { cover: field.media(), summary: field.textarea() },
      key: "posts",
      route: "/blog/:slug",
      seo: { description: "summary", image: "cover" },
      version: 1,
    }),
    defineCollection({ key: "notes", route: "/notes/:slug", version: 1 }),
    defineGlobal({
      fields: { siteName: field.text({ required: true }) },
      key: "settings",
      seoDefaults: { siteName: "siteName" },
      version: 1,
    }),
  ];
  const {
    app,
    sqlite: { connection },
    store,
  } = await fixture({ maxBodyBytes: 8192, models });
  for (const id of ["share", "other"]) {
    seedSqliteMedia(connection, {
      createdAt: unixMilliseconds(1),
      createdBy: admin.id,
      filename: `${id}.png`,
      id: mediaId(id),
      mimeType: "image/png",
      size: 1,
      status: "active",
      tags: [],
      storageKey: `private/${id}`,
      updatedAt: unixMilliseconds(1),
    });
  }
  const call = (
    path: string,
    { body, method = "POST" }: { body?: unknown; method?: string } = {},
  ) =>
    json(app, path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: { "content-type": "application/json" },
    });

  const listed = v.parse(
    contentModelListSchema,
    (await json(app, "/api/v1/admin/content-models")).body,
  ).items;
  expect(listed.find((model) => model.key === "posts")?.seo).toEqual({
    description: "summary",
    image: "cover",
  });
  expect(listed.find((model) => model.key === "home")?.seo).toEqual({
    description: null,
    image: null,
  });
  expect(listed.find((model) => model.key === "notes")).not.toHaveProperty("seo");
  expect(listed.find((model) => model.key === "settings")?.seoDefaults).toEqual({
    description: null,
    image: null,
    siteName: "siteName",
    titleTemplate: null,
  });

  const created = await call("/api/v1/admin/models/posts/entries", {
    body: {
      blocks: [],
      fields: { summary: "Hello" },
      seo: { canonical: "https://example.com/hello", image: "share", title: "Hello SEO" },
      slug: "hello",
      title: "Hello",
    },
  });
  expect(created.response.status).toBe(201);
  const fullSeo = {
    canonical: "https://example.com/hello",
    description: null,
    image: "share",
    noindex: false,
    title: "Hello SEO",
  };
  expect(created.body.draft.seo).toEqual(fullSeo);
  const entryPath = `/api/v1/admin/entries/${created.body.id}`;
  expect((await json(app, entryPath)).body.draft.seo).toEqual(fullSeo);

  for (const [seo, pointer] of [
    [{ canonical: "/hello" }, "/seo/canonical"],
    [{ title: "x".repeat(201) }, "/seo/title"],
    [{ keywords: "x" }, "/seo"],
  ] as const) {
    const invalid = await call(`${entryPath}/draft`, {
      body: { blocks: [], expectedRevision: 1, fields: {}, seo, slug: "hello", title: "Hello" },
      method: "PUT",
    });
    expect(invalid.response.status).toBe(422);
    expect(invalid.body.error.code).toBe("VALIDATION_FAILED");
    expect(
      v
        .parse(issueEnvelope, invalid.body)
        .error.details.issues.some((issue) => issue.path.startsWith(pointer)),
    ).toBe(true);
  }
  const refused = await call("/api/v1/admin/models/notes/entries", {
    body: { blocks: [], fields: {}, seo: { title: "x" }, slug: "n", title: "Note" },
  });
  expect(refused.response.status).toBe(422);
  expect(refused.body.error.details.issues).toEqual([
    expect.objectContaining({ code: "seo_not_allowed", path: "/seo" }),
  ]);
  const note = await call("/api/v1/admin/models/notes/entries", {
    body: { blocks: [], fields: {}, seo: null, slug: "n", title: "Note" },
  });
  expect(note.response.status).toBe(201);
  expect(note.body.draft).not.toHaveProperty("seo");

  const published = await call(`${entryPath}/publish`, { body: { expectedRevision: 1 } });
  expect(published.body.entry.published.seo).toEqual(fullSeo);
  await call(`/api/v1/admin/entries/${note.body.id}/publish`, { body: { expectedRevision: 1 } });

  const page = await json(app, "/api/v1/public/collections/posts/hello");
  expect(page.body.entry.seo).toEqual(fullSeo);
  expect(Object.keys(page.body.media)).toEqual(["share"]);
  expect(
    (await json(app, "/api/v1/public/content/by-path?path=/blog/hello")).body.entry.seo,
  ).toEqual(fullSeo);
  expect((await json(app, "/api/v1/public/collections/posts")).body.items[0].seo).toEqual(fullSeo);
  expect((await json(app, "/api/v1/public/collections/notes/n")).body.entry).not.toHaveProperty(
    "seo",
  );
  expect(await store.loadPublicMedia(mediaId("share"))).toMatchObject({ id: "share" });
  expect(await store.loadPublicMedia(mediaId("other"))).toBeNull();

  const exported = v.parse(
    buildExportSchema,
    (await json(app, "/api/v1/public/build-export")).body,
  );
  expect(exported.seo).toEqual({
    defaults: {
      description: null,
      image: null,
      modelKey: "settings",
      siteName: "siteName",
      titleTemplate: null,
    },
    models: {
      home: { description: null, image: null },
      posts: { description: "summary", image: "cover" },
    },
  });
  expect(exported.entries.find((item) => item.modelKey === "posts")?.seo).toEqual(fullSeo);
  expect(exported.entries.find((item) => item.modelKey === "notes")).not.toHaveProperty("seo");
  expect(Object.keys(exported.media)).toEqual(["share"]);

  const detail = (await json(app, "/api/v1/admin/media/share")).body;
  expect(detail.usage).toEqual([
    expect.objectContaining({
      locations: [{ field: "image", source: "seo", states: ["draft", "published"] }],
    }),
  ]);
});

test("block envelopes travel through admin, public and export contracts", async () => {
  const panel = defineBlock({
    fields: { heading: field.text({ required: true }), image: field.media() },
    settings: { align: field.select({ defaultValue: "left", options: ["left", "center"] }) },
    type: "panel",
    version: 1,
  });
  const models = [
    defineCollection({ blocks: ["panel"], key: "posts", route: "/blog/:slug", version: 1 }),
    defineGlobal({ blocks: ["panel"], key: "settings", version: 1 }),
  ];
  const {
    app,
    sqlite: { connection },
  } = await fixture({ blocks: [panel], maxBodyBytes: 8192, models });
  for (const id of ["shown", "secret"]) {
    seedSqliteMedia(connection, {
      createdAt: unixMilliseconds(1),
      createdBy: admin.id,
      filename: `${id}.png`,
      id: mediaId(id),
      mimeType: "image/png",
      size: 1,
      status: "active",
      tags: [],
      storageKey: `private/${id}`,
      updatedAt: unixMilliseconds(1),
    });
  }
  const call = (
    path: string,
    { body, method = "POST" }: { body?: unknown; method?: string } = {},
  ) =>
    json(app, path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: { "content-type": "application/json" },
    });
  const block = (
    key: string,
    position: number,
    envelope: Record<string, unknown> = {},
    data: JsonObject = { heading: key },
  ) => ({
    data,
    key,
    position,
    schemaVersion: 1,
    type: "panel",
    ...envelope,
  });

  const panelMetadata = v
    .parse(contentModelListSchema, (await json(app, "/api/v1/admin/content-models")).body)
    .items.find((model) => model.key === "posts")?.blockDefinitions?.[0];
  expect(panelMetadata?.settings).toEqual({
    align: { defaultValue: "left", options: ["left", "center"], required: false, type: "select" },
  });

  const created = await call("/api/v1/admin/models/posts/entries", {
    body: {
      blocks: [
        block(
          "b1",
          1000,
          { anchor: "pricing", className: " wide  wide " },
          { heading: "A", image: "shown" },
        ),
        block("b2", 2000, { hidden: true }, { image: "secret" }),
        block("b3", 3000),
      ],
      fields: {},
      slug: "hello",
      title: "Hello",
    },
  });
  expect(created.response.status).toBe(201);
  expect(created.body.draft.blocks).toEqual([
    {
      anchor: "pricing",
      className: "wide",
      data: { heading: "A", image: "shown" },
      hidden: false,
      key: "b1",
      position: 1000,
      schemaVersion: 1,
      settings: { align: "left" },
      type: "panel",
    },
    {
      data: { image: "secret" },
      hidden: true,
      key: "b2",
      position: 2000,
      schemaVersion: 1,
      settings: { align: "left" },
      type: "panel",
    },
    {
      data: { heading: "b3" },
      hidden: false,
      key: "b3",
      position: 3000,
      schemaVersion: 1,
      settings: { align: "left" },
      type: "panel",
    },
  ]);
  const entryPath = `/api/v1/admin/entries/${created.body.id}`;

  for (const [envelope, pointer, code] of [
    [{ anchor: "Top" }, "/blocks/0/anchor", undefined],
    [{ hidden: "yes" }, "/blocks/0/hidden", undefined],
    [{ settings: { width: 2 } }, "/blocks/0/settings/width", "unknown_field"],
    [{ settings: { align: "right" } }, "/blocks/0/settings/align", undefined],
  ] as const) {
    const invalid = await call(`${entryPath}/draft`, {
      body: {
        blocks: [block("b1", 1000, envelope)],
        expectedRevision: 1,
        fields: {},
        slug: "hello",
        title: "Hello",
      },
      method: "PUT",
    });
    expect(invalid.response.status, JSON.stringify(envelope)).toBe(422);
    expect(invalid.body.error.code).toBe("VALIDATION_FAILED");
    const issue = v
      .parse(issueEnvelope, invalid.body)
      .error.details.issues.find((value) => value.path === pointer);
    expect(issue, JSON.stringify(invalid.body.error.details.issues)).toBeDefined();
    if (code !== undefined) expect(issue?.code).toBe(code);
  }
  const duplicate = await call(`${entryPath}/draft`, {
    body: {
      blocks: [block("b1", 1000, { anchor: "faq" }), block("b2", 2000, { anchor: "faq" })],
      expectedRevision: 1,
      fields: {},
      slug: "hello",
      title: "Hello",
    },
    method: "PUT",
  });
  expect(duplicate.response.status).toBe(422);
  expect(duplicate.body.error.details.issues).toEqual([
    expect.objectContaining({ code: "duplicate_block_anchor", path: "/blocks/1/anchor" }),
  ]);

  // The hidden block lacks its required heading, yet the entry publishes.
  const published = await call(`${entryPath}/publish`, { body: { expectedRevision: 1 } });
  expect(published.response.status).toBe(200);
  const global = await call("/api/v1/admin/models/settings/entries", {
    body: {
      blocks: [block("g1", 1000, { hidden: true }, { heading: "G", image: "secret" })],
      fields: {},
      title: "Settings",
    },
  });
  expect(global.response.status).toBe(201);
  await call(`/api/v1/admin/entries/${global.body.id}/publish`, { body: { expectedRevision: 1 } });
  const publicGlobal = await json(app, "/api/v1/public/globals/settings");
  expect(publicGlobal.body.global.blocks).toEqual([]);
  expect(publicGlobal.body.media).toEqual({});

  const delivered = [
    {
      anchor: "pricing",
      className: "wide",
      data: { heading: "A", image: "shown" },
      key: "b1",
      position: 1000,
      schemaVersion: 1,
      settings: { align: "left" },
      type: "panel",
    },
    {
      data: { heading: "b3" },
      key: "b3",
      position: 3000,
      schemaVersion: 1,
      settings: { align: "left" },
      type: "panel",
    },
  ];
  const page = await json(app, "/api/v1/public/collections/posts/hello");
  expect(page.body.entry.blocks).toEqual(delivered);
  expect(Object.keys(page.body.media)).toEqual(["shown"]);
  expect(
    (await json(app, "/api/v1/public/content/by-path?path=/blog/hello")).body.entry.blocks,
  ).toEqual(delivered);
  expect((await json(app, "/api/v1/public/collections/posts")).body.items[0].blocks).toEqual(
    delivered,
  );
  const exported = v.parse(
    buildExportSchema,
    (await json(app, "/api/v1/public/build-export")).body,
  );
  expect(exported.entries[0]?.blocks).toEqual(delivered);
  expect(Object.keys(exported.media)).toEqual(["shown"]);
  expect((await json(app, "/api/v1/public/media/shown")).response.status).not.toBe(404);
  expect((await json(app, "/api/v1/public/media/secret")).response.status).toBe(404);
  expect((await json(app, entryPath)).body.published.blocks[1]).toMatchObject({
    hidden: true,
    key: "b2",
  });
});

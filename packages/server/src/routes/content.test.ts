// @ts-nocheck
// TODO(rf2): Type mutable content/model fixtures, branded snapshots and invalid lifecycle request matrices.
import { expect, test } from "vitest";
import { defineCollection, defineGlobal, definePage } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";
import {
  actorId,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";

import { admin, editor, fixture, json } from "../test-support/app-harness.js";

test("content model discovery retains interleaved declaration order", async () => {
  const models = [
    definePage({ key: "zebra", path: "/zebra", version: 1 }),
    defineCollection({ key: "posts", route: "/posts/:slug", version: 1 }),
    definePage({ key: "about", path: "/about", version: 1 }),
    defineGlobal({ key: "settings", version: 1 }),
  ];
  const { app } = await fixture({ actor: editor, models });
  const result = await json(app, "/api/v1/admin/content-models");
  expect(result.response.status).toBe(200);
  expect(result.body.items.map((item) => item.key)).toEqual([
    "zebra",
    "posts",
    "about",
    "settings",
  ]);
});

test("editor and viewer mutations are denied by the API independently of Admin controls", async () => {
  const editorApp = (await fixture({ actor: editor })).app;
  const viewerApp = (await fixture({ actor: { id: actorId("viewer"), role: "viewer" } })).app;
  const post = (body) => ({
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  for (const [path, init] of [
    [
      "/api/v1/admin/entries/missing/publish",
      {
        ...post({ expectedRevision: 1 }),
        headers: { "content-type": "application/json", "idempotency-key": "acceptance" },
      },
    ],
    ["/api/v1/admin/invitations", post({ email: "other@example.test", role: "viewer" })],
    ["/api/v1/admin/api-tokens", post({ name: "disallowed" })],
  ]) {
    expect((await json(editorApp, path, init)).response.status).toBe(403);
  }
  expect(
    (
      await json(
        viewerApp,
        "/api/v1/admin/models/posts/entries",
        post({ title: "Denied", slug: "denied", fields: {}, blocks: [] }),
      )
    ).response.status,
  ).toBe(403);
  const media = new FormData();
  media.append("file", new File([new Uint8Array([1])], "denied.png", { type: "image/png" }));
  expect(
    (
      await viewerApp.fetch(
        new Request("https://lace.test/api/v1/admin/media", { body: media, method: "POST" }),
      )
    ).status,
  ).toBe(403);
});

test("content validation failures use the validation envelope with JSON Pointers", async () => {
  const { app, store } = await fixture({
    maxBodyBytes: 4096,
    models: [
      defineCollection({
        blocks: ["hero", "richText"],
        fields: { summary: field.text({ required: true }) },
        key: "notes",
        route: "/notes/:slug",
        version: 1,
      }),
    ],
  });
  const send = (path, body, method = "POST") =>
    json(app, path, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method,
    });
  expect(
    await send("/api/v1/admin/models/notes/entries", {
      blocks: [],
      fields: { unknown: "x" },
      slug: "bad",
      title: "Bad",
    }),
  ).toMatchObject({
    body: {
      error: {
        code: "VALIDATION_FAILED",
        details: { issues: [{ code: "unknown_field", path: "/fields/unknown" }] },
      },
    },
    response: { status: 422 },
  });

  const created = await send("/api/v1/admin/models/notes/entries", {
    blocks: [],
    fields: {},
    slug: "note",
    title: "Note",
  });
  expect(created.response.status).toBe(201);
  const entryId = created.body.id;
  const rejected = await send(
    `/api/v1/admin/entries/${entryId}/draft`,
    {
      blocks: [
        {
          data: { body: { content: [{ type: "html" }], type: "doc" } },
          key: "01J00000000000000000000000",
          position: 1024,
          schemaVersion: 1,
          type: "richText",
        },
      ],
      expectedRevision: 1,
      fields: {},
      slug: "note",
      title: "Note",
    },
    "PUT",
  );
  expect(rejected).toMatchObject({
    body: {
      error: {
        code: "VALIDATION_FAILED",
        details: { issues: [{ code: "invalid_field_value", path: "/blocks/0/data/body" }] },
      },
    },
    response: { status: 422 },
  });
  expect(JSON.stringify(rejected.body)).not.toContain("html");
  expect((await json(app, `/api/v1/admin/entries/${entryId}`)).body.draft.revision).toBe(1);

  expect(
    await send(`/api/v1/admin/entries/${entryId}/publish`, { expectedRevision: 1 }),
  ).toMatchObject({
    body: {
      error: {
        code: "VALIDATION_FAILED",
        details: { issues: [{ code: "missing_required_field", path: "/fields/summary" }] },
      },
    },
    response: { status: 422 },
  });
  expect(await store.loadPublic("/notes/note")).toBeNull();
});

test("lists entries with filters, totals, and query-bound cursors", async () => {
  const { app, store } = await fixture();
  store.setActorDisplayNames({ admin: "admin@example.test" });
  const post = (body) => ({
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const draft = await json(
    app,
    "/api/v1/admin/models/posts/entries",
    post({ blocks: [], fields: { author: "Ann" }, slug: "zebra", title: "Zebra" }),
  );
  const launched = await json(
    app,
    "/api/v1/admin/models/posts/entries",
    post({ blocks: [], fields: {}, slug: "launch", title: "Launch" }),
  );
  expect(draft.body.updatedBy).toEqual({ displayName: "admin@example.test", id: "admin" });
  await json(
    app,
    `/api/v1/admin/entries/${launched.body.id}/publish`,
    post({ expectedRevision: 1 }),
  );

  const list = await json(app, "/api/v1/admin/models/posts/entries?sort=title");
  expect(list.response.status).toBe(200);
  expect(list.body.totals).toEqual({ all: 2, changed: 0, draft: 1, published: 1 });
  expect(list.body.items).toMatchObject([
    { id: launched.body.id, slug: "launch", status: "published", title: "Launch" },
    {
      id: draft.body.id,
      listValues: { author: "Ann" },
      slug: "zebra",
      status: "draft",
      updatedBy: { displayName: "admin@example.test", id: "admin" },
    },
  ]);
  expect(list.body.items[0].publishedAt).toMatch(/Z$/u);
  expect(list.body.items[1]).not.toHaveProperty("publishedAt");

  const filtered = await json(
    app,
    "/api/v1/admin/models/posts/entries?q=%20ZEB%20&status=draft&unknown=ignored",
  );
  expect(filtered.body.items.map((item) => item.id)).toEqual([draft.body.id]);
  expect(filtered.body.totals).toEqual({ all: 1, changed: 0, draft: 1, published: 0 });

  for (const [query, pointer] of [
    ["status=archived", "/status"],
    ["sort=author", "/sort"],
    [`q=${"x".repeat(201)}`, "/q"],
  ]) {
    expect(await json(app, `/api/v1/admin/models/posts/entries?${query}`)).toMatchObject({
      body: { error: { code: "VALIDATION_FAILED", details: { issues: [{ path: pointer }] } } },
      response: { status: 422 },
    });
  }
  const first = await json(app, "/api/v1/admin/models/posts/entries?sort=title&limit=1");
  expect(first.body.nextCursor).toBeDefined();
  const cursor = encodeURIComponent(first.body.nextCursor);
  expect(
    (await json(app, `/api/v1/admin/models/posts/entries?sort=title&limit=1&after=${cursor}`)).body
      .items,
  ).toMatchObject([{ id: draft.body.id }]);
  expect(
    await json(app, `/api/v1/admin/models/posts/entries?sort=-title&limit=1&after=${cursor}`),
  ).toMatchObject({
    body: { error: { code: "CONTENT_INVALID_STATE" } },
    response: { status: 422 },
  });
  expect((await json(app, "/api/v1/admin/models/missing/entries")).response.status).toBe(404);
});

test("admin entry responses name the last editor while public DTOs carry no editor names", async () => {
  const viewer = { id: actorId("viewer"), role: "viewer" };
  const { app, store } = await fixture();
  store.setActorDisplayNames({ admin: "admin@example.test" });
  const post = (body) => ({
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const created = await json(
    app,
    "/api/v1/admin/models/posts/entries",
    post({ blocks: [], fields: {}, slug: "named", title: "Named" }),
  );
  expect(created.body.updatedBy).toEqual({ displayName: "admin@example.test", id: "admin" });
  const saved = await json(app, `/api/v1/admin/entries/${created.body.id}/draft`, {
    body: JSON.stringify({
      blocks: [],
      expectedRevision: 1,
      fields: {},
      slug: "named",
      title: "N",
    }),
    headers: { "content-type": "application/json" },
    method: "PUT",
  });
  expect(saved.body.updatedBy.displayName).toBe("admin@example.test");
  const published = await json(
    app,
    `/api/v1/admin/entries/${created.body.id}/publish`,
    post({ expectedRevision: 2 }),
  );
  expect(published.body.entry.updatedBy).toEqual({
    displayName: "admin@example.test",
    id: "admin",
  });

  const viewerApp = await fixture({ actor: viewer });
  viewerApp.store.setActorDisplayNames({ editor: "editor@example.test" });
  for (const [id, updatedBy, expected] of [
    ["by-editor", editor, "editor@example.test"],
    ["by-sync", { id: actorId("system:content-sync"), role: "admin" }, "System"],
    ["by-gone", { id: actorId("gone"), role: "editor" }, "Unknown user"],
  ]) {
    await viewerApp.store.create({
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
          updatedBy,
        },
        id: contentEntryId(id),
        model: { key: contentModelKey("posts"), kind: "collection", route: "/blog/:slug" },
      }),
      mediaReferences: [],
    });
    const loaded = await json(viewerApp.app, `/api/v1/admin/entries/${id}`);
    expect(loaded.body.updatedBy).toEqual({ displayName: expected, id: updatedBy.id });
  }

  const page = await json(app, "/api/v1/public/collections/posts/named");
  const exported = await json(app, "/api/v1/public/build-export");
  expect(page).toMatchObject({
    body: { entry: { path: "/blog/named" } },
    response: { status: 200 },
  });
  expect(exported).toMatchObject({ body: { entries: [{ path: "/blog/named" }] } });
  for (const body of [page.body, exported.body]) {
    expect(JSON.stringify(body)).not.toContain("displayName");
    expect(JSON.stringify(body)).not.toContain("admin@example.test");
  }
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
  const { app, store } = await fixture({ maxBodyBytes: 4096, models });
  store.registerMedia({
    createdAt: unixMilliseconds(1),
    createdBy: admin.id,
    filename: "logo.png",
    id: mediaId("logo"),
    mimeType: "image/png",
    size: 1,
    status: "active",
    storageKey: "private/logo",
    updatedAt: unixMilliseconds(1),
  });
  const call = (path, { body, method = "POST" } = {}) =>
    json(app, path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: { "content-type": "application/json" },
    });

  const listed = await json(app, "/api/v1/admin/content-models");
  const settingsModel = listed.body.items.find((model) => model.key === "settings");
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
  expect(exported.body.globals.map((item) => item.modelKey)).toEqual(["settings"]);
  expect(Object.keys(exported.body.media)).toEqual(["logo"]);

  for (const [path, init] of [
    [entryPath, { headers: { "if-match": '"1"' }, method: "DELETE" }],
    [
      `${entryPath}/duplicate`,
      { body: "{}", headers: { "content-type": "application/json" }, method: "POST" },
    ],
  ]) {
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
  let current = admin;
  const viewer = { id: actorId("viewer"), role: "viewer" };
  const { app, store } = await fixture({ maxBodyBytes: 4096, resolveActor: async () => current });
  const call = (path, { body, headers = {}, method = "POST" } = {}) =>
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
  const { app, store } = await fixture({ maxBodyBytes: 8192, models });
  for (const id of ["share", "other"]) {
    store.registerMedia({
      createdAt: unixMilliseconds(1),
      createdBy: admin.id,
      filename: `${id}.png`,
      id: mediaId(id),
      mimeType: "image/png",
      size: 1,
      status: "active",
      storageKey: `private/${id}`,
      updatedAt: unixMilliseconds(1),
    });
  }
  const call = (path, { body, method = "POST" } = {}) =>
    json(app, path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: { "content-type": "application/json" },
    });

  const listed = (await json(app, "/api/v1/admin/content-models")).body.items;
  expect(listed.find((model) => model.key === "posts").seo).toEqual({
    description: "summary",
    image: "cover",
  });
  expect(listed.find((model) => model.key === "home").seo).toEqual({
    description: null,
    image: null,
  });
  expect(listed.find((model) => model.key === "notes")).not.toHaveProperty("seo");
  expect(listed.find((model) => model.key === "settings").seoDefaults).toEqual({
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
  ]) {
    const invalid = await call(`${entryPath}/draft`, {
      body: { blocks: [], expectedRevision: 1, fields: {}, seo, slug: "hello", title: "Hello" },
      method: "PUT",
    });
    expect(invalid.response.status).toBe(422);
    expect(invalid.body.error.code).toBe("VALIDATION_FAILED");
    expect(invalid.body.error.details.issues.some((issue) => issue.path.startsWith(pointer))).toBe(
      true,
    );
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

  const exported = (await json(app, "/api/v1/public/build-export")).body;
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
  expect(exported.entries.find((item) => item.modelKey === "posts").seo).toEqual(fullSeo);
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
  const { app, store } = await fixture({ blocks: [panel], maxBodyBytes: 8192, models });
  for (const id of ["shown", "secret"]) {
    store.registerMedia({
      createdAt: unixMilliseconds(1),
      createdBy: admin.id,
      filename: `${id}.png`,
      id: mediaId(id),
      mimeType: "image/png",
      size: 1,
      status: "active",
      storageKey: `private/${id}`,
      updatedAt: unixMilliseconds(1),
    });
  }
  const call = (path, { body, method = "POST" } = {}) =>
    json(app, path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: { "content-type": "application/json" },
    });
  const block = (key, position, envelope = {}, data = { heading: key }) => ({
    data,
    key,
    position,
    schemaVersion: 1,
    type: "panel",
    ...envelope,
  });

  const panelMetadata = (await json(app, "/api/v1/admin/content-models")).body.items.find(
    (model) => model.key === "posts",
  ).blockDefinitions[0];
  expect(panelMetadata.settings).toEqual({
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
  ]) {
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
    const issue = invalid.body.error.details.issues.find((value) => value.path === pointer);
    expect(issue, JSON.stringify(invalid.body.error.details.issues)).toBeDefined();
    if (code !== undefined) expect(issue.code).toBe(code);
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
  const exported = (await json(app, "/api/v1/public/build-export")).body;
  expect(exported.entries[0].blocks).toEqual(delivered);
  expect(Object.keys(exported.media)).toEqual(["shown"]);
  expect((await json(app, "/api/v1/public/media/shown")).response.status).not.toBe(404);
  expect((await json(app, "/api/v1/public/media/secret")).response.status).toBe(404);
  expect((await json(app, entryPath)).body.published.blocks[1]).toMatchObject({
    hidden: true,
    key: "b2",
  });
});

test("composite metadata and content round trip with precise nested validation pointers", async () => {
  const { app } = await fixture({
    maxBodyBytes: 4096,
    models: [
      defineCollection({
        key: "posts",
        version: 1,
        route: "/blog/:slug",
        blocks: [],
        fields: {
          team: field.list({
            item: field.group({ fields: { url: field.url({ required: true }) } }),
          }),
          empty: field.group({ fields: {} }),
        },
      }),
    ],
  });
  const input = {
    title: "Nested",
    slug: "nested",
    blocks: [],
    fields: { team: [{ url: "/ok" }], empty: {} },
  };
  const created = await json(app, "/api/v1/admin/models/posts/entries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  expect(created.response.status).toBe(201);
  expect(created.body.draft.fields).toEqual(input.fields);
  const invalid = await json(app, "/api/v1/admin/models/posts/entries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, fields: { team: [{ url: "javascript:bad" }] } }),
  });
  expect(invalid.response.status).toBe(422);
  expect(invalid.body.error.details.issues).toContainEqual(
    expect.objectContaining({ path: "/fields/team/0/url" }),
  );
  const openApi = (await json(app, "/api/v1/openapi.json")).body;
  expect(
    openApi.components.schemas.GroupFieldDefinition.properties.fields.additionalProperties.$ref,
  ).toBe("#/components/schemas/FieldDefinition");
  expect(openApi.components.schemas.ListFieldDefinition.properties.item.oneOf).toContainEqual({
    $ref: "#/components/schemas/GroupFieldDefinition",
  });
});

test("internal-link HTTP reads enforce permissions and strict bounded query modes before reads", async () => {
  const calls = [];
  const linkReads = {
    listLinkTargets: async (query) => {
      calls.push(["list", query]);
      return { items: [] };
    },
    resolveLinkTargets: async (ids) => {
      calls.push(["resolve", ids]);
      return Object.fromEntries(ids.map((id) => [id, { id, state: "missing" }]));
    },
    readLinkImpact: async (query) => {
      calls.push(["impact", query]);
      return { mode: "sources", sources: [], receipt: "receipt", hasPublishedUsages: false };
    },
  };
  const { app } = await fixture({
    actor: { id: actorId("viewer"), role: "viewer" },
    linkReads,
    maxBodyBytes: 20_000,
  });
  expect(
    (await json(app, "/api/v1/admin/link-targets?search=%20A_%20&limit=50")).response.status,
  ).toBe(200);
  expect(calls.at(-1)).toEqual(["list", { search: "A_", limit: 50 }]);
  const ids = Array.from({ length: 200 }, (_, i) => `id-${i}`);
  expect(
    (
      await json(app, "/api/v1/admin/link-targets/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      })
    ).response.status,
  ).toBe(200);
  expect(calls.at(-1)).toEqual(["resolve", ids]);
  expect(
    (await json(app, "/api/v1/admin/entries/id/link-impact?action=delete")).response.status,
  ).toBe(200);
  expect(calls.at(-1)).toEqual([
    "impact",
    { targetId: "id", action: "delete", actorId: "viewer", limit: 20 },
  ]);
  const before = calls.length;
  for (const query of ["limit=51", "status=missing", "unknown=1", "search=" + "a".repeat(101)])
    expect((await json(app, `/api/v1/admin/link-targets?${query}`)).response.status).toBe(422);
  for (const query of [
    "action=delete&sourceEntryId=s",
    "action=delete&locationsAfter=c",
    "action=delete&sourceEntryId=s&snapshotId=d&after=c",
    "action=publish",
    "action=delete&extra=1",
  ])
    expect((await json(app, `/api/v1/admin/entries/id/link-impact?${query}`)).response.status).toBe(
      422,
    );
  expect(calls.length).toBe(before);
  const denied = await fixture({ actor: null, linkReads });
  expect((await json(denied.app, "/api/v1/admin/link-targets")).response.status).toBe(403);
  expect(calls.length).toBe(before);
});

test("configured query API validates JSON, limits and model permissions before list reads", async () => {
  const models = [
    defineCollection({
      key: "posts",
      route: "/posts/:slug",
      version: 1,
      fields: {
        title: field.text(),
        count: field.number(),
        flag: field.boolean(),
        category: field.select({ options: ["news", "events"] }),
        time: field.datetime(),
      },
      listOptions: {
        sortableFields: ["title", "count"],
        filterableFields: ["title", "count", "flag", "category", "time"],
      },
    }),
  ];
  const { app, store } = await fixture({ models });
  expect((await json(app, "/api/v1/admin/content-models")).body.items[0].listOptions).toEqual(
    models[0].listOptions,
  );
  const reads = [];
  store.list = async (query) => {
    reads.push(query);
    return { items: [], totals: { all: 0, changed: 0, draft: 0, published: 0 } };
  };
  const base = "/api/v1/admin/models/posts/entries?";
  const encode = (filters) => `filters=${encodeURIComponent(JSON.stringify(filters))}`;
  const valid = await json(
    app,
    `${base}sort=-field:count&${encode([
      { field: "flag", op: "eq", value: false },
      { field: "count", op: "range", min: 0 },
    ])}`,
  );
  expect(valid.response.status).toBe(200);
  expect(reads[0].query.filters).toEqual([
    { field: "count", op: "range", min: 0 },
    { field: "flag", op: "eq", value: false },
  ]);
  for (const [query, pointer] of [
    ["filters=%7B", "/filters"],
    ["filters=null", "/filters"],
    [`filters=${encodeURIComponent("я".repeat(4097))}`, "/filters"],
    ["q=one&q=two", "/q"],
    ["filters=[]&filters=[]", "/filters"],
    ["sort=field:flag", "/sort"],
    ["searchableFields=title", "/filters"],
    [encode([{ field: "flag", op: "eq", value: "secret-input" }]), "/filters/0/value"],
    [encode([{ field: "count", op: "range", min: 5, max: 0 }]), "/filters/0/max"],
    [encode([{ field: "time", op: "range", from: "2026-10-25T12:00:00" }]), "/filters/0/from"],
    [encode([{ field: "missing", op: "isSet" }]), "/filters/0/field"],
    [encode([{ field: "category", op: "eq", value: "news" }]), "/filters/0/op"],
    [encode([{ field: "count", op: "eq", value: 0, extra: true }]), "/filters/0/extra"],
    [encode(Array(17).fill({ field: "count", op: "isSet" })), "/filters"],
  ]) {
    const response = await json(app, base + query);
    expect(response).toMatchObject({
      response: { status: 422 },
      body: { error: { code: "VALIDATION_FAILED", details: { issues: [{ path: pointer }] } } },
    });
    expect(JSON.stringify(response.body)).not.toContain("secret-input");
  }
  expect(reads).toHaveLength(1);
  expect((await json(app, base + "sort=title")).response.status).toBe(200);
  expect((await json(app, base + "filters=[]")).response.status).toBe(200);
});

test("the entry-list API applies a collection's default sort when sort is omitted", async () => {
  const models = [
    defineCollection({
      key: "projects",
      route: "/projects/:slug",
      version: 1,
      fields: { order: field.number() },
      listOptions: { sortableFields: ["order"], defaultSort: "field:order" },
    }),
  ];
  const { app, store } = await fixture({ models });
  expect((await json(app, "/api/v1/admin/content-models")).body.items[0].listOptions).toEqual({
    sortableFields: ["order"],
    defaultSort: "field:order",
  });
  const reads = [];
  store.list = async (query) => {
    reads.push(query);
    return { items: [], totals: { all: 0, changed: 0, draft: 0, published: 0 } };
  };
  const base = "/api/v1/admin/models/projects/entries";
  expect((await json(app, base)).response.status).toBe(200);
  expect((await json(app, `${base}?sort=-updatedAt`)).response.status).toBe(200);
  expect(reads.map((read) => read.sort)).toEqual(["field:order", "-updatedAt"]);
});

test("runtime search metadata and byte boundaries yield precise value-free API errors before reads", async () => {
  const models = [
    defineCollection({
      key: "posts",
      route: "/:slug",
      version: 1,
      fields: { text: field.text(), count: field.number() },
      listOptions: { filterableFields: ["text", "count"] },
    }),
  ];
  for (const listQueryLimits of [
    { maxSearchLength: 200, maxLikePatternBytes: null },
    { maxSearchLength: 48, maxLikePatternBytes: 50 },
  ]) {
    const { app, store, logs } = await fixture({ models, listQueryLimits });
    expect((await json(app, "/api/v1/admin/content-models")).body.listQueryLimits).toEqual(
      listQueryLimits,
    );
    const calls = [];
    store.list = async (input) => {
      calls.push(input);
      return { items: [], totals: { all: 0, draft: 0, published: 0, changed: 0 } };
    };
    const path = "/api/v1/admin/models/posts/entries?";
    for (const value of ["a".repeat(48), "я".repeat(24), "%".repeat(24), "aя".repeat(16)]) {
      expect(
        (await json(app, path + new URLSearchParams({ q: ` ${value} ` }))).response.status,
      ).toBe(200);
      expect(
        (
          await json(
            app,
            path +
              new URLSearchParams({
                filters: JSON.stringify([{ field: "text", op: "contains", value }]),
              }),
          )
        ).response.status,
      ).toBe(200);
    }
    for (const value of [
      "a".repeat(49),
      "я".repeat(24) + "a",
      "%".repeat(24) + "a",
      "aя".repeat(16) + "a",
      "я".repeat(200),
    ]) {
      for (const [query, pointer] of [
        [{ q: value, maxSearchLength: "200", maxLikePatternBytes: "null" }, "/q"],
        [
          {
            filters: JSON.stringify([
              { field: "text", op: "contains", value },
              { field: "count", op: "eq", value: 0 },
            ]),
          },
          "/filters/0/value",
        ],
      ]) {
        const count = calls.length;
        const result = await json(app, path + new URLSearchParams(query));
        if (listQueryLimits.maxSearchLength === 200) expect(result.response.status).toBe(200);
        else {
          expect(result.response.status).toBe(422);
          expect(result.body.error.details.issues).toContainEqual(
            expect.objectContaining({ path: pointer }),
          );
          expect(JSON.stringify(result.body)).not.toContain(value);
          expect(calls).toHaveLength(count);
        }
      }
    }
    expect(
      (
        await json(
          app,
          path +
            new URLSearchParams({
              filters: JSON.stringify([{ field: "text", op: "eq", value: "я".repeat(200) }]),
            }),
        )
      ).response.status,
    ).toBe(200);
    expect(JSON.stringify(logs)).not.toContain("яяяя");
  }
});

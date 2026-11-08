// @ts-nocheck
// TODO(rf2): Type mutable media fixtures, partial storage adapters and invalid multipart/query inputs.
import { expect, test } from "vitest";

import { actorId, unixMilliseconds } from "@lacecms/domain";

import {
  admin,
  editor,
  fixture,
  json,
  mediaBlocks,
  mediaModels,
  PICTURE_KEY,
  GALLERY_KEY,
  uploadImage,
  jsonRequest,
} from "../test-support/app-harness.js";

test("bodyless media lifecycle requests reach the use case without bypassing body limits elsewhere", async () => {
  const { app } = await fixture();
  const emptyBody = () =>
    new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
  for (const [method, path] of [
    ["DELETE", "/api/v1/admin/media/missing"],
    ["POST", "/api/v1/admin/media/missing/retry-deletion"],
  ]) {
    const response = await app.fetch(
      new Request(`https://lace.test${path}`, {
        body: emptyBody(),
        duplex: "half",
        method,
      }),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("CONTENT_INVALID_STATE");
  }
});

test("keeps media uploads, previews, and draft-only public reads separate", async () => {
  const { app, storage } = await fixture();
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], {
      type: "text/plain",
    }),
    "cover\r\nX-Injected: nope.png",
  );
  const created = await app.fetch(
    new Request("https://lace.test/api/v1/admin/media", { body: form, method: "POST" }),
  );
  expect(created.status).toBe(201);
  const metadata = await created.json();
  expect(metadata).toMatchObject({
    mimeType: "image/png",
    url: expect.stringContaining("/media/"),
  });
  expect(metadata).not.toHaveProperty("storageKey");
  const preview = await app.fetch(
    new Request(`https://lace.test/api/v1/admin/media/${metadata.id}/preview`),
  );
  expect(preview.headers.get("content-type")).toBe("image/png");
  expect(preview.headers.get("content-disposition")).not.toMatch(/[\r\n]/u);
  expect(await json(app, `/api/v1/public/media/${metadata.id}`)).toMatchObject({
    body: { error: { code: "NOT_FOUND" } },
    response: { status: 404 },
  });
  const deleted = await app.fetch(
    new Request(`https://lace.test/api/v1/admin/media/${metadata.id}`, { method: "DELETE" }),
  );
  expect(deleted.status).toBe(202);

  const missing = await app.fetch(
    new Request("https://lace.test/api/v1/admin/media", { body: new FormData(), method: "POST" }),
  );
  expect(missing.status).toBe(422);
  const duplicate = new FormData();
  duplicate.append(
    "file",
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]),
    "one.png",
  );
  duplicate.append(
    "file",
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]),
    "two.png",
  );
  expect(
    (
      await app.fetch(
        new Request("https://lace.test/api/v1/admin/media", { body: duplicate, method: "POST" }),
      )
    ).status,
  ).toBe(422);
  const mismatch = new FormData();
  mismatch.append("file", new Blob([new TextEncoder().encode("not an image")]), "cover.png");
  expect(
    (
      await app.fetch(
        new Request("https://lace.test/api/v1/admin/media", { body: mismatch, method: "POST" }),
      )
    ).status,
  ).toBe(422);
  const oversized = new FormData();
  oversized.append("file", new Blob([new Uint8Array(10 * 1024 * 1024 + 1)]), "large.png");
  expect(
    (
      await app.fetch(
        new Request("https://lace.test/api/v1/admin/media", { body: oversized, method: "POST" }),
      )
    ).status,
  ).toBe(413);
  expect((await json(app, "/api/v1/admin/media")).body.items).toHaveLength(1);

  const publishable = new FormData();
  publishable.append(
    "file",
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]),
    "published.png",
  );
  const publishedMedia = await (
    await app.fetch(
      new Request("https://lace.test/api/v1/admin/media", { body: publishable, method: "POST" }),
    )
  ).json();
  expect(publishedMedia).toMatchObject({ status: "active" });
  const entry = await json(app, "/api/v1/admin/models/posts/entries", {
    body: JSON.stringify({
      blocks: [],
      fields: { image: publishedMedia.id },
      slug: "image",
      title: "Image",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  expect(entry.response.status).toBe(201);
  const publication = await json(app, `/api/v1/admin/entries/${entry.body.id}/publish`, {
    body: JSON.stringify({ expectedRevision: 1 }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  expect(publication.response.status).toBe(200);
  const publicMedia = await app.fetch(
    new Request(`https://lace.test/api/v1/public/media/${publishedMedia.id}`),
  );
  expect(publicMedia.status).toBe(200);
  expect(publicMedia.headers.get("content-type")).toBe("image/png");
  await storage.delete(`media/${publishedMedia.id}`);
  expect(await json(app, `/api/v1/public/media/${publishedMedia.id}`)).toMatchObject({
    body: { error: { code: "INTERNAL_ERROR" } },
    response: { status: 500 },
  });
});

test("media binaries carry immutable validators and answer 304 only after eligibility", async () => {
  let current = admin;
  const { app, storage } = await fixture({ maxBodyBytes: 8192, resolveActor: async () => current });
  const reads = [];
  const get = storage.get.bind(storage);
  storage.get = async (key) => {
    reads.push(key);
    return get(key);
  };
  const request = (path, headers = {}) =>
    app.fetch(new Request(`https://lace.test${path}`, { headers }));
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]),
    "cover.png",
  );
  const cover = await (
    await app.fetch(
      new Request("https://lace.test/api/v1/admin/media", { body: form, method: "POST" }),
    )
  ).json();
  const publicPath = `/api/v1/public/media/${cover.id}`;
  const previewPath = `/api/v1/admin/media/${cover.id}/preview`;
  const tag = `"m-${cover.id}"`;

  const preview = await request(previewPath);
  expect(preview.status).toBe(200);
  expect(preview.headers.get("etag")).toBe(tag);
  expect(preview.headers.get("cache-control")).toBe("private, no-cache");
  expect(await request(publicPath, { "if-none-match": tag })).toMatchObject({ status: 404 });

  const entry = await json(app, "/api/v1/admin/models/posts/entries", {
    body: JSON.stringify({
      blocks: [],
      fields: { image: cover.id },
      slug: "cover",
      title: "Cover",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const published = await json(app, `/api/v1/admin/entries/${entry.body.id}/publish`, {
    body: JSON.stringify({ expectedRevision: 1 }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const full = await request(publicPath);
  expect(full.status).toBe(200);
  expect(full.headers.get("etag")).toBe(tag);
  expect(full.headers.get("cache-control")).toBe("public, max-age=86400");
  expect(new Uint8Array(await full.arrayBuffer())).toHaveLength(8);

  reads.length = 0;
  for (const header of [tag, `W/${tag}`, `"other", ${tag}`, "*", ` W/"x" ,, ${tag} `]) {
    const unchanged = await request(publicPath, { "if-none-match": header });
    expect(unchanged.status, header).toBe(304);
    expect(unchanged.headers.get("etag")).toBe(tag);
    expect(unchanged.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(await unchanged.text()).toBe("");
  }
  expect(reads).toEqual([]);

  for (const header of ["not-a-tag", `"other"`, `${tag}, junk`, `"other", *`, ""]) {
    const complete = await request(publicPath, { "if-none-match": header });
    expect(complete.status, header).toBe(200);
    expect(complete.headers.get("etag")).toBe(tag);
    expect(new Uint8Array(await complete.arrayBuffer())).toHaveLength(8);
  }

  const detail = await request(`/api/v1/admin/media/${cover.id}`);
  const edited = await app.fetch(
    new Request(`https://lace.test/api/v1/admin/media/${cover.id}`, {
      body: JSON.stringify({ alt: "A new description" }),
      headers: { "content-type": "application/json", "if-match": detail.headers.get("etag") },
      method: "PATCH",
    }),
  );
  expect(edited.status).toBe(200);
  expect(edited.headers.get("etag")).not.toBe(detail.headers.get("etag"));
  expect((await request(publicPath)).headers.get("etag")).toBe(tag);
  expect((await request(publicPath, { "if-none-match": tag })).status).toBe(304);

  reads.length = 0;
  const privately = await request(previewPath, { "if-none-match": tag });
  expect(privately.status).toBe(304);
  expect(privately.headers.get("cache-control")).toBe("private, no-cache");
  current = { id: actorId("viewer"), role: "viewer" };
  expect((await request(previewPath, { "if-none-match": tag })).status).toBe(304);
  expect(reads).toEqual([]);
  current = null;
  const anonymous = await request(previewPath, { "if-none-match": tag });
  expect(anonymous.status).toBe(403);
  expect(anonymous.headers.get("etag")).toBeNull();
  current = admin;

  const unpublished = await json(app, `/api/v1/admin/entries/${entry.body.id}/unpublish`, {
    body: JSON.stringify({ expectedPublishedSnapshotId: published.body.entry.published.id }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  expect(unpublished.response.status).toBe(200);
  const gone = await json(app, publicPath, { headers: { "if-none-match": tag } });
  expect(gone).toMatchObject({ body: { error: { code: "NOT_FOUND" } }, response: { status: 404 } });
  expect(gone.response.headers.get("etag")).toBeNull();
});

test("allows viewers to list media but not mutate it", async () => {
  const { app } = await fixture({ actor: { id: actorId("viewer"), role: "viewer" } });
  expect((await json(app, "/api/v1/admin/media")).response.status).toBe(200);
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]),
    "denied.png",
  );
  expect(
    (
      await app.fetch(
        new Request("https://lace.test/api/v1/admin/media", { body: form, method: "POST" }),
      )
    ).status,
  ).toBe(403);
});

test("accepts an authorized retry only for terminal media deletion failures", async () => {
  const { app, storage, store } = await fixture();
  store.registerMedia({
    createdAt: unixMilliseconds(1),
    createdBy: actorId("admin"),
    filename: "failed.png",
    id: "failed-media",
    mimeType: "image/png",
    size: 1,
    status: "delete_failed",
    storageKey: "media/failed-media",
    updatedAt: unixMilliseconds(2),
  });
  expect(
    await (
      await app.fetch(
        new Request("https://lace.test/api/v1/admin/media/failed-media/retry-deletion", {
          method: "POST",
        }),
      )
    ).json(),
  ).toMatchObject({ status: "deleting" });
  expect(store.mediaDeletionRequests).toEqual(["failed-media"]);
  await expect(
    app.fetch(
      new Request("https://lace.test/api/v1/admin/media/failed-media/retry-deletion", {
        method: "POST",
      }),
    ),
  ).resolves.toMatchObject({ status: 422 });
  expect(await storage.get("media/failed-media")).toBeNull();
});

test("lists media with filters and bound cursors and exposes details with usage", async () => {
  const { app, store } = await fixture();
  store.setActorDisplayNames({ admin: "Ada" });
  const upload = async (filename) => {
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]),
      filename,
    );
    const created = await app.fetch(
      new Request("https://lace.test/api/v1/admin/media", { body: form, method: "POST" }),
    );
    expect(created.status).toBe(201);
    return created.json();
  };
  const cover = await upload("Cover.png");
  const banner = await upload("banner.png");
  expect(cover).toMatchObject({
    createdBy: { displayName: "Ada", id: "admin" },
    height: 1,
    usageCount: 0,
    width: 1,
  });

  const ids = async (query) =>
    (await json(app, `/api/v1/admin/media?${query}`)).body.items.map((item) => item.id);
  expect(await ids("q=%20COVER%20")).toEqual([cover.id]);
  expect(await ids("type=image/png&sort=filename")).toEqual([banner.id, cover.id]);
  expect(await ids("type=image/jpeg")).toEqual([]);
  expect(await ids("q=")).toHaveLength(2);
  for (const [query, pointer] of [
    ["type=image/svg%2Bxml", "/type"],
    ["sort=width", "/sort"],
    [`q=${"x".repeat(201)}`, "/q"],
    ["limit=0", "/limit"],
  ]) {
    expect(await json(app, `/api/v1/admin/media?${query}`)).toMatchObject({
      body: { error: { code: "VALIDATION_FAILED", details: { issues: [{ path: pointer }] } } },
      response: { status: 422 },
    });
  }
  const first = await json(app, "/api/v1/admin/media?sort=filename&limit=1");
  const cursor = encodeURIComponent(first.body.nextCursor);
  expect(await ids(`sort=filename&limit=1&after=${cursor}`)).toEqual([cover.id]);
  expect(
    await json(app, `/api/v1/admin/media?sort=-createdAt&limit=1&after=${cursor}`),
  ).toMatchObject({
    body: { error: { code: "CONTENT_INVALID_STATE" } },
    response: { status: 422 },
  });

  const entry = await json(app, "/api/v1/admin/models/posts/entries", {
    body: JSON.stringify({
      blocks: [],
      fields: { image: cover.id },
      slug: "cover",
      title: "Cover",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  expect(entry.response.status).toBe(201);
  await json(app, `/api/v1/admin/entries/${entry.body.id}/publish`, {
    body: JSON.stringify({ expectedRevision: 1 }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const detail = await json(app, `/api/v1/admin/media/${cover.id}`);
  expect(detail.response.status).toBe(200);
  expect(detail.body).toMatchObject({
    createdBy: { displayName: "Ada", id: "admin" },
    id: cover.id,
    usage: [
      {
        entryId: entry.body.id,
        locations: [{ field: "image", source: "field", states: ["draft", "published"] }],
        modelKey: "posts",
        slug: "cover",
        status: "published",
        title: "Cover",
      },
    ],
    usageCount: 1,
  });
  expect(JSON.stringify(detail.body)).not.toContain("storageKey");
  expect((await ids("q=cover")).length).toBe(1);
  expect((await json(app, "/api/v1/admin/media?q=cover")).body.items[0].usageCount).toBe(1);
  expect(await json(app, "/api/v1/admin/media/missing")).toMatchObject({
    body: { error: { code: "NOT_FOUND" } },
    response: { status: 404 },
  });

  const refused = await app.fetch(
    new Request(`https://lace.test/api/v1/admin/media/${cover.id}`, { method: "DELETE" }),
  );
  expect(refused.status).toBe(409);
  expect(await refused.json()).toEqual({
    error: { code: "MEDIA_IN_USE", message: "The media is still used by content." },
  });
  expect(store.mediaDeletionRequests).toEqual([]);
  const accepted = await app.fetch(
    new Request(`https://lace.test/api/v1/admin/media/${banner.id}`, { method: "DELETE" }),
  );
  expect(accepted.status).toBe(202);
  expect(await accepted.json()).toMatchObject({ status: "deleting", usageCount: 0 });
  expect((await json(app, `/api/v1/admin/media/${banner.id}`)).body).toMatchObject({
    status: "deleting",
    usage: [],
  });
});

test("removing a media block from a draft releases the media only after republication", async () => {
  const { app } = await fixture({ blocks: mediaBlocks, maxBodyBytes: 8192, models: mediaModels });
  const image = await uploadImage(app, "photo.png");
  const other = await uploadImage(app, "other.png");
  const gallery = {
    data: { images: [{ caption: "Other", image: other.id }] },
    key: GALLERY_KEY,
    position: 2000,
    schemaVersion: 1,
    type: "gallery",
  };
  const created = await json(
    app,
    "/api/v1/admin/models/posts/entries",
    jsonRequest("POST", {
      blocks: [
        {
          data: { image: image.id },
          key: PICTURE_KEY,
          position: 1000,
          schemaVersion: 1,
          type: "picture",
        },
        gallery,
      ],
      fields: {},
      slug: "post",
      title: "Post",
    }),
  );
  expect(created.response.status).toBe(201);
  const entryId = created.body.id;
  const publish = (expectedRevision) =>
    json(
      app,
      `/api/v1/admin/entries/${entryId}/publish`,
      jsonRequest("POST", { expectedRevision }),
    );
  expect((await publish(1)).response.status).toBe(200);
  const saved = await json(
    app,
    `/api/v1/admin/entries/${entryId}/draft`,
    jsonRequest("PUT", {
      blocks: [{ ...gallery, position: 1000 }],
      expectedRevision: 1,
      fields: {},
      slug: "post",
      title: "Post",
    }),
  );
  expect(saved.response.status).toBe(200);

  expect((await json(app, `/api/v1/admin/media/${image.id}`)).body).toMatchObject({
    usage: [
      {
        entryId,
        locations: [
          {
            blockKey: PICTURE_KEY,
            blockType: "picture",
            field: "image",
            source: "block",
            states: ["published"],
          },
        ],
        status: "changed",
      },
    ],
    usageCount: 1,
  });
  const remove = () =>
    app.fetch(
      new Request(`https://lace.test/api/v1/admin/media/${image.id}`, { method: "DELETE" }),
    );
  const refused = await remove();
  expect(refused.status).toBe(409);
  expect(await refused.json()).toMatchObject({ error: { code: "MEDIA_IN_USE" } });

  expect((await publish(2)).response.status).toBe(200);
  expect((await json(app, `/api/v1/admin/media/${image.id}`)).body).toMatchObject({
    usage: [],
    usageCount: 0,
  });
  expect((await json(app, `/api/v1/admin/media/${other.id}`)).body.usageCount).toBe(1);
  const accepted = await remove();
  expect(accepted.status).toBe(202);
  expect(await accepted.json()).toMatchObject({ status: "deleting", usageCount: 0 });
});

test("detach=drafts clears draft-only usage before deletion and rejects other values", async () => {
  const { app, store } = await fixture({
    actor: editor,
    blocks: mediaBlocks,
    maxBodyBytes: 8192,
    models: mediaModels,
  });
  const image = await uploadImage(app, "photo.png");
  const other = await uploadImage(app, "other.png");
  const created = await json(
    app,
    "/api/v1/admin/models/posts/entries",
    jsonRequest("POST", {
      blocks: [
        {
          data: { image: image.id },
          key: PICTURE_KEY,
          position: 1000,
          schemaVersion: 1,
          type: "picture",
        },
        {
          data: { images: [{ caption: "One", image: image.id }, { image: other.id }] },
          key: GALLERY_KEY,
          position: 2000,
          schemaVersion: 1,
          type: "gallery",
        },
      ],
      fields: { cover: image.id, photos: [image.id, other.id] },
      seo: { image: image.id },
      slug: "post",
      title: "Post",
    }),
  );
  expect(created.response.status).toBe(201);
  const remove = (query) =>
    json(app, `/api/v1/admin/media/${image.id}${query}`, { method: "DELETE" });
  for (const query of ["?detach=all", "?detach=drafts&detach=drafts"]) {
    expect(await remove(query)).toMatchObject({
      body: { error: { code: "VALIDATION_FAILED", details: { issues: [{ path: "/detach" }] } } },
      response: { status: 422 },
    });
  }
  expect(await remove("")).toMatchObject({
    body: { error: { code: "MEDIA_IN_USE" } },
    response: { status: 409 },
  });
  expect((await json(app, `/api/v1/admin/entries/${created.body.id}`)).body.draft.revision).toBe(1);

  expect(await remove("?detach=drafts")).toMatchObject({
    body: { id: image.id, status: "deleting", usageCount: 0 },
    response: { status: 202 },
  });
  const entry = (await json(app, `/api/v1/admin/entries/${created.body.id}`)).body.draft;
  expect(entry).toMatchObject({ fields: { photos: [other.id] }, revision: 2 });
  expect(entry.fields).not.toHaveProperty("cover");
  expect(entry.seo.image).toBeNull();
  expect(entry.blocks.map((block) => block.data)).toEqual([
    {},
    { images: [{ caption: "One" }, { image: other.id }] },
  ]);
  expect(store.mediaDeletionRequests).toEqual([image.id]);
  expect((await json(app, `/api/v1/admin/media/${other.id}`)).body.usageCount).toBe(1);
});

test("media metadata route updates with If-Match, returns ETags, and queues builds for published media", async () => {
  let current = admin;
  const viewer = { id: actorId("viewer"), role: "viewer" };
  const { app, store } = await fixture({ maxBodyBytes: 8192, resolveActor: async () => current });
  const upload = async (filename) => {
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]),
      filename,
    );
    const created = await app.fetch(
      new Request("https://lace.test/api/v1/admin/media", { body: form, method: "POST" }),
    );
    return created.json();
  };
  const patch = (id, body, ifMatch) =>
    app.fetch(
      new Request(`https://lace.test/api/v1/admin/media/${id}`, {
        body: JSON.stringify(body),
        headers: {
          "content-type": "application/json",
          ...(ifMatch === undefined ? {} : { "if-match": ifMatch }),
        },
        method: "PATCH",
      }),
    );
  const cover = await upload("cover.png");
  const unused = await upload("unused.png");
  const entry = await json(app, "/api/v1/admin/models/posts/entries", {
    body: JSON.stringify({
      blocks: [],
      fields: { image: cover.id },
      slug: "cover",
      title: "Cover",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  await json(app, `/api/v1/admin/entries/${entry.body.id}/publish`, {
    body: JSON.stringify({ expectedRevision: 1 }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  const detail = await app.fetch(new Request(`https://lace.test/api/v1/admin/media/${cover.id}`));
  const tag = detail.headers.get("etag");
  expect(tag).toBe(`"${Date.parse((await detail.json()).updatedAt)}"`);

  const version = await store.publishedContentVersion();
  const updated = await patch(
    cover.id,
    { alt: "Red bicycle", focalPoint: { x: 0.5, y: 0.3 } },
    tag,
  );
  expect(updated.status).toBe(200);
  const updatedBody = await updated.json();
  expect(updatedBody).toMatchObject({
    build: { status: "queued", targetVersion: version + 1 },
    media: { alt: "Red bicycle", focalPoint: { x: 0.5, y: 0.3 }, id: cover.id },
  });
  expect(JSON.stringify(updatedBody)).not.toContain("storageKey");
  const nextTag = updated.headers.get("etag");
  expect(nextTag).not.toBe(tag);
  expect(nextTag).toBe(`"${Date.parse(updatedBody.media.updatedAt)}"`);
  expect(store.mediaMetadataBuildRequests).toEqual([version + 1]);

  const stale = await patch(cover.id, { alt: "Stale" }, tag);
  expect(stale.status).toBe(409);
  expect(await stale.json()).toEqual({
    error: {
      code: "MEDIA_UPDATE_CONFLICT",
      message: "The media was modified by another request.",
    },
  });

  const unusedTag = `"${Date.parse(unused.updatedAt)}"`;
  const idle = await patch(unused.id, { caption: "Spare" }, unusedTag);
  expect(idle.status).toBe(200);
  expect((await idle.json()).build).toEqual({ status: "not-dispatched" });

  for (const [body, ifMatch, pointer] of [
    [{ alt: "x" }, undefined, ""],
    [{ alt: "x" }, `W/${nextTag}`, ""],
    [{ alt: "x" }, "*", ""],
    [{ focalPoint: { x: -0.1, y: 0.5 } }, nextTag, "/focalPoint/x"],
    [{ title: "x" }, nextTag, "/title"],
    [{ alt: "a\nb" }, nextTag, "/alt"],
    [{}, nextTag, ""],
  ]) {
    const refused = await patch(cover.id, body, ifMatch);
    expect(refused.status, JSON.stringify(body)).toBe(422);
    const envelope = await refused.json();
    expect(envelope.error.code).toBe("VALIDATION_FAILED");
    expect(envelope.error.details.issues.map((issue) => issue.path)).toContain(pointer);
  }
  expect((await patch("missing", { alt: "x" }, nextTag)).status).toBe(404);

  current = viewer;
  const denied = await patch(cover.id, { alt: "Viewer" }, nextTag);
  expect(denied.status).toBe(403);
  expect((await denied.json()).error.code).toBe("AUTHORIZATION_DENIED");
  current = admin;

  const deleting = await app.fetch(
    new Request(`https://lace.test/api/v1/admin/media/${unused.id}`, { method: "DELETE" }),
  );
  const deletingBody = await deleting.json();
  const refusedDeleting = await patch(
    unused.id,
    { alt: "Gone" },
    `"${Date.parse(deletingBody.updatedAt)}"`,
  );
  expect(refusedDeleting.status).toBe(422);
  expect((await refusedDeleting.json()).error.code).toBe("CONTENT_INVALID_STATE");
  expect((await json(app, `/api/v1/admin/media/${cover.id}`)).body).toMatchObject({
    alt: "Red bicycle",
    focalPoint: { x: 0.5, y: 0.3 },
  });
});

test("media tag REST supports upload, replacement, filtering, catalog and precise refusal", async () => {
  let current = admin;
  const { app, storage } = await fixture({ resolveActor: async () => current });
  let storedObjects = 0;
  const put = storage.put.bind(storage);
  storage.put = async (input) => {
    storedObjects++;
    return put(input);
  };
  const upload = async (tags, tagFile = false) => {
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]),
      "cover.png",
    );
    for (const tag of tags) form.append("tags", tagFile ? new File([tag], "tag.txt") : tag);
    return app.fetch(
      new Request("https://lace.test/api/v1/admin/media", { method: "POST", body: form }),
    );
  };
  for (const tags of [["a,b"], ["a b"], ["Выставка"], ["\na"], Array(21).fill("a")]) {
    const result = await upload(tags);
    expect(result.status).toBe(422);
    expect((await result.json()).error.details.issues[0].path).toMatch(/^\/tags\//);
  }
  expect((await upload(["tag"], true)).status).toBe(422);
  expect(storedObjects).toBe(0);
  expect((await json(app, "/api/v1/admin/media")).body.items).toEqual([]);
  const created = await upload([" Birch ", "IBIZA", "birch"]);
  expect(created.status).toBe(201);
  const item = await created.json();
  expect(item.tags).toEqual(["birch", "ibiza"]);
  const other = await upload(["birch"]);
  expect(other.status).toBe(201);
  current = { id: actorId("viewer"), role: "viewer" };
  const catalog = await json(app, "/api/v1/admin/media/tags?q=BI");
  expect(catalog.response.status).toBe(200);
  expect(catalog.body.items).toEqual([{ tag: "birch", count: 2 }]);
  expect(
    (await json(app, "/api/v1/admin/media?tag=birch&tag=ibiza")).body.items.map((x) => x.id),
  ).toEqual([item.id]);
  const first = (await json(app, "/api/v1/admin/media?tag=birch&limit=1")).body;
  expect(
    (await json(app, `/api/v1/admin/media?tag=ibiza&after=${encodeURIComponent(first.nextCursor)}`))
      .response.status,
  ).toBe(422);
  const bad = await json(app, "/api/v1/admin/media?tag=a&tag=bad%20tag");
  expect(bad.response.status).toBe(422);
  expect(bad.body.error.details.issues[0].path).toBe("/tag/1");
  current = admin;
  const detail = await app.fetch(new Request(`https://lace.test/api/v1/admin/media/${item.id}`));
  const changed = await app.fetch(
    new Request(`https://lace.test/api/v1/admin/media/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "if-match": detail.headers.get("etag") },
      body: JSON.stringify({ tags: ["Project-2026"] }),
    }),
  );
  expect(changed.status).toBe(200);
  expect(await changed.json()).toMatchObject({
    media: { tags: ["project-2026"] },
    build: { status: "not-dispatched" },
  });
  current = null;
  expect((await json(app, "/api/v1/admin/media/tags")).response.status).toBe(403);
  // Existing actor resolution must not let an arbitrary build/MCP bearer authenticate admin reads.
  for (const token of ["build-token", "mcp-token"]) {
    const result = await app.fetch(
      new Request("https://lace.test/api/v1/admin/media/tags", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(result.status).toBe(403);
  }
});

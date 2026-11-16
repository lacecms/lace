import { array, object, string } from "./test-support/json.js";
import { afterEach, expect, test, vi } from "vitest";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { unixMilliseconds } from "@lacecms/domain";
import config from "../../../lace.config.js";
import { createCloudflareWorker } from "./index.js";
import { countingD1 } from "./test-support/d1-test-harness.js";
import { animatedGifFixture, readCompleteBuildExport } from "@lacecms/test-utils";

import { createWorkerFixture, origin, password } from "./test-support/worker-harness.js";
const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllGlobals();
});

const workerFixture = (options = {}) =>
  createWorkerFixture(createCloudflareWorker, cleanups, options);

/** Adapts the fixture's in-process Worker call to the shared export reader. */
function exportFetch(fixture: Awaited<ReturnType<typeof workerFixture>>) {
  return async (url: string, init?: RequestInit) => {
    const target = new URL(url);
    const { body, response } = await fixture.call(`${target.pathname}${target.search}`, {
      ...(init?.method === undefined ? {} : { method: init.method }),
      ...(init?.headers === undefined ? {} : { headers: init.headers }),
      ...(init?.body == null ? {} : { body: init.body }),
    });
    return { headers: response.headers, json: async () => body, status: response.status };
  };
}

async function png(width = 3, height = 2) {
  return sharp({ create: { background: { b: 3, g: 2, r: 1 }, channels: 3, height, width } })
    .png()
    .toBuffer();
}

async function upload(fixture: Awaited<ReturnType<typeof workerFixture>>, name = "cover.png") {
  const form = new FormData();
  form.append("file", new Blob([await png()], { type: "image/png" }), name);
  return fixture.call("/api/v1/admin/media", { body: form, method: "POST" });
}

test("Worker composition serves setup, auth, R2 media, and publication from D1", async () => {
  const fixture = await workerFixture();
  expect((await fixture.call("/health/ready")).response.status).toBe(200);
  expect((await fixture.call("/api/v1/admin/content-models")).response.status).toBe(401);
  const admin = await fixture.signIn();
  expect(admin).toMatchObject({ email: "admin@lace.test", role: "admin" });
  expect(
    (
      await fixture.call("/api/v1/setup/admin", {
        json: { email: "late@lace.test", password, token: "x".repeat(43) },
        method: "POST",
      })
    ).response.status,
  ).toBe(404);
  const models = await fixture.call("/api/v1/admin/content-models");
  expect(array(object(models.body).items).map((model) => object(model).key)).toEqual([
    "home",
    "about",
    "posts",
    "notes",
    "settings",
    "navigation",
  ]);

  const uploaded = await upload(fixture);
  expect(uploaded.response.status).toBe(201);
  expect(uploaded.body).toMatchObject({ height: 2, mimeType: "image/png", width: 3 });
  expect(
    await fixture.local.bucket.head(`media/${string(object(uploaded.body).id)}`),
  ).not.toBeNull();
  const binary = await fixture.worker.fetch(
    new Request(`${origin}/api/v1/public/media/${string(object(uploaded.body).id)}`),
    fixture.env,
    fixture.ctx,
  );
  expect(binary.status).toBe(404);

  const created = await fixture.call("/api/v1/admin/models/posts/entries", {
    json: { blocks: [], fields: { publishedAt: "2026-09-24" }, slug: "first", title: "First" },
    method: "POST",
  });
  expect(created.response.status).toBe(201);
  const published = await fixture.call(
    `/api/v1/admin/entries/${string(object(created.body).id)}/publish`,
    {
      json: { expectedRevision: 1 },
      method: "POST",
    },
  );
  expect(published.response.status).toBe(200);
  expect(fixture.pending).toHaveLength(1);
  const stale = await fixture.call(
    `/api/v1/admin/entries/${string(object(created.body).id)}/publish`,
    {
      json: { expectedRevision: 5 },
      method: "POST",
    },
  );
  expect(stale.response.status).toBe(409);
  expect(fixture.pending).toHaveLength(1);
  const publicEntry = await fixture.call("/api/v1/public/collections/posts/first");
  expect(publicEntry).toMatchObject({
    body: { entry: { title: "First" } },
    response: { status: 200 },
  });
  const unknown = await fixture.call("/api/v1/unknown");
  expect(unknown.response.status).toBe(404);
  expect(unknown.body).toMatchObject({ error: { code: "NOT_FOUND" } });
  expect((await fixture.call("/admin/")).response.status).toBe(404);
  await fixture.settle();
});

test("Worker accepts an animated GIF into R2 and filters the library by GIF", async () => {
  const fixture = await workerFixture();
  await fixture.signIn();
  expect((await upload(fixture)).response.status).toBe(201);
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(animatedGifFixture())], { type: "image/png" }),
    "loop.gif",
  );
  const gif = await fixture.call("/api/v1/admin/media", { body: form, method: "POST" });
  expect(gif.response.status).toBe(201);
  expect(gif.body).toMatchObject({ height: 240, mimeType: "image/gif", width: 320 });
  expect(await fixture.local.bucket.head(`media/${string(object(gif.body).id)}`)).not.toBeNull();
  const broken = new FormData();
  broken.append(
    "file",
    new Blob([new Uint8Array(animatedGifFixture().slice(0, -1))]),
    "broken.gif",
  );
  expect(
    (await fixture.call("/api/v1/admin/media", { body: broken, method: "POST" })).response.status,
  ).toBe(422);
  const list = await fixture.call("/api/v1/admin/media?type=image%2Fgif");
  expect(list.response.status).toBe(200);
  expect(array(object(list.body).items).map((item) => object(item).id)).toEqual([
    string(object(gif.body).id),
  ]);
});

test("Worker/D1 compares strong and weak export validators through publication", async () => {
  const fixture = await workerFixture();
  await fixture.signIn();
  const created = await fixture.call("/api/v1/admin/models/posts/entries", {
    json: { blocks: [], fields: { publishedAt: "2026-09-24" }, slug: "etag", title: "First" },
    method: "POST",
  });
  const path = `/api/v1/admin/entries/${string(object(created.body).id)}`;
  expect(
    (await fixture.call(`${path}/publish`, { json: { expectedRevision: 1 }, method: "POST" }))
      .response.status,
  ).toBe(200);
  const buildToken = await fixture.runtime.security.createBuildToken({
    name: "etag-test",
    now: unixMilliseconds(Date.now()),
  });
  const headers = { authorization: `Bearer ${buildToken.token}` };
  const fresh = await readCompleteBuildExport(
    exportFetch(fixture),
    "https://lace.invalid",
    buildToken.token,
  );
  const etag = fresh.etag;
  expect(etag).toBe(`"${fresh.export.version}"`);
  for (const tag of [etag, `W/${etag}`]) {
    const result = await fixture.call("/api/v1/public/build-export", {
      headers: { ...headers, "if-none-match": tag },
    });
    expect(result.response.status).toBe(304);
    expect(result.body).toBeUndefined();
    expect(result.response.headers.get("etag")).toBe(etag);
  }
  expect(
    (
      await fixture.call("/api/v1/public/build-export", {
        headers: { "if-none-match": `W/${etag}` },
      })
    ).response.status,
  ).toBe(401);
  for (const tag of ["*", 'W/"bad"', '"1", "2"', '"9007199254740992"'])
    expect(
      (
        await fixture.call("/api/v1/public/build-export", {
          headers: { ...headers, "if-none-match": tag },
        })
      ).response.status,
    ).toBe(422);
  expect(
    (
      await fixture.call(`${path}/draft`, {
        json: {
          blocks: [],
          expectedRevision: 1,
          fields: { publishedAt: "2026-09-24" },
          slug: "etag",
          title: "Second",
        },
        method: "PUT",
      })
    ).response.status,
  ).toBe(200);
  expect(
    (
      await fixture.call(`${path}/publish`, {
        headers: { "if-match": 'W/"2"' },
        json: { expectedRevision: 2 },
        method: "POST",
      })
    ).response.status,
  ).toBe(422);
  expect(
    (await fixture.call(`${path}/publish`, { json: { expectedRevision: 2 }, method: "POST" }))
      .response.status,
  ).toBe(200);
  const changed = await readCompleteBuildExport(
    exportFetch(fixture),
    "https://lace.invalid",
    buildToken.token,
    { headers: { "if-none-match": `W/${etag}` } },
  );
  expect(changed.export.version).toBe(fresh.export.version + 1);
  expect(changed.etag).toBe(`"${changed.export.version}"`);
  expect(
    changed.export.entries.find((entry) => entry.id === string(object(created.body).id))?.title,
  ).toBe("Second");
  await fixture.settle();
});

test("real Worker API retains created slugs and duplicate/conflict behavior", async () => {
  const fixture = await workerFixture();
  await fixture.signIn();
  const metadata = await fixture.call("/api/v1/admin/content-models");
  expect(
    object(array(object(metadata.body).items).find((item) => object(item).key === "posts")).layout,
  ).toEqual(config.runtime.content.find((item) => item.key === "posts")?.layout);
  const payload = {
    title: "Café & News",
    slug: "cafe-news",
    fields: { publishedAt: "2026-10-14" },
    blocks: [],
  };
  const created = await fixture.call("/api/v1/admin/models/posts/entries", {
    json: payload,
    method: "POST",
  });
  expect(created.response.status).toBe(201);
  expect(object(object(created.body).draft).slug).toBe("cafe-news");
  const path = `/api/v1/admin/entries/${string(object(created.body).id)}`;
  const saved = await fixture.call(`${path}/draft`, {
    json: { ...payload, title: "Later", expectedRevision: 1 },
    method: "PUT",
  });
  expect(saved.response.status).toBe(200);
  expect(object(object(saved.body).draft).slug).toBe("cafe-news");
  const published = await fixture.call(`${path}/publish`, {
    json: { expectedRevision: object(object(saved.body).draft).revision },
    method: "POST",
  });
  expect(published.response.status).toBe(200);
  const duplicate = await fixture.call(`${path}/duplicate`, { json: {}, method: "POST" });
  expect(duplicate.response.status).toBe(201);
  expect(object(object(duplicate.body).draft).slug).toBeUndefined();
  const second = await fixture.call("/api/v1/admin/models/posts/entries", {
    json: { ...payload, title: "Conflict" },
    method: "POST",
  });
  expect(second.response.status).toBe(201);
  const conflict = await fixture.call(
    `/api/v1/admin/entries/${string(object(second.body).id)}/publish`,
    {
      json: { expectedRevision: 1 },
      method: "POST",
    },
  );
  expect(conflict.response.status).toBe(409);
  expect(
    object((await fixture.call(`/api/v1/admin/entries/${string(object(second.body).id)}`)).body)
      .draft,
  ).toEqual(object(second.body).draft);
  const slugless = await fixture.call("/api/v1/admin/models/posts/entries", {
    json: { title: "Новости", fields: {}, blocks: [] },
    method: "POST",
  });
  expect(slugless.response.status).toBe(201);
  expect(object(object(slugless.body).draft).slug).toBeUndefined();
  await fixture.settle();
}, 30_000);

test("complete authenticated content invocations fit D1 limits with maximum internal links", async () => {
  const fixture = await workerFixture();
  await fixture.signIn();
  const mediaIds = Array.from({ length: 200 }, (_, index) => `link-media-${index}`);
  await fixture.local.database
    .prepare(`insert into media
    (id,storage_key,filename,mime_type,size,width,height,metadata_json,status,created_by,created_at,updated_at)
    select value,'media/'||value,'image.png','image/png',1,1,1,'{}','active','admin',1,1 from json_each(?)`)
    .bind(JSON.stringify(mediaIds))
    .run();
  const target = await fixture.call("/api/v1/admin/models/notes/entries", {
    method: "POST",
    json: { title: "Target", slug: "link-target", fields: {}, blocks: [] },
  });
  expect(target.response.status).toBe(201);
  const targetPublication = await fixture.call(
    `/api/v1/admin/entries/${string(object(target.body).id)}/publish`,
    {
      method: "POST",
      json: { expectedRevision: 1 },
    },
  );
  expect(targetPublication.response.status).toBe(200);
  await fixture.settle();
  const counted = countingD1(fixture.local.database);
  const env = { ...fixture.env, DB: counted.binding };
  const measurements: { name: string; queries: number; maxBatch: number; maxBinds: number }[] = [];
  const invoke = async (
    name: string,
    path: string,
    method: string,
    json: unknown,
    expectedStatus: number,
    headers: Record<string, string> = {},
  ) => {
    counted.stats.queries = 0;
    counted.stats.maxBatchStatements = 0;
    counted.stats.maxParameters = 0;
    const pending: Promise<unknown>[] = [];
    const response = await fixture.worker.fetch(
      new Request(`${origin}${path}`, {
        method,
        headers: {
          cookie: string(fixture.cookie),
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.199",
          ...headers,
        },
        ...(json === undefined ? {} : { body: JSON.stringify(json) }),
      }),
      env,
      { waitUntil: (task) => pending.push(task) },
    );
    const text = await response.text();
    while (pending.length) await Promise.all(pending.splice(0));
    expect(response.status, `${name}: ${text}`).toBe(expectedStatus);
    measurements.push({
      name,
      queries: counted.stats.queries,
      maxBatch: counted.stats.maxBatchStatements,
      maxBinds: counted.stats.maxParameters,
    });
    expect(counted.stats.queries, name).toBeLessThanOrEqual(50);
    expect(counted.stats.maxBatchStatements, name).toBeLessThanOrEqual(40);
    expect(counted.stats.maxParameters, name).toBeLessThanOrEqual(100);
    return text ? object(JSON.parse(text)) : undefined;
  };
  const payload = {
    title: "Maximum links",
    slug: "maximum-links",
    fields: {},
    blocks: mediaIds.map((id, index) => ({
      key: `image-${index}`,
      type: "image",
      schemaVersion: 4,
      position: (index + 1) * 1000,
      data: { media: id, link: `entry:${string(object(target.body).id)}` },
    })),
  };
  const source = await invoke("create", "/api/v1/admin/models/notes/entries", "POST", payload, 201);
  const path = `/api/v1/admin/entries/${string(object(source).id)}`;
  await invoke("save", `${path}/draft`, "PUT", { ...payload, expectedRevision: 1 }, 200);
  await invoke("stale-save", `${path}/draft`, "PUT", { ...payload, expectedRevision: 1 }, 409);
  const published = await invoke(
    "publish",
    `${path}/publish`,
    "POST",
    { expectedRevision: 2 },
    200,
  );
  await invoke("duplicate", `${path}/duplicate`, "POST", {}, 201);
  const reverted = await invoke("revert", `${path}/revert`, "POST", { expectedRevision: 2 }, 200);
  await invoke(
    "unpublish",
    `${path}/unpublish`,
    "POST",
    { expectedPublishedSnapshotId: string(object(object(object(published).entry).published).id) },
    200,
  );
  await invoke("delete", path, "DELETE", undefined, 204, {
    "if-match": `"${object(object(reverted).draft).revision}"`,
  });
  if (process.env.LACE_CE10_EVIDENCE)
    await writeFile(
      `${process.env.LACE_CE10_EVIDENCE}-invocations.json`,
      JSON.stringify(measurements, null, 2),
    );
  console.info("Internal-link D1 invocation counts", JSON.stringify(measurements));
});

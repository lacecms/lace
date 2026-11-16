import { array, object, string } from "./test-support/json.js";
import { afterEach, expect, test, vi } from "vitest";

import sharp from "sharp";
import { actorId, mediaId, unixMilliseconds } from "@lacecms/domain";

import { SCHEDULED_MEDIA_DELETION_CLAIMS, createCloudflareWorker } from "./index.js";
import { countingD1 } from "./test-support/d1-test-harness.js";

import { createWorkerFixture, secret } from "./test-support/worker-harness.js";
const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllGlobals();
});

const workerFixture = (options = {}) =>
  createWorkerFixture(createCloudflareWorker, cleanups, options);

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

test("scheduled and post-commit dispatch recover builds and media deletions", async () => {
  const fixture = await workerFixture();
  await fixture.signIn();
  const created = await fixture.call("/api/v1/admin/models/posts/entries", {
    json: { blocks: [], fields: { publishedAt: "2026-09-24" }, slug: "second", title: "Second" },
    method: "POST",
  });
  // The request ends without its post-commit pass: only the scheduled run recovers it.
  await fixture.call(`/api/v1/admin/entries/${string(object(created.body).id)}/publish`, {
    json: { expectedRevision: 1 },
    method: "POST",
  });
  fixture.pending.splice(0);
  await fixture.worker.scheduled({}, fixture.env, fixture.ctx);
  expect(fixture.triggers).toHaveLength(0);
  fixture.advance(6_000);
  await fixture.worker.scheduled({}, fixture.env, fixture.ctx);
  expect(fixture.triggers).toHaveLength(1);
  const builds = await fixture.call("/api/v1/admin/site-builds");
  expect(array(object(builds.body).items)[0]).toMatchObject({ status: "succeeded" });

  const uploaded = await upload(fixture);
  const deleted = await fixture.call(`/api/v1/admin/media/${string(object(uploaded.body).id)}`, {
    method: "DELETE",
  });
  expect(deleted.response.status).toBeGreaterThanOrEqual(200);
  expect(deleted.response.status).toBeLessThan(300);
  expect(fixture.pending).toHaveLength(1);
  await fixture.settle();
  expect(await fixture.local.bucket.head(`media/${string(object(uploaded.body).id)}`)).toBeNull();
  expect(
    (await fixture.call(`/api/v1/admin/media/${string(object(uploaded.body).id)}`)).response.status,
  ).toBe(404);

  const failing = await upload(fixture, "second.png");
  await fixture.runtime.repository.markForDeletion({
    events: [
      {
        type: "media.delete.requested" as const,
        requestedAt: unixMilliseconds(Date.now()),
        payload: {
          mediaId: mediaId(string(object(failing.body).id)),
          requestedBy: { id: actorId("admin"), role: "admin" }.id,
        },
      },
    ],
    mediaId: mediaId(string(object(failing.body).id)),
    requestedAt: unixMilliseconds(Date.now()),
    requestedBy: { id: actorId("admin"), role: "admin" },
  });
  fixture.runtime.buildDispatcher.runOnce = async () => {
    throw new Error(`boom ${secret}`);
  };
  await fixture.worker.scheduled({}, fixture.env, fixture.ctx);
  expect(await fixture.local.bucket.head(`media/${string(object(failing.body).id)}`)).toBeNull();
  expect(fixture.logs).toContainEqual({
    component: "dispatch",
    dispatcher: "site-build",
    reason: "dispatch_failed",
  });
  expect(JSON.stringify(fixture.logs)).not.toContain(secret);
});

test("scheduled operations cleanup purges expired idempotency records as its own phase", async () => {
  const fixture = await workerFixture();
  const now = Date.now();
  await fixture.local.database
    .prepare(
      "insert into idempotency_records (scope,key,request_hash,response_json,created_at,expires_at) values ('publication:e:a','old','h','{}',1,?), ('publication:e:a','live','h','{}',1,?)",
    )
    .bind(now - 1, now + 86_400_000)
    .run();
  const keys = async () =>
    (
      await fixture.local.database.prepare("select key from idempotency_records order by key").all()
    ).results.map((row) => row.key);
  // The purge rides the OAuth phase-2 minute only; other minutes leave records in place.
  for (let minute = 0; minute < 3; minute += 1) {
    const phase = Math.floor(fixture.now() / 60_000) % 3;
    await fixture.worker.scheduled({}, fixture.env, fixture.ctx);
    expect(await keys()).toEqual(phase === 2 ? ["live"] : ["live", "old"]);
    if (phase === 2) break;
    fixture.advance(60_000);
  }
  expect(await keys()).toEqual(["live"]);

  fixture.advance(3 * 60_000);
  const purge = vi
    .spyOn(fixture.runtime.repository, "purgeExpiredIdempotencyRecords")
    .mockRejectedValue(new Error(`boom ${secret}`));
  const builds = vi.spyOn(fixture.runtime.buildDispatcher, "runOnce");
  await fixture.worker.scheduled({}, fixture.env, fixture.ctx);
  expect(purge).toHaveBeenCalledOnce();
  expect(builds).toHaveBeenCalledOnce();
  expect(fixture.logs).toContainEqual({
    component: "dispatch",
    dispatcher: "operations-cleanup",
    reason: "dispatch_failed",
  });
  expect(JSON.stringify(fixture.logs)).not.toContain(secret);
});

test("a scheduled run with many pending deletions stays within 50 D1 queries", async () => {
  const fixture = await workerFixture();
  await fixture.signIn();
  const ids = [];
  for (let index = 0; index < SCHEDULED_MEDIA_DELETION_CLAIMS + 3; index += 1) {
    const uploaded = await upload(fixture, `bulk-${index}.png`);
    ids.push(string(object(uploaded.body).id));
    await fixture.runtime.repository.markForDeletion({
      events: [
        {
          type: "media.delete.requested" as const,
          requestedAt: unixMilliseconds(Date.now()),
          payload: {
            mediaId: mediaId(string(object(uploaded.body).id)),
            requestedBy: { id: actorId("admin"), role: "admin" }.id,
          },
        },
      ],
      mediaId: mediaId(string(object(uploaded.body).id)),
      requestedAt: unixMilliseconds(Date.now()),
      requestedBy: { id: actorId("admin"), role: "admin" },
    });
  }
  const counted = countingD1(fixture.local.database);
  const env = { ...fixture.env, DB: counted.binding };
  await fixture.worker.scheduled({}, env, fixture.ctx);
  expect(counted.stats.queries).toBeLessThanOrEqual(50);
  expect(counted.stats.maxParameters).toBeLessThanOrEqual(100);
  const remaining = [];
  for (const id of ids)
    if ((await fixture.local.bucket.head(`media/${id}`)) !== null) remaining.push(id);
  expect(remaining).toHaveLength(3);
  // Exercise all three maintenance phases without widening the per-run budget.
  for (let phase = 0; phase < 2; phase += 1) {
    fixture.advance(60_000);
    const before = counted.stats.queries;
    await fixture.worker.scheduled({}, env, fixture.ctx);
    expect(counted.stats.queries - before).toBeLessThanOrEqual(50);
  }
  for (const id of ids) expect(await fixture.local.bucket.head(`media/${id}`)).toBeNull();
});

test("a configured deploy hook receives scheduled builds and records untracked acceptance", async () => {
  const hook = "https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/hook-secret";
  const calls: { body: BodyInit | null | undefined; method: string | undefined; target: string }[] =
    [];
  vi.stubGlobal("fetch", async (target: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ body: init?.body, method: init?.method, target: String(target) });
    return Response.json({ result: { id: "dep-42" }, success: true });
  });
  const fixture = await workerFixture({
    buildTrigger: undefined,
    env: { LACE_DEPLOY_HOOK_URL: hook },
  });
  await fixture.signIn();
  const created = await fixture.call("/api/v1/admin/models/posts/entries", {
    json: { blocks: [], fields: { publishedAt: "2026-09-24" }, slug: "hooked", title: "Hooked" },
    method: "POST",
  });
  await fixture.call(`/api/v1/admin/entries/${string(object(created.body).id)}/publish`, {
    json: { expectedRevision: 1 },
    method: "POST",
  });
  fixture.pending.splice(0);
  fixture.advance(6_000);
  await fixture.worker.scheduled({}, fixture.env, fixture.ctx);
  await fixture.worker.scheduled({}, fixture.env, fixture.ctx);
  expect(calls).toEqual([{ body: undefined, method: "POST", target: hook }]);
  const builds = await fixture.call("/api/v1/admin/site-builds");
  expect(array(object(builds.body).items)[0]).toMatchObject({
    providerBuildId: "dep-42",
    status: "accepted",
  });
  expect(JSON.stringify(builds.body)).not.toContain("hook-secret");
  expect(JSON.stringify(fixture.logs)).not.toContain("hook-secret");
});

test("without a deploy hook, dispatch records a sanitized trigger-unavailable failure", async () => {
  const fixture = await workerFixture({ buildTrigger: undefined });
  await fixture.signIn();
  await fixture.call("/api/v1/admin/builds", { method: "POST" });
  fixture.pending.splice(0);
  fixture.advance(6_000);
  await fixture.worker.scheduled({}, fixture.env, fixture.ctx);
  const builds = await fixture.call("/api/v1/admin/site-builds");
  expect(array(object(builds.body).items)[0]).toMatchObject({
    error: "trigger_unavailable",
    status: "pending",
  });
});

test("Worker history and detail preserve source diagnostics", async () => {
  const fixture = await workerFixture({
    buildResult: { status: "failed", reason: "source_symlink", path: "src/linked.astro" },
  });
  await fixture.signIn();
  const receipt = await fixture.call("/api/v1/admin/builds", { method: "POST", json: {} });
  fixture.pending.splice(0);
  fixture.advance(6000);
  await fixture.worker.scheduled({}, fixture.env, fixture.ctx);
  const builds = await fixture.call("/api/v1/admin/site-builds");
  expect(array(object(builds.body).items)[0]).toMatchObject({
    id: string(object(receipt.body).eventId),
    status: "pending",
    error: "source_symlink",
    errorPath: "src/linked.astro",
  });
  const detail = await fixture.call(
    `/api/v1/admin/site-builds/${string(object(receipt.body).eventId)}`,
  );
  expect(detail.body).toMatchObject({ error: "source_symlink", errorPath: "src/linked.astro" });
});

test("scheduled dispatch runs build, tracking and media in order and post-commit runs media then build", async () => {
  const fixture = await workerFixture();
  await fixture.signIn();
  await fixture.settle();
  const order: Array<[string, number | undefined]> = [];
  vi.spyOn(fixture.runtime.buildDispatcher, "runOnce").mockImplementation(async (limit) => {
    order.push(["build", limit]);
  });
  vi.spyOn(fixture.runtime.buildTracker, "runOnce").mockImplementation(async (limit) => {
    order.push(["tracking", limit]);
  });
  vi.spyOn(fixture.runtime.deletionDispatcher, "runOnce").mockImplementation(async (limit) => {
    order.push(["media", limit]);
  });

  await fixture.worker.scheduled({}, fixture.env, fixture.ctx);
  expect(order.splice(0)).toEqual([
    ["build", 1],
    ["tracking", 5],
    ["media", 5],
  ]);
  expect(fixture.pending).toEqual([]);

  const build = await fixture.call("/api/v1/admin/builds", { method: "POST", json: {} });
  expect(build.response.status).toBe(202);
  expect(fixture.pending).toHaveLength(1);
  await fixture.settle();
  expect(order).toEqual([
    ["media", 5],
    ["build", 1],
  ]);
});

test("committed insert and coalesce each wake the Worker once and deletion rollback never wakes it", async () => {
  const fixture = await workerFixture();
  await fixture.signIn();
  await fixture.settle();
  const db = fixture.local.database;
  await db.prepare("delete from outbox_events").run();
  const requestBuild = () => fixture.call("/api/v1/admin/builds", { method: "POST", json: {} });

  const inserted = await requestBuild();
  expect(inserted.response.status).toBe(202);
  expect(inserted.body).toMatchObject({ coalesced: false });
  expect(fixture.pending).toHaveLength(1);
  await fixture.settle();

  const coalesced = await requestBuild();
  expect(coalesced.response.status).toBe(202);
  expect(coalesced.body).toMatchObject({ coalesced: true, eventId: object(inserted.body).eventId });
  expect(fixture.pending).toHaveLength(1);
  await fixture.settle();

  const media = await upload(fixture);
  const id = string(object(media.body).id);
  await db
    .prepare(
      "create trigger reject_media_event before insert on outbox_events when new.type = 'media.delete.requested' begin select raise(abort, 'late enqueue failure'); end",
    )
    .run();
  const deletion = await fixture.call(`/api/v1/admin/media/${id}`, { method: "DELETE" });
  expect(deletion.response.status).toBe(422);
  expect(deletion.body).toMatchObject({ error: { code: "CONTENT_INVALID_STATE" } });
  expect(fixture.pending).toHaveLength(0);
  expect(await db.prepare("select status from media where id = ?").bind(id).first()).toEqual({
    status: "active",
  });
  expect(
    await db
      .prepare("select count(*) as n from outbox_events where type = 'media.delete.requested'")
      .first(),
  ).toEqual({ n: 0 });
});

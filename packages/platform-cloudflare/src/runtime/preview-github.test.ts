import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { contentEntryId, unixMilliseconds } from "@lacecms/domain";
import { draftPreviewOrigin, openPreviewSession, testActor } from "@lacecms/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import sharp from "sharp";
import { object, string } from "../test-support/json.js";
import { previewAcceptanceWorker } from "../test-support/preview-acceptance.js";
import { createWorkerFixture, origin, secret } from "../test-support/worker-harness.js";
import { createCloudflareWorker } from "./worker.js";

const commit = "a".repeat(40);
const bootstrap = "b".repeat(40);
const providerToken = "c".repeat(40);
const env = {
  LACE_PREVIEW_ORIGIN: draftPreviewOrigin,
  LACE_PREVIEW_GITHUB_REPOSITORY: "org/site",
  LACE_PREVIEW_GITHUB_WORKFLOW: "lace-preview.yml",
  LACE_PREVIEW_GITHUB_REF: "main",
  LACE_PREVIEW_GITHUB_TOKEN: providerToken,
  LACE_PREVIEW_RUNNER_SECRET: bootstrap,
  LACE_PREVIEW_SITE_PATH: "site",
  LACE_BUILD_SITE_ID: "main-site",
  LACE_BUILD_SITE_LABEL: "Main site",
  LACE_BUILD_SITE_URL: "https://published.lace.test/base/",
};
const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function fakeGitHub() {
  let generation = "";
  let status = "queued";
  let sha = commit;
  let runAttempt = 1;
  let revoked = false;
  let dispatches = 0;
  const fetcher = vi.fn<typeof fetch>(async (value, init) => {
    const url = new URL(String(value));
    expect(url.origin).toBe("https://api.github.com");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${providerToken}`);
    if (revoked) return new Response("private provider error", { status: 401 });
    if (url.pathname.endsWith("/commits/main")) return new Response(commit);
    if (url.pathname.endsWith("/dispatches")) {
      expect(url.pathname).toBe("/repos/org/site/actions/workflows/lace-preview.yml/dispatches");
      const { ref, inputs } = JSON.parse(String(init?.body));
      expect(ref).toBe("main");
      expect(inputs.commit).toBe(commit);
      generation = inputs.generation;
      return Response.json({ workflow_run_id: 123 + dispatches++ });
    }
    const id = 122 + dispatches;
    if (url.pathname.endsWith(`/runs/${id}/cancel`)) {
      expect(init?.method).toBe("POST");
      return new Response(null, { status: 202 });
    }
    expect(url.pathname).toBe(`/repos/org/site/actions/runs/${id}`);
    return Response.json({
      id,
      path: ".github/workflows/lace-preview.yml@main",
      display_title: `Lace preview ${generation}`,
      event: "workflow_dispatch",
      status,
      head_sha: sha,
      run_attempt: runAttempt,
      ...(status === "completed" && { conclusion: "cancelled" }),
    });
  });
  return {
    fetcher,
    setStatus: (value: string) => {
      status = value;
    },
    setSha: (value: string) => {
      sha = value;
    },
    setAttempt: (value: number) => {
      runAttempt = value;
    },
    revoke: (value: boolean) => {
      revoked = value;
    },
  };
}

async function bundlePreviewWorker(): Promise<string> {
  const api = createRequire(new URL("../../../../apps/api/package.json", import.meta.url));
  const { build } = createRequire(api.resolve("wrangler/package.json"))("esbuild") as {
    build(options: unknown): Promise<{ outputFiles: { text: string }[] }>;
  };
  const compiled = await build({
    stdin: {
      contents: `import { createCloudflareWorker } from './packages/platform-cloudflare/src/runtime/worker.ts';
        import { previewAcceptanceWorker } from './packages/platform-cloudflare/src/test-support/preview-acceptance.ts';
        import config from './lace.config.ts';
        const worker = previewAcceptanceWorker(createCloudflareWorker({ config }));
        export default { fetch(request, env, ctx) {
          // Miniflare rewrites Host to its local listener. Restore the edge host.
          const headers = new Headers(request.headers);
          headers.set('host', new URL(request.url).host);
          return worker.fetch(new Request(request, { headers }), env, ctx);
        } };`,
      resolveDir: new URL("../../../../", import.meta.url).pathname,
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    conditions: ["@lacecms/source", "workerd", "worker", "browser"],
    external: ["node:*"],
  });
  return compiled.outputFiles[0]!.text;
}

async function previewFixture(script?: string, previewAdminEnabled = false) {
  const github = fakeGitHub();
  const fixture = await createWorkerFixture(createCloudflareWorker, cleanups, {
    privatePreviewBucket: true,
    previewAdminEnabled,
    previewGitHubFetch: github.fetcher,
    env,
    ...(script && {
      localWorker: {
        script,
        bindings: { ...env, LACE_PUBLIC_BASE_URL: `${origin}/`, LACE_AUTH_SECRET: secret },
      },
    }),
  });
  const signedIn = object(await fixture.signIn());
  const actor = testActor("admin", string(signedIn.id));
  const fetch = (request: Request) => fixture.worker.fetch(request, fixture.env, fixture.ctx);
  const form = new FormData();
  const original = await sharp({ create: { width: 3, height: 2, channels: 3, background: "blue" } })
    .png()
    .toBuffer();
  form.append("file", new Blob([original], { type: "image/png" }), "only-draft.png");
  const uploaded = await fixture.call("/api/v1/admin/media", { method: "POST", body: form });
  expect(uploaded.response.status).toBe(201);
  const media = string(object(uploaded.body).id);
  const created = await fixture.call("/api/v1/admin/models/posts/entries", {
    method: "POST",
    json: {
      blocks: [
        { key: "original", type: "image", schemaVersion: 4, position: 1000, data: { media } },
      ],
      fields: { publishedAt: "2026-11-18" },
      slug: "private",
      title: "Saved private post",
    },
  });
  expect(created.response.status, JSON.stringify(created.body)).toBe(201);
  const entry = contentEntryId(string(object(created.body).id));
  const start = (idempotencyKey = "one") =>
    fixture.runtime.createPreview!(actor, {
      entryId: entry,
      expectedRevision: 1,
      idempotencyKey,
    });
  const api = (id: string, operation: string, body?: unknown, token = bootstrap, target = origin) =>
    fetch(
      new Request(`${target}/api/v1/preview-runner/${id}/${operation}`, {
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        ...(body !== undefined && { method: "POST", body: JSON.stringify(body) }),
      }),
    );
  const claim = (id: string, runId = "123", sha = commit) =>
    api(id, "claim", { runId, commit: sha });
  const status = () =>
    fixture.runtime.repository.preview.currentPreview(entry, unixMilliseconds(fixture.now()));
  return { ...fixture, github, fetch, original, media, entry, start, api, claim, status };
}

test("one exact GitHub run claims frozen local D1/R2 input and puts output behind preview sessions", async () => {
  const fixture = await previewFixture(await bundlePreviewWorker());
  const { fetch, github, media } = fixture;
  const admitted = await fixture.start();
  expect(admitted.kind).toBe("admitted");
  if (admitted.kind !== "admitted") throw new Error("Expected admission");
  const { id } = admitted.generation;
  expect(await fixture.status()).toMatchObject({ id, state: "dispatched" });
  expect((await fixture.start()).kind).toBe("replayed");
  const claimUrl = `${origin}/api/v1/preview-runner/${id}/claim`;
  const request = new Request(claimUrl, {
    method: "POST",
    headers: { authorization: `Bearer ${bootstrap}`, "content-type": "application/json" },
    body: JSON.stringify({ runId: "123", commit }),
  });
  expect(
    (
      await fixture.worker.fetch(
        request,
        { ...fixture.env, LACE_PREVIEW_SITE_PATH: "different-site" },
        fixture.ctx,
      )
    ).status,
  ).toBe(409);
  const partial = { ...fixture.env, LACE_PREVIEW_RUNNER_SECRET: undefined };
  expect(fixture.worker.runtime(partial).createPreview).toBeUndefined();
  expect(
    (
      await fixture.worker.fetch(
        new Request(`${draftPreviewOrigin}/api/auth/get-session`),
        partial,
        fixture.ctx,
      )
    ).status,
  ).toBe(404);
  expect(
    (await fixture.worker.fetch(new Request(`${origin}/health/ready`), partial, fixture.ctx))
      .status,
  ).toBe(200);
  expect((await fixture.claim(id, "456")).status).toBe(409);
  expect((await fixture.claim(id, "123", "d".repeat(40))).status).toBe(409);
  github.setSha("d".repeat(40));
  expect((await fixture.claim(id)).status).toBe(409);
  github.setSha(commit);
  github.setAttempt(2);
  expect((await fixture.claim(id)).status).toBe(409);
  github.setAttempt(1);
  github.setStatus("in_progress");
  const claims = await Promise.all([fixture.claim(id), fixture.claim(id)]);
  expect(claims.map((response) => response.status).sort()).toEqual([200, 409]);
  const { token, sitePath } = await claims.find((response) => response.ok)!.json();
  expect(sitePath).toBe("site");
  expect(token).not.toContain(bootstrap);
  expect(await fixture.status()).toMatchObject({ state: "running" });
  expect((await fixture.api(id, "input", undefined, token, draftPreviewOrigin)).status).toBe(404);
  expect((await fixture.api(id, "input", undefined, bootstrap)).status).toBe(401);
  expect((await fixture.api("another", "input", undefined, token)).status).toBe(409);
  expect(await (await fixture.api(id, "input", undefined, token)).json()).toMatchObject({
    generationId: id,
    target: { title: "Saved private post", path: "/blog/private" },
  });
  const privateInput = await fixture.api(id, `input?mediaId=${media}`, undefined, token);
  expect(privateInput.status).toBe(200);
  expect(Buffer.from(await privateInput.arrayBuffer())).toEqual(fixture.original);
  expect((await fetch(new Request(`${origin}/api/v1/public/media/${media}`))).status).toBe(404);
  const publicVersion = async () =>
    (await fixture.runtime.repository.preview.previewCaptureFence()).publicVersion;
  const version = await publicVersion();
  expect(fixture.triggers).toEqual([]);
  const bytes = new TextEncoder().encode("<main>Saved private post</main>");
  const file = {
    path: "blog/private/index.html",
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    contentType: "text/html; charset=utf-8",
  };
  const manifest = { schemaVersion: 1, html: file.path, files: [file] };
  const sendManifest = (value: unknown) =>
    fixture.api(id, "artifacts/manifest", { manifest: value, mediaIds: [media] }, token);
  expect(
    (await sendManifest({ ...manifest, files: [{ ...file, bytes: 32 * 1024 * 1024 + 1 }] })).status,
  ).toBe(409);
  expect((await sendManifest("x".repeat(2 * 1024 * 1024))).status).toBe(400);
  const prepared = await sendManifest(manifest);
  expect(prepared.status).toBe(200);
  const seal = await prepared.json();
  const complete = () => fixture.api(id, "complete", { outcome: "ready", manifest: seal }, token);
  expect((await complete()).status).toBe(409);
  const put = (size = bytes.length) =>
    fixture.local.dispatchFetch(
      `${origin}/api/v1/preview-runner/${id}/artifacts/files/${file.path}`,
      {
        method: "PUT",
        body: bytes,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/octet-stream",
          "content-length": String(size),
          "x-lace-sha256": file.sha256,
        },
      },
    );
  const huge = new Request(`${origin}/api/v1/preview-runner/${id}/artifacts/files/${file.path}`, {
    method: "PUT",
    body: bytes,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/octet-stream",
      "content-length": String(32 * 1024 * 1024 + 1),
      "x-lace-sha256": file.sha256,
    },
  });
  expect((await fetch(huge)).status).toBe(400);
  expect((await put()).status).toBe(204);
  expect(
    await fixture.local.previewBucket.head(`preview/${id}/output/files/${file.sha256}`),
  ).not.toBeNull();
  expect(await fixture.local.bucket.head(`preview/${id}/output/files/${file.sha256}`)).toBeNull();
  expect((await complete()).status).toBe(204);
  const ready = await fixture.status();
  expect(ready).toMatchObject({ id, state: "ready" });
  expect(JSON.stringify(ready)).not.toMatch(/token|commit|runId|providerToken|bootstrap/u);
  fixture.advance(5000);
  expect((await complete()).status).toBe(204);
  expect(await fixture.status()).toEqual(ready);
  expect((await put()).status).toBe(409);
  expect((await fetch(new Request(`${draftPreviewOrigin}/p/${id}/${file.path}`))).status).toBe(401);
  const cookie = await openPreviewSession(fetch, fixture.cookie!, id);
  const artifact = await fetch(
    new Request(`${draftPreviewOrigin}/p/${id}/${file.path}`, { headers: { cookie } }),
  );
  expect(artifact.headers.get("cache-control")).toBe("private, no-store");
  expect(await artifact.text()).toBe("<main>Saved private post</main>");
  expect(
    (
      await fetch(
        new Request(`${draftPreviewOrigin}/p/missing/${file.path}`, { headers: { cookie } }),
      )
    ).status,
  ).toBe(404);
  expect(await publicVersion()).toBe(version);
  expect(fixture.triggers).toEqual([]);
});

test("the scheduled pass fences a late runner and retains capacity until GitHub confirms cancellation", async () => {
  const fixture = await previewFixture();
  const { github, worker, env: bindings, ctx } = fixture;
  const sweep = () => worker.scheduled({ cron: "*/2 * * * *" }, bindings, ctx);
  const calls = (suffix: string) =>
    github.fetcher.mock.calls.filter(([url]) => String(url).endsWith(suffix));
  const admitted = await fixture.start();
  if (admitted.kind !== "admitted") throw new Error("Expected admission");
  const { id } = admitted.generation;
  fixture.advance(8 * 60_000);
  await sweep();
  expect((await fixture.status())?.state).toBe("dispatched");
  github.setStatus("in_progress");
  const claimed = await fixture.claim(id);
  expect(claimed.status).toBe(200);
  const { deadline, token } = await claimed.json();
  expect(deadline).toBe(admitted.generation.overallDeadline);
  expect((await fixture.start("different-key")).kind).toBe("rejected");
  fixture.advance(7 * 60_000 + 1);
  github.revoke(true);
  await sweep();
  expect(await fixture.status()).toMatchObject({ reason: "PREVIEW_TIMED_OUT", state: "timed_out" });
  expect(await fixture.runtime.repository.preview.previewExecutorToStop()).toMatchObject({
    id,
    run: "123",
  });
  expect((await fixture.api(id, "input", undefined, token)).status).toBe(409);
  const finish = () =>
    fixture.api(
      id,
      "complete",
      { outcome: "ready", manifest: { sha256: "1".repeat(64), bytes: 1 } },
      token,
    );
  expect((await finish()).status).toBe(409);
  expect((await finish()).status).toBe(409);
  github.revoke(false);
  await sweep();
  expect(calls("/runs/123/cancel")).toHaveLength(1);
  expect((await fixture.start("different-key")).kind).toBe("rejected");
  github.setStatus("completed");
  fixture.advance(11_000);
  await sweep();
  expect(await fixture.runtime.repository.preview.previewExecutorToStop()).toBeNull();
  expect(await fixture.local.previewBucket.head(`preview/${id}/input/manifest.json`)).toBeNull();
  expect(calls("/dispatches")).toHaveLength(1);
  expect(fixture.triggers).toHaveLength(0);
});

test("a completed provider run with a missing callback fails closed and never redispatches", async () => {
  const fixture = await previewFixture();
  const admitted = await fixture.start();
  if (admitted.kind !== "admitted") throw new Error("Expected admission");
  fixture.github.setStatus("in_progress");
  const claimed = await fixture.claim(admitted.generation.id);
  expect(claimed.status).toBe(200);
  const { token } = await claimed.json();
  fixture.github.setStatus("completed");
  await fixture.worker.scheduled({ cron: "*/2 * * * *" }, fixture.env, fixture.ctx);
  expect(await fixture.status()).toMatchObject({
    state: "failed",
    reason: "PREVIEW_PROVIDER_UNAVAILABLE",
  });
  expect((await fixture.api(admitted.generation.id, "input", undefined, token)).status).toBe(409);
  expect(await fixture.runtime.repository.preview.previewExecutorToStop()).toBeNull();
  expect(
    fixture.github.fetcher.mock.calls.filter(([url]) => String(url).endsWith("/dispatches")),
  ).toHaveLength(1);
  expect(fixture.triggers).toHaveLength(0);
});

test("the disposable acceptance entry requires an enabled CMS host and same-origin admin session", async () => {
  const fixture = await previewFixture();
  const worker = previewAcceptanceWorker(fixture.worker);
  const enabled = { ...fixture.env, LACE_PV1E_ACCEPTANCE: "true" };
  const path = `/__lace-pv1e/entries/${fixture.entry}`;
  const post = (host = origin, from = origin, cookie = fixture.cookie, body?: string) =>
    new Request(`${host}${path}/1/acceptance`, {
      method: "POST",
      headers: { origin: from, ...(cookie && { cookie }) },
      ...(body === undefined ? {} : { body }),
    });
  expect((await worker.fetch(post(), fixture.env, fixture.ctx)).status).toBe(404);
  expect((await worker.fetch(post(draftPreviewOrigin), enabled, fixture.ctx)).status).toBe(404);
  expect(
    (await worker.fetch(post(origin, "https://other.example"), enabled, fixture.ctx)).status,
  ).toBe(403);
  expect((await worker.fetch(post(origin, origin, ""), enabled, fixture.ctx)).status).toBe(401);
  expect(
    (await worker.fetch(post(origin, origin, fixture.cookie, "{}"), enabled, fixture.ctx)).status,
  ).toBe(404);
  const accepted = await worker.fetch(
    post(origin, origin, fixture.cookie, ""),
    enabled,
    fixture.ctx,
  );
  expect(accepted.status).toBe(202);
  expect(accepted.headers.get("cache-control")).toBe("no-store");
  const receipt = await accepted.json();
  expect(receipt).toEqual({ id: expect.any(String), commit, overallDeadline: expect.any(Number) });
  const replay = await worker.fetch(post(), enabled, fixture.ctx);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toEqual(receipt);
  const status = await worker.fetch(
    new Request(`${origin}${path}`, { headers: { cookie: fixture.cookie! } }),
    enabled,
    fixture.ctx,
  );
  expect(await status.json()).toMatchObject({
    publicVersion: expect.any(Number),
    preview: { id: receipt.id, state: "dispatched" },
  });
  await fixture.local.database.prepare("update user set role = 'viewer'").run();
  expect((await worker.fetch(post(), enabled, fixture.ctx)).status).toBe(403);
  expect(
    fixture.github.fetcher.mock.calls.filter(([url]) => String(url).endsWith("/dispatches")),
  ).toHaveLength(1);
});

test("the activated admin API validates the saved revision before dispatch and replays acceptance", async () => {
  const fixture = await previewFixture(undefined, true);
  const config = await fixture.call("/api/v1/admin/preview/config");
  expect(config.body).toEqual({ ready: true, origin: draftPreviewOrigin, viewMode: "new-tab" });
  const target = (id = fixture.entry) => `/api/v1/admin/entries/${id}/preview`;
  const create = (key: string, revision = 1, id = fixture.entry) =>
    fixture.call(target(id), {
      method: "POST",
      headers: { origin },
      json: { expectedRevision: revision, idempotencyKey: key },
    });
  const incomplete = async (slug: string, fields: object) => {
    const saved = await fixture.call("/api/v1/admin/models/posts/entries", {
      method: "POST",
      json: {
        blocks: [{ key: "image", data: {}, position: 1000, schemaVersion: 4, type: "image" }],
        fields,
        slug,
        title: "Incomplete draft",
      },
    });
    expect(saved.response.status).toBe(201);
    return contentEntryId(string(object(saved.body).id));
  };
  const missingField = await incomplete("missing-field", {});
  const missingBlockField = await incomplete("missing-block-field", { publishedAt: "2026-11-18" });
  await fixture.local.database.prepare("update user set role = 'viewer'").run();
  expect((await fixture.call(target())).body).toBeNull();
  expect((await create("viewer")).response.status).toBe(403);
  await fixture.local.database.prepare("update user set role = 'editor'").run();
  const stale = await create("stale", 2);
  expect(stale.response.status).toBe(409);
  expect(stale.body).toMatchObject({ error: { code: "PREVIEW_REVISION_CONFLICT" } });
  for (const [id, path] of [
    [missingField, "/fields/publishedAt"],
    [missingBlockField, "/blocks/0/data/media"],
  ] as const) {
    const invalid = await create(id, 1, id);
    expect(invalid.response.status).toBe(422);
    expect(invalid.body).toMatchObject({
      error: { details: { issues: expect.arrayContaining([expect.objectContaining({ path })]) } },
    });
  }
  const missing = await create("missing", 1, contentEntryId("unknown-entry"));
  expect(missing.response.status).toBe(409);
  expect(missing.body).toMatchObject({ error: { code: "PREVIEW_INELIGIBLE" } });
  expect(fixture.github.fetcher).not.toHaveBeenCalled();
  const foreign = await fixture.call(target(), {
    method: "POST",
    headers: { origin: "https://foreign.test" },
    json: { expectedRevision: 1, idempotencyKey: "foreign" },
  });
  expect(foreign.response.status).toBe(403);
  const accepted = await create("first");
  expect(accepted.response.status).toBe(202);
  expect(accepted.body).toEqual({ id: expect.any(String), revision: 1 });
  const replay = await create("first");
  expect(replay.response.status).toBe(200);
  expect(replay.body).toEqual(accepted.body);
  const busy = await create("second");
  expect(busy.response.status).toBe(409);
  expect(busy.body).toMatchObject({ error: { code: "PREVIEW_BUSY" } });
  expect((await fixture.call(target())).body).toMatchObject({
    ...object(accepted.body),
    state: "dispatched",
  });
  expect(
    fixture.github.fetcher.mock.calls.filter(([url]) => String(url).endsWith("/dispatches")),
  ).toHaveLength(1);
  expect(fixture.triggers).toEqual([]);
});

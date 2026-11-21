import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, expect, test } from "vitest";
import { openPreviewSession, readCompleteBuildExport } from "../packages/test-utils/dist/index.js";
import {
  adminOrigin,
  authSecret,
  bootstrapSecret,
  exec,
  listen,
  openNode,
  openWorker,
  outputTree,
  previewOrigin,
  siteUrl,
} from "./support/packed-preview-platforms.mjs";
import { runLocalPreviewWorkflow } from "./support/packed-preview-runner.mjs";
import { sharp } from "./support/preview-astro-fixture.mjs";

const project = process.env.LACE_VERIFY_PACKED_ROOT;
const measurements = process.env.LACE_TEST_PREVIEW_MEASUREMENTS;
let commit;
beforeAll(async () => {
  if (!project || !measurements || !process.env.LACE_TEST_PREVIEW_BUILDER_IMAGE)
    throw new Error(
      "Run pnpm acceptance:draft-preview to generate and install the packed consumer",
    );
  const git = (...args) => exec("git", args, { cwd: project });
  await git("init", "--quiet");
  await git("add", "--all");
  if ((await git("status", "--porcelain")).stdout.trim())
    await git(
      "-c",
      "user.name=Lace",
      "-c",
      "user.email=lace@example.test",
      "commit",
      "-qm",
      "Packed preview consumer",
    );
  commit = (await git("rev-parse", "HEAD")).stdout.trim();
});

async function json(response, status) {
  const body = await response.text();
  expect(response.status, body.slice(0, 700)).toBe(status);
  return JSON.parse(body);
}

function calls(platform) {
  const call = (path, { method = "GET", data, cookie, headers, body } = {}) => {
    const fields = new Headers(headers);
    if (cookie) fields.set("cookie", cookie);
    if (method !== "GET") fields.set("origin", adminOrigin);
    if (data !== undefined) fields.set("content-type", "application/json");
    const init = { method, headers: fields };
    if (method !== "GET" && method !== "HEAD")
      init.body = data === undefined ? body : JSON.stringify(data);
    return platform.fetch(new Request(adminOrigin + path, init));
  };
  const email = "preview-admin@lace.test";
  const password = "local-packed-preview-password";
  const signIn = async () => {
    const response = await call("/api/auth/sign-in/email", {
      method: "POST",
      data: { email, password },
    });
    await json(response, 200);
    return response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
  };
  return {
    call,
    signIn,
    setup: async () =>
      json(
        await call("/api/v1/setup/admin", {
          method: "POST",
          data: { email, password, token: await platform.setupToken() },
        }),
        201,
      ),
  };
}

function observeRunner(cleanups) {
  const observations = { claims: 0, complete: [], inputs: new Map(), packages: new Map() };
  const claims = new Map();
  const completions = new Map();
  let barrier;
  let failUpload = false;
  return {
    ...observations,
    get claims() {
      return observations.claims;
    },
    block(suffix) {
      const entered = Promise.withResolvers();
      const released = Promise.withResolvers();
      barrier = { suffix, entered, released };
      cleanups.push(released.resolve);
      return {
        entered: () =>
          Promise.race([
            entered.promise,
            new Promise((_, reject) => {
              const signal = AbortSignal.timeout(45000);
              signal.addEventListener(
                "abort",
                () => reject(new Error("Runner did not reach " + suffix)),
                { once: true },
              );
            }),
          ]),
        release: released.resolve,
      };
    },
    failUploadOnce() {
      failUpload = true;
    },
    replayCompletion(id) {
      return completions.get(id)();
    },
    replayClaim(id) {
      return claims.get(id)();
    },
    measure: undefined,
    async intercept(request, fetcher) {
      const { pathname } = new URL(request.url);
      if (!pathname.includes("/preview-runner/")) return fetcher(request);
      if (barrier && pathname.endsWith(barrier.suffix)) {
        const current = barrier;
        barrier = undefined;
        current.entered.resolve();
        await current.released.promise;
      }
      if (failUpload && request.method === "PUT" && pathname.includes("/artifacts/files/")) {
        failUpload = false;
        await request.arrayBuffer();
        return new Response(null, { status: 503 });
      }
      const [id, ...segments] = pathname.split("/preview-runner/")[1].split("/");
      const operation = segments.join("/");
      const manifest =
        operation === "artifacts/manifest" ? (await request.clone().json()).manifest : undefined;
      const replayable = operation === "claim" || operation === "complete";
      const body = replayable ? await request.arrayBuffer() : undefined;
      const send = () =>
        fetcher(
          new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body,
          }),
        );
      const response = await (replayable ? send() : fetcher(request));
      const label = operation.startsWith("artifacts/files/") ? "upload file" : operation;
      this.measure?.(
        label === "input" && new URL(request.url).search ? "input media" : label,
        response,
      );
      if (operation === "claim" && response.ok) {
        observations.claims++;
        claims.set(id, send);
      }
      if (operation === "input" && !new URL(request.url).search && response.ok) {
        const { target, revision } = await response.clone().json();
        observations.inputs.set(id, { title: target.title, revision });
      }
      if (manifest && response.ok) {
        observations.packages.set(id, {
          files: manifest.files.length,
          bytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0),
          manifestBytes: Buffer.byteLength(JSON.stringify(manifest)),
        });
      }
      if (operation === "complete") {
        observations.complete.push(response.status);
        if (response.ok) completions.set(id, send);
      }
      return response;
    },
  };
}

function measurePreviewRequests(kind, platform, runner) {
  const upstream = platform.fetch;
  const routes = {};
  const record = (name, response) => {
    const counts = (routes[name] ??= { requests: 0 });
    counts.requests++;
    if (kind === "worker") {
      const value = response.headers.get("x-fixture-d1-counts");
      expect(value, name).toBeTruthy();
      const { queries, rowsRead, rowsWritten, maxParameters } = JSON.parse(value);
      expect(queries, name).toBeLessThanOrEqual(50);
      expect(maxParameters, name).toBeLessThanOrEqual(100);
      for (const [key, amount] of Object.entries({ queries, rowsRead, rowsWritten, maxParameters }))
        counts[key] = Math.max(counts[key] ?? 0, amount);
    }
  };
  runner.measure = record;
  platform.fetch = async (request) => {
    const { pathname } = new URL(request.url);
    if (kind === "worker") request.headers.set("x-fixture-measure-d1", "1");
    const response = await upstream(request);
    if (!pathname.includes("/preview-runner/")) {
      const name = pathname
        .replace(/\/entries\/[^/]+\/preview$/u, "/entries/:id/preview")
        .replace(/^\/view\/[^/]+$/u, "/view/:id")
        .replace(/^\/p\/[^/]+\/(.*)$/u, (_, path) => (path ? "/p/:id/resource" : "/p/:id/"));
      record(`${request.method} ${name}`, response);
    }
    return response;
  };
  return () => {
    runner.measure = undefined;
    platform.fetch = upstream;
    return routes;
  };
}

async function seedLegacyPublication(platform, actor) {
  await platform.sync();
  await platform.sql(
    "insert into content_entries (id, model_key, created_by, created_at, updated_at) values ('legacy-post', 'posts', ?, 1, 1)",
    actor,
  );
  await platform.sql(
    `insert into content_snapshots (id, entry_id, revision, slug, title, fields_json, schema_version, updated_by, created_at, updated_at)
     values ('legacy-public', 'legacy-post', 1, 'published', 'Public baseline', '{}', 1, ?, 1, 1),
            ('legacy-draft', 'legacy-post', 2, 'published', 'Saved legacy draft', '{}', 1, ?, 2, 2)`,
    actor,
    actor,
  );
  await platform.sql(
    "update content_entries set draft_snapshot_id = 'legacy-draft', published_snapshot_id = 'legacy-public' where id = 'legacy-post'",
  );
  await platform.sql(
    "insert into published_routes (path, entry_id, snapshot_id, updated_at) values ('/blog/published', 'legacy-post', 'legacy-public', 1)",
  );
  await platform.sql(
    "insert into published_state (singleton_key, version, updated_at) values (1, 1, 1) on conflict(singleton_key) do update set version = 1, updated_at = 1",
  );
}

async function publicBuilder(platform, scratch, cleanups, token) {
  const edge = createServer(async (request, response) => {
    try {
      const upstream = await platform.fetch(
        new Request(adminOrigin + request.url, {
          method: request.method,
          headers: { authorization: request.headers.authorization ?? "" },
        }),
      );
      response.writeHead(upstream.status, Object.fromEntries(upstream.headers));
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      response.writeHead(502).end();
    }
  });
  const base = `http://127.0.0.1:${await listen(edge, cleanups)}/`;
  return async (label) => {
    const directory = join(scratch, label);
    await exec("pnpm", ["exec", "astro", "build", "--outDir", directory], {
      cwd: join(project, "site"),
      env: {
        PATH: process.env.PATH,
        HOME: scratch,
        ASTRO_TELEMETRY_DISABLED: "1",
        LACE_API_BASE_URL: base,
        LACE_PUBLIC_BASE_URL: adminOrigin + "/",
        LACE_BUILD_TOKEN: token,
        LACE_BUILD_SITE_URL: siteUrl,
      },
    });
    return { directory, tree: await outputTree(directory) };
  };
}

async function journey(kind, platform, scratch, cleanups, runner) {
  const { call, setup, signIn } = calls(platform);
  expect(await platform.sql("select name from sqlite_master where name like 'preview_%'")).toEqual(
    [],
  );
  const { id: administrator } = await setup();
  await seedLegacyPublication(platform, administrator);
  let cookie = await signIn();
  const legacyState = () =>
    Promise.all(
      ["content_entries", "content_snapshots", "published_routes", "published_state"].map((table) =>
        platform.sql(`select * from ${table} order by 1`),
      ),
    );
  const beforeUpgrade = await legacyState();
  await platform.upgrade();
  expect(await legacyState()).toEqual(beforeUpgrade);
  expect(await platform.sql("select id from preview_generations")).toEqual([]);
  expect((await call("/health/ready")).status).toBe(200);
  const cms = (path, options) => call("/api/v1/admin" + path, { cookie, ...options });
  const unavailable = async (entry) => {
    expect(await json(await cms("/preview/config"), 200)).toEqual({
      ready: false,
      missing: ["preview-disabled"],
    });
    expect((await json(await request(entry, "configuration-disabled"), 503)).error.code).toBe(
      "PREVIEW_CONFIGURATION_UNAVAILABLE",
    );
  };
  const baseline = await json(await cms("/entries/legacy-post"), 200);
  expect(baseline).toMatchObject({
    draft: { title: "Saved legacy draft", revision: 2 },
    published: { title: "Public baseline", revision: 1 },
  });
  const { token } = await json(
    await cms("/api-tokens", { method: "POST", data: { name: "Public build" } }),
    201,
  );
  if (kind === "node") await platform.start(token);
  const build = await publicBuilder(platform, scratch, cleanups, token);
  const create = async (slug, title, blocks = []) =>
    json(
      await cms("/models/posts/entries", {
        method: "POST",
        data: { slug, title, fields: {}, blocks },
      }),
      201,
    );
  const entryPath = (entry) => `/entries/${entry.id}`;
  const save = async (entry, { title, slug, blocks = [] }) =>
    json(
      await cms(entryPath(entry) + "/draft", {
        method: "PUT",
        data: { title, slug, fields: {}, blocks, expectedRevision: entry.draft.revision },
      }),
      200,
    );
  const publish = async (entry, operation = "publish") =>
    json(
      await cms(entryPath(entry) + "/" + operation, {
        method: "POST",
        data:
          operation === "unpublish"
            ? { expectedPublishedSnapshotId: entry.published.id }
            : { expectedRevision: entry.draft.revision },
        headers: { "idempotency-key": `${operation}-${entry.id}` },
      }),
      200,
    );
  const status = async (entry) => json(await cms(entryPath(entry) + "/preview"), 200);
  const request = (entry, idempotencyKey) =>
    cms(entryPath(entry) + "/preview", {
      method: "POST",
      data: { expectedRevision: entry.draft.revision, idempotencyKey },
    });
  const accepted = (entry, key) => request(entry, key).then((response) => json(response, 202));
  const waitState = (entry, value) =>
    expect
      .poll(() => status(entry), {
        timeout: 90000,
        interval: 250,
      })
      .toMatchObject(value);
  const job = (id) =>
    kind === "worker"
      ? runLocalPreviewWorkflow({
          project,
          scratch,
          platform,
          id,
          intercept: runner.intercept.bind(runner),
        })
      : Promise.resolve();
  const start = async (entry, key) => {
    const { id } = await accepted(entry, key);
    const running = job(id);
    // Attach immediately, since the race scenarios deliberately await another operation first.
    running.catch(() => undefined);
    return { id, running };
  };
  const access = (id, parent = cookie) => openPreviewSession(platform.fetch, parent, id);
  const resource = (id, session, path = "", headers = {}) =>
    platform.fetch(
      new Request(`${previewOrigin}/p/${id}/${path}`, {
        headers: { ...(session && { cookie: session }), ...headers },
      }),
    );
  const denied = async (id, session, path = "", statusCode = 404) => {
    const response = await resource(id, session, path, {
      range: "bytes=0-1",
      "if-none-match": "*",
    });
    expect(response.status).toBe(statusCode);
    expect(await response.text()).toBe("");
  };
  const exportPublic = () =>
    readCompleteBuildExport(
      (url, init) => platform.fetch(new Request(url, init)),
      adminOrigin,
      token,
    );

  await unavailable(baseline);
  expect((await exportPublic()).export.entries).toMatchObject([
    { path: "/blog/published", title: "Public baseline" },
  ]);
  // Publish a control page; keep a different draft out of the entire public snapshot.
  const homes = await json(await cms("/models/home/entries"), 200);
  const home = await json(await cms(`/entries/${homes.items[0].id}`), 200);
  await publish(home);
  const neighbor = await create("other", "Other draft must stay private");
  const image = await sharp({ create: { width: 64, height: 48, channels: 3, background: "blue" } })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append("file", new Blob([image], { type: "image/png" }), "draft.png");
  const media = await json(await cms("/media", { method: "POST", body: form }), 201);
  const blocks = [
    {
      key: "photo",
      type: "image",
      schemaVersion: 4,
      position: 1000,
      data: { media: media.id },
      settings: { lightbox: true },
    },
  ];
  const original = await create("private-first", "First saved private revision", blocks);
  const publicBefore = await exportPublic();
  expect(publicBefore.export.entries.map(({ path }) => path)).toEqual(["/", "/blog/published"]);
  expect(Object.keys(publicBefore.export.media)).toEqual([]);
  const publicDisk = await build("public-before");
  const release =
    kind === "node" ? await platform.buildPublic(publicBefore.export.version) : undefined;
  const publicCounts = () =>
    platform.sql(
      "select (select count(*) from site_builds) as builds, (select count(*) from outbox_events) as events",
    );
  const counts = await publicCounts();
  const publications = platform.publications;
  expect(await platform.sql("select id from preview_generations")).toEqual([]);
  if (kind === "node") {
    await platform.stop();
    await platform.start(token, true);
  }
  await platform.configurePreview(true);
  expect(await json(await cms("/preview/config"), 200)).toMatchObject({
    ready: true,
    origin: previewOrigin,
  });

  // Freeze the first revision, reject a different entry while busy, and fail a real upload.
  runner.failUploadOnce();
  const input = runner.block("/input");
  const failed = await start(original, "first-preview");
  await input.entered();
  const [duplicate, busy] = await Promise.all([
    request(original, "first-preview"),
    request(baseline, "busy-preview"),
  ]);
  expect((await json(duplicate, 200)).id).toBe(failed.id);
  expect((await json(busy, 409)).error.code).toBe("PREVIEW_BUSY");
  const edited = await save(original, {
    title: "New saved private revision",
    slug: "private-new",
    blocks,
  });
  input.release();
  await failed.running;
  await waitState(edited, {
    id: failed.id,
    revision: original.draft.revision,
    state: "failed",
    reason: "PREVIEW_STORAGE_FAILED",
  });
  expect(runner.claims).toBe(1);
  expect(runner.inputs.get(failed.id)).toEqual({
    title: "First saved private revision",
    revision: original.draft.revision,
  });
  await platform.reconcile();

  const finishMeasurements = measurePreviewRequests(kind, platform, runner);
  const retry = await start(edited, "manual-retry");
  await retry.running;
  await waitState(edited, { id: retry.id, revision: edited.draft.revision, state: "ready" });
  expect(retry.id).not.toBe(failed.id);
  expect(runner.claims).toBe(2);
  const captured = await status(edited);
  const [identity] = await platform.sql(
    "select source_commit, created_at, started_at, ready_at, input_bytes, output_bytes from preview_generations where id = ?",
    retry.id,
  );
  expect(identity.source_commit).toBe(commit);
  const session = await access(retry.id);
  const viewer = await platform.fetch(
    new Request(`${previewOrigin}/view/${retry.id}`, {
      headers: { cookie: session },
    }),
  );
  expect(viewer.status).toBe(200);
  await viewer.text();
  const page = await resource(retry.id, session);
  expect(page.status).toBe(200);
  expect(page.headers.get("cache-control")).toBe("private, no-store");
  const html = await page.text();
  expect(html).toContain("New saved private revision");
  for (const excluded of [
    "First saved private revision",
    "Other draft must stay private",
    token,
    authSecret,
    bootstrapSecret,
  ])
    expect(html).not.toContain(excluded);
  expect(html).toMatch(/href="https:\/\/published\.example\/journal\/"[^>]*target="_blank"/u);
  const asset = html.match(new RegExp(`/p/${retry.id}/(_astro/[^" ,]+\\.webp)`, "u"))?.[1];
  expect(asset).toBeTruthy();
  const variant = await resource(retry.id, session, asset);
  expect(variant.status).toBe(200);
  expect(variant.headers.get("content-type")).toBe("image/webp");
  expect((await variant.arrayBuffer()).byteLength).toBeGreaterThan(0);
  const privateOriginal = `_lace_preview_media/${media.id}.png`;
  const originalBytes = await resource(retry.id, session, privateOriginal);
  expect(originalBytes.status).toBe(200);
  expect(Buffer.from(await originalBytes.arrayBuffer())).toEqual(image);
  const requests = finishMeasurements();
  const pkg = runner.packages.get(retry.id);
  expect(pkg.files).toBe(requests["upload file"].requests);
  expect(pkg.manifestBytes).toBe(identity.output_bytes);
  await writeFile(
    join(measurements, `${kind}.json`),
    JSON.stringify({
      kind,
      admissionToReadyMs: identity.ready_at - identity.created_at,
      claimToReadyMs: identity.ready_at - identity.started_at,
      inputManifestBytes: identity.input_bytes,
      package: pkg,
      requests,
    }),
  );

  const replay = await runner.replayCompletion(retry.id);
  expect(replay.status).toBe(204);
  expect(await status(edited)).toEqual(captured);
  await denied(retry.id, undefined, "", 401);
  await denied(retry.id, session, "blog/published/index.html");
  await denied(retry.id, undefined, privateOriginal, 401);
  const mediaUrl = new URL(`/api/v1/public/media/${media.id}`, adminOrigin);
  expect(await platform.fetch(new Request(mediaUrl))).toMatchObject({ status: 404 });

  expect(await exportPublic()).toEqual(publicBefore);
  expect(await publicCounts()).toEqual(counts);
  expect(platform.publications).toBe(publications);
  if (release) expect(await platform.release()).toEqual(release);
  const after = await build("public-after");
  expect(after.tree).toEqual(publicDisk.tree);
  expect(await readFile(join(after.directory, "blog/published/index.html"), "utf8")).toContain(
    "Public baseline",
  );

  const withoutMedia = await save(edited, { title: "Saved without image", slug: "private-new" });
  expect(await status(withoutMedia)).toMatchObject({
    id: retry.id,
    revision: edited.draft.revision,
    state: "ready",
  });
  const stillReady = await resource(retry.id, session, privateOriginal);
  expect(stillReady.status).toBe(200);
  await stillReady.body.cancel();
  const deletion = await cms(`/media/${media.id}`, { method: "DELETE" });
  expect(deletion.status, await deletion.text()).toBe(202);
  await denied(retry.id, session, privateOriginal);

  // Let upload finish, publish while the completion request is still in transit.
  const completion = runner.block("/complete");
  const late = await start(withoutMedia, "late-completion");
  await completion.entered();
  const responsesBefore = runner.complete.length;
  await publish(withoutMedia);
  completion.release();
  await late.running;
  await expect.poll(() => runner.complete.length).toBeGreaterThan(responsesBefore);
  expect(runner.complete[responsesBefore]).not.toBe(204);
  await denied(late.id, session);
  await platform.advance(60001);
  await platform.reconcile();
  expect(await platform.sql("select state from preview_generations where id = ?", late.id)).toEqual(
    [{ state: "invalidated" }],
  );
  expect(await platform.sql("select * from preview_execution_slot")).toEqual([]);

  // Preview a newer draft over the now-published version, then withdraw publication.
  const newest = await save(withoutMedia, {
    title: "Preview over publication",
    slug: "private-new",
  });
  const expiring = await start(newest, "expiry");
  await expiring.running;
  await waitState(newest, { id: expiring.id, revision: newest.draft.revision, state: "ready" });
  const ready = await status(newest);
  expect(Date.parse(ready.expiresAt) - Date.parse(ready.readyAt)).toBe(86400000);
  await publish(newest, "unpublish");
  expect(await status(newest)).toEqual(ready);
  const secondCookie = await signIn();
  const withdrawnSession = await access(expiring.id, secondCookie);
  const withdrawn = await resource(expiring.id, withdrawnSession);
  expect(await withdrawn.text()).toContain("Preview over publication");
  const logout = await call("/api/auth/sign-out", {
    method: "POST",
    cookie: secondCookie,
    data: {},
  });
  expect(logout.status).toBe(200);
  await denied(expiring.id, withdrawnSession, "", 401);

  const rollback = await exportPublic();
  const beforeRollback =
    kind === "node" ? await platform.release() : await build("rollback-before");
  const beforeDisable = await access(expiring.id);
  const oldResource = await resource(expiring.id, beforeDisable);
  expect(await oldResource.text()).toContain("Preview over publication");
  expect(await platform.sql("select * from preview_execution_slot")).toEqual([]);
  await platform.configurePreview(false);
  if (kind === "node") {
    await platform.stop();
    await platform.start(token);
    const builderPreview = await platform.requestBuilderPreview();
    expect(builderPreview.status).toBe(404);
    await builderPreview.text();
  }
  await unavailable(newest);
  await denied(expiring.id, beforeDisable);
  expect((await runner.replayCompletion(expiring.id)).status).toBe(404);
  expect((await runner.replayClaim(expiring.id)).status).toBe(404);
  const revoked = await json(
    await cms(`/users/${administrator}/sessions/revoke`, {
      method: "POST",
      data: {},
    }),
    200,
  );
  expect(revoked.revoked).toBeGreaterThan(0);
  cookie = await signIn();
  expect(await exportPublic()).toEqual(rollback);
  const afterRollback = kind === "node" ? await platform.release() : await build("rollback-after");
  expect(afterRollback.tree).toEqual(beforeRollback.tree);
  if (kind === "node") expect(afterRollback.link).toBe(beforeRollback.link);
  expect(
    await readFile(join(afterRollback.directory, "blog/published/index.html"), "utf8"),
  ).toContain("Public baseline");

  // Reopening the fixture proves that revoked grants and bootstrap credentials stay denied.
  await platform.configurePreview(true, true);
  await denied(expiring.id, beforeDisable, "", 401);
  expect((await runner.replayClaim(expiring.id)).status).toBe(401);
  await platform.setTime(Date.parse(ready.expiresAt) - 10000);
  const nearlyExpired = await access(expiring.id);
  const beforeExpiry = await resource(expiring.id, nearlyExpired);
  expect(beforeExpiry.status).toBe(200);
  await beforeExpiry.body.cancel();
  await platform.setTime(Date.parse(ready.expiresAt));
  await denied(expiring.id, nearlyExpired);
  expect(await status(newest)).toMatchObject({ id: expiring.id, state: "expired" });
  for (const entry of [newest, baseline, neighbor]) {
    const response = await cms(entryPath(entry), {
      method: "DELETE",
      headers: { "if-match": `"${entry.draft.revision}"` },
    });
    expect(response.ok, await response.text()).toBe(true);
  }
  // The normal API only removes empty models. Restore the retained artifact
  // metadata as fixture state so this asserts the independent sync fence.
  await platform.sql(
    "update preview_generations set state = 'ready', expires_at = ? where id = ?",
    Date.now() + 2 * 86400000,
    expiring.id,
  );
  await platform.sql(
    "insert or replace into preview_current (entry_id, generation_id) values (?, ?)",
    newest.id,
    expiring.id,
  );
  const recovered = await resource(expiring.id, nearlyExpired);
  expect(recovered.status).toBe(200);
  await recovered.body.cancel();
  await platform.sync(true);
  expect(
    await platform.sql("select state from preview_generations where id = ?", expiring.id),
  ).toEqual([{ state: "invalidated" }]);
  await denied(expiring.id, nearlyExpired);
  await platform.sync();
  await denied(expiring.id, nearlyExpired);
  expect(runner.claims).toBe(4);
  if (kind === "worker") {
    expect(platform.runs.size).toBe(4);
    expect(
      platform.providerPaths.every((path) =>
        /^\/repos\/lace-fixture\/preview\/(commits|actions)\//u.test(path),
      ),
    ).toBe(true);
  }
}

test.each(["node", "worker"])(
  "packed %s consumer exercises protected preview end to end",
  async (kind) => {
    const scratch = await mkdtemp(join(tmpdir(), "lace-packed-preview-"));
    const cleanups = [() => rm(scratch, { recursive: true, force: true })];
    const runner = observeRunner(cleanups);
    let platform;
    const failures = [];
    try {
      platform = await (kind === "node" ? openNode : openWorker)({
        project,
        scratch,
        commit,
        cleanups,
        intercept: runner.intercept.bind(runner),
      });
      await journey(kind, platform, scratch, cleanups, runner);
    } catch (error) {
      if (platform?.diagnostics) console.warn(await platform.diagnostics().catch(() => ""));
      failures.push(error);
    } finally {
      for (const cleanup of cleanups.reverse()) {
        try {
          await cleanup();
        } catch (error) {
          failures.push(error);
        }
      }
    }
    if (failures.length > 1)
      throw new AggregateError(failures, "Packed preview run and cleanup failed");
    if (failures.length === 1) throw failures[0];
  },
);

import { createHash } from "node:crypto";
import { defineCollection, defineConfig, definePage } from "@lacecms/config";
import { field } from "@lacecms/content";
import { selection } from "./reference-site/definition.ts";

export const previewCommit = "a".repeat(40);
export const previewBootstrap = "b".repeat(40);
export const previewOrigin = "https://preview.lace.test";
export const previewEnvironment = {
  LACE_PREVIEW_ENABLED: "true",
  LACE_PREVIEW_ORIGIN: previewOrigin,
  LACE_PREVIEW_RUNNER_SECRET: previewBootstrap,
  LACE_BUILD_SITE_ID: "main-site",
  LACE_BUILD_SITE_LABEL: "Main site",
  LACE_BUILD_SITE_URL: "https://published.lace.test/",
};

export function referenceConfig() {
  return defineConfig({
    blocks: [selection],
    content: [
      definePage({
        key: "home",
        path: "/",
        version: 1,
        blocks: ["selection"],
        fields: {
          showReview: field.boolean(),
          hiddenReview: field.reference({ models: ["testimonials"] }),
        },
        visibility: { hiddenReview: { field: "showReview", values: [true] } },
      }),
      defineCollection({
        key: "notes",
        route: "/notes/:slug",
        version: 1,
        fields: { peer: field.reference({ models: ["notes"] }) },
      }),
      defineCollection({ key: "testimonials", version: 1 }),
      defineCollection({ key: "authors", version: 1, fields: { photo: field.media() } }),
    ],
  });
}

const entryPath = (source) => `/api/v1/admin/entries/${source.id}`;

export function referencePreviewFixture(
  {
    call,
    fetchRunner,
    runnerOrigin,
    runId,
    dispatches,
    readCompleteBuildExport,
    fetchPublic,
    publicOrigin,
    runtime,
    now,
  },
  expect,
) {
  async function request(path, init = {}, status = 200) {
    const result = await call(path, init);
    expect(result.response.status, JSON.stringify(result.body)).toBe(status);
    return result.body;
  }
  const write = (path, json, status = 200, method = "POST") =>
    request(path, { method, json }, status);
  const fixture = {
    request,
    dispatches,
    async readExport(token) {
      const result = await readCompleteBuildExport(
        (url, init) => fetchPublic(new Request(url, init)),
        publicOrigin,
        token,
        { limit: 1 },
      );
      return result.export;
    },
    publicFetch: (path) => fetchPublic(new Request(publicOrigin + path)),
    async readReady(id) {
      const object = await runtime.repository.preview.readyPreview(id, now());
      expect(object).not.toBeNull();
      const manifest = await runtime.previewPackages.manifest(id, object);
      const file = manifest.files.find(({ path }) => path === manifest.html);
      const stream = await runtime.previewPackages.read(id, file);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      return Buffer.concat(chunks).toString("utf8");
    },
    async home() {
      const { items } = await request("/api/v1/admin/models/home/entries");
      return request(entryPath(items[0]));
    },
    create: (model, title, values = {}) =>
      write(
        `/api/v1/admin/models/${model}/entries`,
        { title, fields: {}, blocks: [], ...values },
        201,
      ),
    save: async (source, expectedRevision, values) =>
      write(
        `${entryPath(source)}/draft`,
        { title: source.draft.title, fields: {}, blocks: [], ...values, expectedRevision },
        200,
        "PUT",
      ),
    publish: (source, expectedRevision) =>
      write(`${entryPath(source)}/publish`, { expectedRevision }),
    unpublish: (source, published) =>
      write(`${entryPath(source)}/unpublish`, {
        expectedPublishedSnapshotId: published.entry.published.id,
      }),
    preview: (source, expectedRevision, idempotencyKey, status = 202) =>
      write(`${entryPath(source)}/preview`, { expectedRevision, idempotencyKey }, status),
    status: (source) => request(`${entryPath(source)}/preview`),
  };
  async function runner(id, operation, { token = previewBootstrap, json, ...init } = {}) {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    if (json !== undefined) headers.set("content-type", "application/json");
    return fetchRunner(
      new Request(`${runnerOrigin}/api/v1/preview-runner/${id}/${operation}`, {
        ...init,
        headers,
        ...(json !== undefined && { method: "POST", body: JSON.stringify(json) }),
      }),
    );
  }
  async function claim(id) {
    const credential = await runner(id, "claim", {
      json: { runId: runId(id), commit: previewCommit },
    });
    expect(credential.status).toBe(200);
    const { token } = await credential.json();
    return async (operation, init) => runner(id, operation, { ...init, token });
  }
  async function finish(run, files, mediaIds = []) {
    const manifest = {
      schemaVersion: 1,
      html: files.find(({ contentType }) => contentType.startsWith("text/html")).path,
      files: files.map(({ path, body, contentType }) => ({
        path,
        contentType,
        bytes: body.byteLength,
        sha256: createHash("sha256").update(body).digest("hex"),
      })),
    };
    const prepared = await run("artifacts/manifest", { json: { manifest, mediaIds } });
    expect(prepared.status).toBe(200);
    for (const [index, { path, sha256, bytes }] of manifest.files.entries()) {
      const uploaded = await run(`artifacts/files/${path}`, {
        method: "PUT",
        body: files[index].body,
        headers: {
          "content-type": "application/octet-stream",
          "content-length": String(bytes),
          "x-lace-sha256": sha256,
        },
      });
      expect(uploaded.status).toBe(204);
    }
    expect(
      (await run("complete", { json: { outcome: "ready", manifest: await prepared.json() } }))
        .status,
    ).toBe(204);
  }
  return { ...fixture, claim, finish };
}

export const selectionBlock = (data, options = {}) => ({
  key: "selection",
  type: "selection",
  schemaVersion: 1,
  position: 2000,
  data,
  ...options,
});

export async function checkReferencePreviewAdmission(fixture, expect) {
  const { home, create, save, publish, unpublish, preview, status, claim, dispatches, finish } =
    fixture;
  const review = await create("testimonials", "Review changing publication state");
  const parked = await create("testimonials", "An unpublished hidden review");
  const page = await home();
  const service = await save(page, page.draft.revision, {
    title: "Service",
    fields: { showReview: false, hiddenReview: parked.id },
    blocks: [
      selectionBlock({ reviews: [parked.id] }, { key: "parked", hidden: true, position: 1000 }),
      selectionBlock({ reviews: [review.id] }),
    ],
  });
  const revision = service.draft.revision;
  const initial = await publish(review, 1);
  const prior = await preview(service, revision, "service-first");
  const run = await claim(prior.id);
  const input = await run("input");
  expect(input.status).toBe(200);
  const frozen = await input.json();
  expect(frozen.target.fields).toEqual({ showReview: false });
  expect(frozen.target.blocks.map(({ key }) => key)).toEqual(["selection"]);
  expect(JSON.stringify(frozen)).not.toContain(parked.id);
  const html = {
    path: "index.html",
    contentType: "text/html; charset=utf-8",
    body: Buffer.from("<main>Review</main>"),
  };
  await finish(run, [html]);
  await unpublish(review, initial);
  const blocked = await preview(service, revision, "service-blocked", 422);
  expect(blocked.error.details.issues).toMatchObject([
    { code: "reference_target_unpublished", path: "/blocks/1/data/reviews/0" },
  ]);
  expect(await status(service)).toMatchObject({ id: prior.id, state: "ready" });
  expect(dispatches()).toBe(1);
  await publish(review, 1);
  const eligible = await preview(service, revision, "service-retry");
  const eligibleRun = await claim(eligible.id);
  await finish(eligibleRun, [html]);

  const a = await create("notes", "A", { slug: "a" });
  const b = await create("notes", "B", { slug: "b" });
  await publish(b, 1);
  await save(a, 1, { slug: "a", fields: { peer: b.id } });
  await publish(a, 2);
  await save(a, 2, { slug: "a" });
  await save(b, 1, { slug: "b", fields: { peer: a.id } });
  const cycle = await preview(b, 2, "reversal-too-early", 422);
  expect(cycle.error.details.issues).toMatchObject([
    {
      code: "reference_cycle",
      path: "/fields/peer",
      details: { witness: [b.id, a.id, b.id], publishFirst: { entryId: a.id, title: "A" } },
    },
  ]);
  expect(await status(b)).toBeNull();
  expect(dispatches()).toBe(2);
  await publish(a, 3);
  await preview(b, 2, "reversal-after");
  expect(dispatches()).toBe(3);
}

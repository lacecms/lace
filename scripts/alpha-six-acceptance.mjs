import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Uses only the installed consumer SDK and actual runtime HTTP boundary. */
export async function alphaSixJourney({
  base,
  cookie,
  png,
  entryId,
  mediaId,
  buildToken,
  project,
}) {
  const invoke = async (path, { json, ...options } = {}) => {
    const response = await fetch(new URL(`api/v1/${path}`, base), {
      ...options,
      headers: {
        cookie,
        origin: new URL(base).origin,
        ...(json === undefined ? {} : { "content-type": "application/json" }),
        ...options.headers,
      },
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
      signal: AbortSignal.timeout(20_000),
    });
    return { response, body: response.status === 204 ? undefined : await response.json() };
  };
  const { createLaceClient } = await import(
    pathToFileURL(join(project, "node_modules/@lacecms/sdk/dist/index.js")).href
  );
  const client = createLaceClient({ baseUrl: base, token: buildToken });
  const first = await client.getBuildExportPage({ limit: 1 });
  assert.equal(first.changed, true);
  assert.equal(first.page.formatVersion, 1);
  assert.equal(first.page.entries.length, 1);
  assert.ok(first.page.nextCursor, "acceptance requires at least two published entries");
  const complete = await client.getBuildExport({ pageSize: 1 });
  assert.equal(complete.changed, true);
  assert.ok(complete.export.entries.length >= 2);
  assert.equal(complete.export.version, first.page.version);
  assert.deepEqual(
    complete.export.entries.map((entry) => entry.path),
    [...new Set(complete.export.entries.map((entry) => entry.path))].sort(),
  );

  // Inject only additive fields into real responses; the installed SDK must
  // strip them while retaining required-field and hidden-block safety.
  const altered = (mutate) =>
    createLaceClient({
      baseUrl: base,
      token: buildToken,
      fetch: async (url, options) => {
        const response = await fetch(url, options);
        const body = await response.json();
        mutate(body);
        return new Response(JSON.stringify(body), {
          status: response.status,
          headers: response.headers,
        });
      },
    });
  const tolerant = await altered((body) => {
    body.futureField = "ignored";
    for (const entry of body.entries) entry.futureField = "ignored";
  }).getBuildExport({ pageSize: 1 });
  assert.deepEqual(tolerant.export, complete.export);
  await assert.rejects(
    altered((body) => {
      delete body.version;
    }).getBuildExport(),
  );
  await assert.rejects(
    altered((body) => {
      body.formatVersion = 2;
    }).getBuildExport(),
  );
  assert.ok(complete.export.entries.some((entry) => entry.blocks.length > 0));
  await assert.rejects(
    altered((body) => {
      for (const entry of body.entries) {
        if (entry.blocks[0]) entry.blocks[0].hidden = false;
      }
    }).getBuildExport(),
  );

  // Published references must prevent detachment without changing any draft.
  const original = await invoke(`admin/entries/${entryId}`);
  assert.equal(original.response.status, 200);
  const refused = await invoke(`admin/media/${mediaId}?detach=drafts`, { method: "DELETE" });
  assert.equal(refused.response.status, 409);
  assert.equal(refused.body.error.code, "MEDIA_IN_USE");
  assert.deepEqual((await invoke(`admin/entries/${entryId}`)).body.draft, original.body.draft);

  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "alpha-six-draft.png");
  const uploaded = await invoke("admin/media", { method: "POST", body: form });
  assert.equal(uploaded.response.status, 201);
  const models = await invoke("admin/content-models");
  const version = models.body.items
    .find((model) => model.key === "posts")
    .blockDefinitions.find((block) => block.type === "image").version;
  const created = await invoke("admin/models/posts/entries", {
    method: "POST",
    json: {
      title: "Alpha six draft media",
      slug: "alpha-six-draft-media",
      fields: {},
      blocks: [
        {
          key: "01J000000000000000000000099",
          type: "image",
          schemaVersion: version,
          position: 1024,
          data: { media: uploaded.body.id },
        },
      ],
    },
  });
  assert.equal(created.response.status, 201);
  const detached = await invoke(`admin/media/${uploaded.body.id}?detach=drafts`, {
    method: "DELETE",
  });
  assert.equal(detached.response.status, 202);
  assert.equal(detached.body.status, "deleting");
  assert.equal(detached.body.usageCount, 0);
  const draft = (await invoke(`admin/entries/${created.body.id}`)).body.draft;
  assert.equal(draft.revision, 2);
  assert.equal(draft.blocks[0].data.media, undefined);
  assert.equal(draft.title, "Alpha six draft media");
  assert.equal((await client.getBuildExport()).export.version, first.page.version);
  const removed = await invoke(`admin/entries/${created.body.id}`, {
    method: "DELETE",
    json: { expectedRevision: draft.revision },
  });
  assert.equal(removed.response.status, 204);

  // Advance the real published state to invalidate the captured cursor.
  const current = original.body.draft;
  const saved = await invoke(`admin/entries/${entryId}/draft`, {
    method: "PUT",
    json: {
      blocks: current.blocks,
      fields: current.fields,
      seo: current.seo,
      slug: current.slug,
      expectedRevision: current.revision,
      title: `${current.title} alpha six`,
    },
  });
  assert.equal(saved.response.status, 200);
  const published = await invoke(`admin/entries/${entryId}/publish`, {
    method: "POST",
    json: { expectedRevision: saved.body.draft.revision },
  });
  assert.equal(published.response.status, 200);
  await assert.rejects(
    client.getBuildExportPage({ after: first.page.nextCursor, limit: 1 }),
    (error) => error.code === "BUILD_EXPORT_VERSION_CHANGED",
  );
  console.info(
    "Alpha.6 exact consumer: pagination, tolerant safety, stale cursor and draft-media deletion passed",
  );
}

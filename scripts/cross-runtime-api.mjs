import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import * as contracts from "../packages/contracts/dist/index.js";
import { createPublishedSiteLoader } from "../packages/sdk/dist/index.js";
import { png } from "../tests/support/cross-runtime-fixture.mjs";
const require = createRequire(new URL("../packages/contracts/package.json", import.meta.url));
const { parse } = require("valibot");
export const expected = JSON.parse(
  await readFile(new URL("../tests/fixtures/cross-runtime/expected.json", import.meta.url), "utf8"),
);

/** A projection of the published-site contract, not an arbitrary JSON scrubber. */
export function canonicalSite(site, cover) {
  return expected.models
    .flatMap((model) => site.entries(model))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(({ path, modelKey, slug, title, fields, blocks }) => ({
      path,
      modelKey,
      ...(slug === undefined ? {} : { slug }),
      title,
      fields,
      blocks: blocks.map(({ key, type, position, schemaVersion, data }) => ({
        key,
        type,
        position,
        schemaVersion,
        data:
          type === "image"
            ? { ...data, media: data.media === cover ? "<cover>" : data.media }
            : data,
      })),
    }));
}
export async function apiJourney(f) {
  const report = (name) => console.info(`34A ${f.kind} API: ${name}`);
  const json = async (path, options, status, schema) => {
    const response = await f.call(path, options);
    assert.equal(response.status, status, `${f.kind} ${path}: HTTP status`);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/u);
    const body = await response.json();
    assert.ok(schema, `${path}: missing shared response schema`);
    return parse(schema, body);
  };
  const admin = { cookie: f.cookies.admin };
  const denied = async (path, options = {}, expectation = expected.denied) => {
    const body = await json(path, options, expectation.status, contracts.errorEnvelopeSchema);
    assert.equal(body.error.code, expectation.code, `${path}: error code`);
  };
  report("authentication, roles and common model fixture");
  await denied("/api/v1/admin/content-models");
  const models = await json(
    "/api/v1/admin/content-models",
    admin,
    200,
    contracts.contentModelListSchema,
  );
  assert.deepEqual(
    models.items.map((model) => model.key),
    expected.models,
  );
  for (const role of ["editor", "viewer"]) {
    for (const path of ["/api/v1/admin/users", "/api/v1/admin/api-tokens"])
      await denied(path, { cookie: f.cookies[role] });
  }
  // The editor's allowed mutation is asserted separately; no failure is swallowed.
  const editorEntry = await json(
    "/api/v1/admin/models/notes/entries",
    {
      cookie: f.cookies.editor,
      method: "POST",
      json: { title: "UNPUBLISHED SENTINEL", fields: {}, blocks: [] },
    },
    201,
    contracts.adminContentEntrySchema,
  );
  await denied(`/api/v1/admin/entries/${editorEntry.id}/publish`, {
    cookie: f.cookies.editor,
    method: "POST",
    json: { expectedRevision: 1 },
  });
  await denied(`/api/v1/admin/entries/${editorEntry.id}/draft`, {
    cookie: f.cookies.viewer,
    method: "PUT",
    json: { expectedRevision: 1, title: "Denied", fields: {}, blocks: [] },
  });
  const deniedForm = new FormData();
  deniedForm.append("file", new Blob([png], { type: "image/png" }), "denied.png");
  await denied("/api/v1/admin/media", {
    cookie: f.cookies.viewer,
    method: "POST",
    body: deniedForm,
  });
  report("verified media, private object and reuse");
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "cover.png");
  const cover = await json(
    "/api/v1/admin/media",
    { ...admin, method: "POST", body: form },
    201,
    contracts.mediaMetadataSchema,
  );
  assert.equal(cover.width, 1);
  assert.equal(cover.height, 1);
  assert.equal(cover.mimeType, "image/png");
  assert.equal((await f.call(`/api/v1/public/media/${cover.id}`)).status, 404);
  const homes = await json(
    "/api/v1/admin/models/home/entries",
    admin,
    200,
    contracts.contentEntryListSchema,
  );
  const abouts = await json(
    "/api/v1/admin/models/about/entries",
    admin,
    200,
    contracts.contentEntryListSchema,
  );
  const home = await json(
    `/api/v1/admin/entries/${homes.items[0].id}`,
    admin,
    200,
    contracts.adminContentEntrySchema,
  );
  const blocks = [
    {
      key: "hero-one",
      type: "hero",
      schemaVersion: 1,
      position: 1000,
      data: { heading: "Published hero" },
    },
    {
      key: "image-one",
      type: "image",
      schemaVersion: 1,
      position: 2000,
      data: { media: cover.id, alt: "Published cover" },
    },
  ];
  const save = (id, draft, cookie = f.cookies.admin) =>
    json(
      `/api/v1/admin/entries/${id}/draft`,
      { cookie, method: "PUT", json: draft },
      200,
      contracts.adminContentEntrySchema,
    );
  const publish = (entry, key) =>
    json(
      `/api/v1/admin/entries/${entry.id}/publish`,
      {
        ...admin,
        method: "POST",
        headers: { "idempotency-key": key },
        json: { expectedRevision: entry.draft.revision },
      },
      200,
      contracts.publishContentEntryResultSchema,
    );
  let saved = await save(home.id, {
    expectedRevision: home.draft.revision,
    title: "Published home",
    fields: {},
    blocks,
  });
  report("publication, idempotent replay and immutable public snapshots");
  const publication = await publish(saved, "34a-home");
  assert.equal(publication.publication, "published");
  assert.equal(publication.build.status, "queued");
  const replay = await publish(saved, "34a-home");
  assert.equal(replay.publication, "replayed");
  assert.equal(replay.build.status, "not-dispatched");
  const about = await save(abouts.items[0].id, {
    expectedRevision: 1,
    title: "Published about",
    fields: {},
    blocks: [],
  });
  await publish(about, "34a-about");
  const createPost = (slug, title) =>
    json(
      "/api/v1/admin/models/posts/entries",
      {
        ...admin,
        method: "POST",
        json: { slug, title, fields: { publishedAt: "2026-10-07" }, blocks: [] },
      },
      201,
      contracts.adminContentEntrySchema,
    );
  const alpha = await createPost("alpha", "Published alpha");
  await publish(alpha, "34a-alpha");
  const beta = await createPost("beta", "Published beta");
  await publish(beta, "34a-beta");
  const duplicate = await createPost("alpha", "UNPUBLISHED ROUTE CONFLICT");
  const conflict = await json(
    `/api/v1/admin/entries/${duplicate.id}/publish`,
    { ...admin, method: "POST", json: { expectedRevision: 1 } },
    409,
    contracts.errorEnvelopeSchema,
  );
  assert.equal(conflict.error.code, "CONTENT_ROUTE_CONFLICT");
  report("cursor ordering, query binding and revision conflict");
  const first = await json(
    "/api/v1/admin/models/posts/entries?sort=title&limit=1",
    admin,
    200,
    contracts.contentEntryListSchema,
  );
  assert.equal(first.items[0].title, "Published alpha");
  assert.ok(first.nextCursor);
  const next = await json(
    `/api/v1/admin/models/posts/entries?sort=title&limit=1&after=${encodeURIComponent(first.nextCursor)}`,
    admin,
    200,
    contracts.contentEntryListSchema,
  );
  assert.equal(next.items[0].title, "Published beta");
  const invalidCursor = await json(
    `/api/v1/admin/models/posts/entries?sort=-title&after=${encodeURIComponent(first.nextCursor)}`,
    admin,
    422,
    contracts.errorEnvelopeSchema,
  );
  assert.equal(invalidCursor.error.code, "CONTENT_INVALID_STATE");
  const revision = saved.draft.revision;
  const changes = await Promise.all(
    ["DRAFT ONLY A", "DRAFT ONLY B"].map((title) =>
      f.call(`/api/v1/admin/entries/${home.id}/draft`, {
        ...admin,
        method: "PUT",
        json: { expectedRevision: revision, title, fields: {}, blocks },
      }),
    ),
  );
  assert.deepEqual(changes.map((r) => r.status).sort(), [200, 409]);
  for (const response of changes) {
    const body = await response.json();
    if (response.status === 409) {
      parse(contracts.errorEnvelopeSchema, body);
      assert.equal(body.error.code, expected.conflict.code);
    } else {
      saved = parse(contracts.adminContentEntrySchema, body);
      assert.equal(saved.draft.revision, revision + 1);
    }
  }
  const issued = await json(
    "/api/v1/admin/api-tokens",
    { ...admin, method: "POST", json: { name: "34a-build" } },
    201,
    contracts.buildTokenCreatedSchema,
  );
  const authorization = { authorization: `Bearer ${issued.token}` };
  await denied("/api/v1/admin/content-models", { headers: authorization });
  await denied("/api/v1/public/build-export");
  const exportedResponse = await f.call("/api/v1/public/build-export", { headers: authorization });
  assert.equal(exportedResponse.status, 200);
  const exported = parse(contracts.buildExportSchema, await exportedResponse.json());
  assert.equal(exported.version, 5);
  const tag = exportedResponse.headers.get("etag");
  assert.equal(tag, '"5"');
  for (const etag of [tag, `W/${tag}`]) {
    const unchanged = await f.call("/api/v1/public/build-export", {
      headers: { ...authorization, "if-none-match": etag },
    });
    assert.equal(unchanged.status, 304);
    assert.equal(unchanged.headers.get("etag"), tag);
    assert.equal(await unchanged.text(), "");
  }
  for (const path of [
    "/api/v1/public/pages/home",
    "/api/v1/public/collections/posts/alpha",
    "/api/v1/public/content/by-path?path=/",
  ]) {
    const result = await json(path, {}, 200, contracts.publicContentEntrySchema);
    assert.equal(result.entry.draft.title, result.entry.published.title);
    assert.equal(result.entry.updatedBy, undefined);
  }
  const collection = await json(
    "/api/v1/public/collections/posts",
    {},
    200,
    contracts.publicContentListSchema,
  );
  assert.equal(collection.items.length, 2);
  for (const { entry } of exported.entries) {
    assert.ok(entry.published);
    for (const key of ["title", "slug", "fields", "blocks", "revision"])
      assert.deepEqual(entry.draft[key], entry.published[key]);
  }
  assert.doesNotMatch(JSON.stringify(exported), /DRAFT ONLY|UNPUBLISHED|displayName/u);
  const binary = await f.call(`/api/v1/public/media/${cover.id}`);
  assert.equal(binary.status, 200);
  assert.match(binary.headers.get("content-type"), /image\/png/u);
  assert.deepEqual(Buffer.from(await binary.arrayBuffer()), png);
  const used = await json(
    `/api/v1/admin/media/${cover.id}`,
    admin,
    200,
    contracts.mediaDetailSchema,
  );
  assert.equal(used.usageCount, 1);
  report("safe failed build and retry receipt");
  // Exhaust the existing retry budget with controlled local time availability.
  for (let attempt = 0; attempt < 12; attempt++) await f.dispatch();
  const history = await json(
    "/api/v1/admin/site-builds",
    admin,
    200,
    contracts.siteBuildListSchema,
  );
  assert.ok(history.items.some((b) => b.status === "failed" && b.error === "build_failed"));
  const failed = history.items.find((b) => b.status === "failed");
  await json(`/api/v1/admin/site-builds/${failed.id}`, admin, 200, contracts.siteBuildRecordSchema);
  const retry = await json(
    `/api/v1/admin/builds/${failed.id}/retry`,
    { ...admin, method: "POST", json: {} },
    202,
    contracts.buildQueueReceiptSchema,
  );
  assert.equal(retry.targetVersion, 5);
  for (const role of ["editor", "viewer"])
    await denied("/api/v1/admin/builds", { cookie: f.cookies[role], method: "POST", json: {} });
  const site = await createPublishedSiteLoader({
    baseUrl: f.origin,
    token: issued.token,
    publicBaseUrl: "https://media.34a.test/",
  })();
  for (const model of expected.models)
    for (const entry of site.entries(model)) {
      assert.equal(Object.hasOwn(entry, "draft"), false);
      assert.equal(Object.hasOwn(entry, "updatedBy"), false);
    }
  const canonical = canonicalSite(site, cover.id);
  assert.deepEqual(canonical, expected.site);
  return { token: issued.token, cover: cover.id, homeId: home.id, canonical };
}

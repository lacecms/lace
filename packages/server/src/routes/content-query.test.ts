// @ts-nocheck
// TODO(rf2): Type mutable content/model fixtures, branded snapshots and invalid lifecycle request matrices.
import { expect, test } from "vitest";
import { defineCollection } from "@lacecms/config";
import { field } from "@lacecms/content";
import {
  actorId,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  unixMilliseconds,
} from "@lacecms/domain";

import { editor, fixture, json } from "../test-support/app-harness.js";

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
  expect((await json(denied.app, "/api/v1/admin/link-targets")).response.status).toBe(401);
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

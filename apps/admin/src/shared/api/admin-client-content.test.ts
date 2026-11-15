import { expect, test, vi } from "vitest";
import { AdminClientError, adminQueryKeys, createAdminClient } from "./admin-client.js";

const model = {
  blocks: [],
  fields: {},
  key: "posts",
  kind: "collection",
  route: "/posts/:slug",
  version: 1,
};

test("validates credentialed shared-contract responses and keeps cursors opaque", async () => {
  const fetcher = vi.fn(async () => Response.json({ items: [model] }));
  const client = createAdminClient(fetcher);

  await expect(client.listModels()).resolves.toEqual({
    items: [model],
    listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
  });
  expect(fetcher).toHaveBeenCalledWith("/api/v1/admin/content-models", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  expect(adminQueryKeys.entryList("posts", { q: "launch", sort: "title" })).toEqual([
    "admin",
    "entries",
    "posts",
    "list",
    {
      matchingVersion: "sqlite-like-v1",
      listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
      q: "launch",
      sort: "title",
      status: null,
    },
  ]);
  expect(adminQueryKeys.entryList("posts", { status: "draft" })).toEqual([
    "admin",
    "entries",
    "posts",
    "list",
    {
      matchingVersion: "sqlite-like-v1",
      listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
      q: null,
      sort: null,
      status: "draft",
    },
  ]);
  expect(adminQueryKeys.media).toEqual(["admin", "media"]);
  expect(adminQueryKeys.mediaList({ q: "hero", type: "image/png" })).toEqual([
    "admin",
    "media",
    "list",
    { q: "hero", sort: null, tags: null, type: "image/png" },
  ]);
  expect(adminQueryKeys.mediaList({ tags: ["travel", "cover"] })).toEqual([
    "admin",
    "media",
    "list",
    { q: null, sort: null, tags: ["cover", "travel"], type: null },
  ]);
  expect(adminQueryKeys.mediaTags("pro")).toEqual(["admin", "media", "tags", "pro"]);
  expect(adminQueryKeys.mediaTags(undefined).slice(0, 3)).toEqual(adminQueryKeys.mediaTagsPrefix);
  expect(adminQueryKeys.entryOverview("posts")).toEqual(["admin", "entries", "posts", "overview"]);
  const prefix = adminQueryKeys.modelEntries("posts");
  for (const key of [adminQueryKeys.entryList("posts", {}), adminQueryKeys.entryOverview("posts")])
    expect(key.slice(0, prefix.length)).toEqual(prefix);
});

test("lists entries with an opaque cursor and optional server-side query", async () => {
  const page = {
    items: [
      {
        draftRevision: 1,
        id: "entry-1",
        listValues: { category: "news" },
        modelKey: "posts",
        slug: "first-post",
        status: "draft",
        title: "First post",
        updatedAt: "2026-09-20T00:00:00.000Z",
        updatedBy: { displayName: "editor@lace.test", id: "editor-1" },
      },
    ],
    totals: { all: 1, changed: 0, draft: 1, published: 0 },
  };
  const fetcher = vi.fn(async () => Response.json(page));
  const client = createAdminClient(fetcher);

  await expect(client.listEntries("posts")).resolves.toEqual(page);
  expect(fetcher).toHaveBeenLastCalledWith("/api/v1/admin/models/posts/entries", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  await client.listEntries("posts", "opaque+/=", {
    q: "  launch ",
    sort: "-title",
    status: "draft",
  });
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/admin/models/posts/entries?after=opaque%2B%2F%3D&q=launch&status=draft&sort=-title",
    expect.objectContaining({ credentials: "same-origin" }),
  );
  await client.listEntries("posts", undefined, { limit: 1 });
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/admin/models/posts/entries?limit=1",
    expect.objectContaining({ credentials: "same-origin" }),
  );
  await expect(
    createAdminClient(async () => Response.json({ items: page.items })).listEntries("posts"),
  ).rejects.toBeInstanceOf(AdminClientError);
});

test("sends collection mutations with credentialed JSON requests", async () => {
  const entry = {
    draft: {
      blocks: [],
      createdAt: "2026-09-20T00:00:00.000Z",
      entryId: "entry-1",
      fields: {},
      id: "snapshot-1",
      revision: 0,
      state: "draft",
      title: "First post",
      updatedAt: "2026-09-20T00:00:00.000Z",
      updatedBy: { id: "editor-1", role: "editor" },
    },
    id: "entry-1",
    model: { key: "posts", kind: "collection", route: "/posts/:slug" },
    updatedBy: { displayName: "editor@lace.test", id: "editor-1" },
  };
  const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    Response.json(entry, { status: 201 }),
  );
  const client = createAdminClient(fetcher);

  await expect(client.createEntry("posts", "First post")).resolves.toMatchObject({ id: "entry-1" });
  expect(JSON.parse(fetcher.mock.calls[0]![1]?.body as string)).not.toHaveProperty("slug");
  await client.createEntry("posts", "First post", "first-post");
  expect(JSON.parse(fetcher.mock.calls[1]![1]?.body as string)).toMatchObject({
    slug: "first-post",
  });
  expect(fetcher).toHaveBeenCalledWith(
    "/api/v1/admin/models/posts/entries",
    expect.objectContaining({ credentials: "same-origin", method: "POST" }),
  );
});

test("loads and saves one validated complete draft with its revision", async () => {
  const entry = {
    draft: {
      blocks: [],
      createdAt: "2026-09-20T00:00:00.000Z",
      entryId: "entry-1",
      fields: { body: "Original" },
      id: "snapshot-1",
      revision: 3,
      state: "draft",
      title: "First post",
      updatedAt: "2026-09-20T00:00:00.000Z",
      updatedBy: { id: "editor-1", role: "editor" },
    },
    id: "entry-1",
    model: { key: "posts", kind: "collection", route: "/posts/:slug" },
    updatedBy: { displayName: "editor@lace.test", id: "editor-1" },
  };
  const fetcher = vi.fn(async () => Response.json(entry));
  const client = createAdminClient(fetcher);

  await expect(client.loadEntry("entry-1")).resolves.toMatchObject({ id: "entry-1" });
  await expect(
    client.saveDraft("entry-1", {
      blocks: [],
      expectedRevision: 3,
      fields: { body: "Updated" },
      slug: "first-post",
      title: "First post",
    }),
  ).resolves.toMatchObject({ draft: { revision: 3 } });
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/admin/entries/entry-1/draft",
    expect.objectContaining({ credentials: "same-origin", method: "PUT" }),
  );
});

test("publishes with one validated idempotency key and rejects malformed publish results", async () => {
  const entry = {
    draft: {
      blocks: [],
      createdAt: "2026-09-20T00:00:00.000Z",
      entryId: "entry-1",
      fields: {},
      id: "snapshot-1",
      revision: 3,
      state: "draft",
      title: "First post",
      updatedAt: "2026-09-20T00:00:00.000Z",
      updatedBy: { id: "admin-1", role: "admin" },
    },
    id: "entry-1",
    model: { key: "posts", kind: "collection", route: "/posts/:slug" },
    updatedBy: { displayName: "editor@lace.test", id: "editor-1" },
  };
  const fetcher = vi.fn(async () =>
    Response.json({
      build: { status: "queued", targetVersion: 1 },
      entry,
      publication: "published",
    }),
  );
  await expect(
    createAdminClient(fetcher).publishEntry("entry-1", {
      expectedRevision: 3,
      idempotencyKey: "publish-attempt-1",
    }),
  ).resolves.toMatchObject({ build: { status: "queued" }, publication: "published" });
  expect(fetcher).toHaveBeenCalledWith(
    "/api/v1/admin/entries/entry-1/publish",
    expect.objectContaining({
      credentials: "same-origin",
      headers: expect.objectContaining({ "idempotency-key": "publish-attempt-1" }),
      method: "POST",
    }),
  );
  await expect(
    createAdminClient(async () => Response.json({ entry })).publishEntry("entry-1", {
      expectedRevision: 3,
      idempotencyKey: "publish-attempt-1",
    }),
  ).rejects.toBeInstanceOf(AdminClientError);
});

test("sends guarded lifecycle commands and validates their results", async () => {
  const entry = {
    draft: {
      blocks: [],
      createdAt: "2026-09-20T00:00:00.000Z",
      entryId: "entry-1",
      fields: {},
      id: "snapshot-1",
      revision: 4,
      state: "draft",
      title: "First post",
      updatedAt: "2026-09-20T00:00:00.000Z",
      updatedBy: { id: "admin-1", role: "admin" },
    },
    id: "entry-1",
    model: { key: "posts", kind: "collection", route: "/posts/:slug" },
    updatedBy: { displayName: "admin@lace.test", id: "admin-1" },
  };
  const calls: { body: unknown; headers: Record<string, string>; path: string }[] = [];
  const fetcher = vi.fn(async (path: string | URL | Request, init?: RequestInit) => {
    calls.push({
      body: JSON.parse(String(init?.body)),
      headers: init?.headers as Record<string, string>,
      path: String(path),
    });
    return String(path).endsWith("/unpublish")
      ? Response.json({
          build: { status: "queued", targetVersion: 7 },
          entry,
          unpublication: "unpublished",
        })
      : Response.json(entry, { status: String(path).endsWith("/duplicate") ? 201 : 200 });
  });
  const client = createAdminClient(fetcher as typeof fetch);
  await expect(
    client.unpublishEntry("entry-1", {
      expectedPublishedSnapshotId: "published-1",
      idempotencyKey: "unpublish-attempt-1",
    }),
  ).resolves.toMatchObject({ build: { targetVersion: 7 }, unpublication: "unpublished" });
  await expect(client.revertEntry("entry-1", 4)).resolves.toMatchObject({ id: "entry-1" });
  await expect(client.duplicateEntry("entry-1", 4)).resolves.toMatchObject({ id: "entry-1" });
  expect(calls).toEqual([
    {
      body: { expectedPublishedSnapshotId: "published-1" },
      headers: expect.objectContaining({ "idempotency-key": "unpublish-attempt-1" }),
      path: "/api/v1/admin/entries/entry-1/unpublish",
    },
    {
      body: { expectedRevision: 4 },
      headers: expect.objectContaining({ "content-type": "application/json" }),
      path: "/api/v1/admin/entries/entry-1/revert",
    },
    {
      body: { expectedRevision: 4 },
      headers: expect.objectContaining({ "content-type": "application/json" }),
      path: "/api/v1/admin/entries/entry-1/duplicate",
    },
  ]);
  const malformed = createAdminClient(async () => Response.json({ entry }));
  await expect(
    malformed.unpublishEntry("entry-1", {
      expectedPublishedSnapshotId: "published-1",
      idempotencyKey: "unpublish-attempt-1",
    }),
  ).rejects.toBeInstanceOf(AdminClientError);
  await expect(malformed.revertEntry("entry-1", 4)).rejects.toBeInstanceOf(AdminClientError);
  await expect(malformed.duplicateEntry("entry-1", 4)).rejects.toBeInstanceOf(AdminClientError);
});

test("collection cache keys canonicalize filter and select order with capability identity", () => {
  const a = { field: "a", op: "eq" as const, value: false },
    z = { field: "z", op: "in" as const, values: ["b", "a"] };
  const key = adminQueryKeys.entryList("posts", { filters: [z, a], capabilities: "one" });
  expect(key).toEqual(
    adminQueryKeys.entryList("posts", {
      filters: [a, { ...z, values: ["a", "b"] }],
      capabilities: "one",
    }),
  );
  expect(key).not.toEqual(
    adminQueryKeys.entryList("posts", { filters: [a, z], capabilities: "two" }),
  );
  expect(key).not.toEqual(
    adminQueryKeys.entryList("posts", { filters: [{ ...a, value: true }, z], capabilities: "one" }),
  );
});

test("list cache identity binds runtime policy and matching version without wire overrides", () => {
  const node = adminQueryKeys.entryList("posts", {});
  const cloud = adminQueryKeys.entryList("posts", {
    listQueryLimits: { maxSearchLength: 48, maxLikePatternBytes: 50 },
  });
  expect(node).not.toEqual(cloud);
  expect(node[4].matchingVersion).toBe("sqlite-like-v1");
});

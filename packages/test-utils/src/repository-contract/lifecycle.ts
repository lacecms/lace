import { publicationIdempotencyKey, publicationRequestFingerprint } from "@lacecms/application";

import { readAllBuildContentPages } from "../build-export.js";

import {
  actorId,
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";
import type { Actor } from "@lacecms/domain";

import {
  type ContractRepository,
  type ContractSql,
  type RepositoryContractCase,
  UNPUBLICATION_CHECKPOINTS,
  REVERT_CHECKPOINTS,
  editor,
  admin,
  resolveRoute,
  noModels,
  sequence,
  base64Url,
  count,
  seedModels,
  seedMedia,
  seedUser,
  entry,
  heroBlock,
  heroEntry,
  references,
  save,
  publish,
  registerContract,
} from "./shared.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);
const LIFECYCLE_TABLES = [
  "content_entries",
  "content_snapshots",
  "content_blocks",
  "content_media_references",
  "published_routes",
  "published_state",
  "outbox_events",
  "idempotency_records",
] as const;

export async function lifecycleState(sql: ContractSql) {
  const state: Record<string, readonly unknown[]> = {};
  for (const table of LIFECYCLE_TABLES) {
    state[table] = await sql.all(`select * from ${table} order by 1, 2`);
  }
  return state;
}

export function unpublishCommand(entryIdValue: string, expected: string, at: number) {
  return {
    entryId: contentEntryId(entryIdValue),
    expectedPublishedSnapshotId: contentSnapshotId(expected),
    unpublishedAt: unixMilliseconds(at),
    unpublishedBy: admin,
  };
}

export function revertCommand(
  entryIdValue: string,
  expectedRevision: number,
  published: string,
  at = 20,
) {
  return {
    entryId: contentEntryId(entryIdValue),
    expectedPublishedSnapshotId: contentSnapshotId(published),
    expectedRevision,
    revertedAt: unixMilliseconds(at),
    revertedBy: editor,
  };
}

export function changedPost(id: string, at: number, expectedRevision = 1) {
  return save(id, expectedRevision, at, {
    blocks: [heroBlock("changed-block", "media-2", "Changed", "hero", 2000)],
    fields: { image: "media-2", title: "Changed" },
    mediaReferences: [
      { fieldPath: "image", mediaId: mediaId("media-2"), sourceKey: "$fields" },
      { fieldPath: "image", mediaId: mediaId("media-2"), sourceKey: blockKey("changed-block") },
    ],
    slug: "changed",
    title: "Changed",
  });
}

export async function seedPublishedLifecycle(repository: ContractRepository, sql: ContractSql) {
  await seedModels(sql, "home", "posts");
  await seedMedia(sql, "media-1");
  await seedMedia(sql, "media-2");
  for (const [id, model] of [
    ["home", "home"],
    ["post", "posts"],
  ] as const) {
    await repository.create({
      entry: heroEntry(id, model, 1),
      mediaReferences: references(`${id}-block`),
    });
    await repository.publish(publish(id, 1, 2, `${id}-published`));
  }
}

contract("unpublishes a publication and keeps the draft", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
  await seedPublishedLifecycle(repository, sql);
  await repository.saveCompleteDraft(changedPost("post", 3));
  const version = await repository.publishedContentVersion();
  const before = await lifecycleState(sql);
  await expect(repository.unpublish(unpublishCommand("post", "stale", 4))).rejects.toMatchObject({
    code: "CONTENT_REVISION_CONFLICT",
  });
  expect(await lifecycleState(sql)).toEqual(before);

  const draft = (await repository.load({ entryId: contentEntryId("post") }))!.draft;
  const result = await repository.unpublish(unpublishCommand("post", "post-published", 5));
  expect(result).toMatchObject({
    outcome: "unpublished",
    status: "unpublished",
    targetVersion: version + 1,
  });
  expect(result.entry.published).toBeUndefined();
  expect(result.entry.draft).toEqual(draft);
  const loaded = (await repository.load({ entryId: contentEntryId("post") }))!;
  expect(loaded.published).toBeUndefined();
  expect(loaded.draft).toEqual(draft);
  expect(await repository.loadPublic("/blog/post")).toBeNull();
  expect((await readAllBuildContentPages(repository)).entries.map((value) => value.path)).toEqual([
    "/",
  ]);
  expect(await repository.publishedContentVersion()).toBe(version + 1);
  for (const table of ["content_blocks", "content_media_references"]) {
    expect(
      await count(
        sql,
        `select count(*) as count from ${table} where snapshot_id = ?`,
        "post-published",
      ),
    ).toBe(0);
  }
  expect(
    await count(sql, "select count(*) as count from content_snapshots where id = 'post-published'"),
  ).toBe(0);
  const pending = await sql.all<{ payload_json: string }>(
    "select payload_json from outbox_events where type = 'site.build.requested' and processed_at is null",
  );
  expect(pending).toHaveLength(1);
  expect(JSON.parse(pending[0]!.payload_json)).toMatchObject({ targetVersion: version + 1 });
  const listed = await repository.list({
    limit: 10,
    listFields: [],
    modelKey: contentModelKey("posts"),
    sort: "-updatedAt",
  });
  expect(listed.items[0]).toMatchObject({ id: "post", status: "draft" });
  expect(listed.items[0]).not.toHaveProperty("publishedSnapshotId");

  const afterFirst = await lifecycleState(sql);
  await expect(
    repository.unpublish(unpublishCommand("post", "post-published", 6)),
  ).rejects.toMatchObject({ code: "CONTENT_NOT_PUBLISHED" });
  expect(await lifecycleState(sql)).toEqual(afterFirst);

  await repository.unpublish(unpublishCommand("home", "home-published", 7));
  expect(await repository.loadPublic("/")).toBeNull();
  expect(await repository.load({ entryId: contentEntryId("home") })).not.toBeNull();
  expect(await repository.publishedContentVersion()).toBe(version + 2);

  await repository.publish(publish("post", 2, 8, "post-republished"));
  expect(await repository.loadPublic("/blog/changed")).toMatchObject({
    entry: { published: { id: "post-republished", title: "Changed" } },
  });
});

contract(
  "replays an idempotent unpublication from a second repository",
  async (runtime, expect) => {
    const harness = await runtime.open({ resolveModel: resolveRoute });
    const { repository, sql } = harness;
    await seedPublishedLifecycle(repository, sql);
    const idempotency = {
      actorId: admin.id,
      fingerprint: publicationRequestFingerprint("unpublish-fingerprint"),
      key: publicationIdempotencyKey("unpublish-key"),
    };
    const command = { ...unpublishCommand("post", "post-published", 5), idempotency };
    const first = await repository.unpublish(command);
    expect(first.outcome).toBe("unpublished");
    const committed = await lifecycleState(sql);
    const replay = await harness.reopen().unpublish(command);
    expect(replay).toEqual({ entry: first.entry, outcome: "replayed", status: "unpublished" });
    expect(await lifecycleState(sql)).toEqual(committed);
    await expect(
      repository.unpublish({
        ...command,
        idempotency: { ...idempotency, fingerprint: publicationRequestFingerprint("other") },
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await sql.get("select scope, key from idempotency_records")).toEqual({
      key: "unpublish-key",
      scope: "unpublication:post:admin",
    });
  },
);

contract("rolls back unpublication at every injected checkpoint", async (runtime, expect) => {
  for (const checkpoint of UNPUBLICATION_CHECKPOINTS) {
    let armed = false;
    const { repository, sql } = await runtime.open({
      beforeMutation: (name) => {
        if (armed && name === checkpoint) throw new Error(`injected ${checkpoint}`);
      },
      resolveModel: resolveRoute,
    });
    await seedPublishedLifecycle(repository, sql);
    const before = await lifecycleState(sql);
    armed = true;
    await expect(
      repository.unpublish(unpublishCommand("post", "post-published", 5)),
      checkpoint,
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await lifecycleState(sql), checkpoint).toEqual(before);
  }
});

contract("reverts a changed draft to its publication", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
  await seedPublishedLifecycle(repository, sql);
  await repository.saveCompleteDraft(changedPost("post", 3));
  const before = await lifecycleState(sql);
  for (const command of [
    revertCommand("post", 1, "post-published"),
    revertCommand("post", 2, "other-published"),
  ]) {
    await expect(repository.revertDraft(command)).rejects.toMatchObject({
      code: "CONTENT_REVISION_CONFLICT",
    });
    expect(await lifecycleState(sql)).toEqual(before);
  }

  const published = (await repository.load({ entryId: contentEntryId("post") }))!.published!;
  const result = await repository.revertDraft(revertCommand("post", 2, "post-published"));
  expect(result.status).toBe("reverted");
  expect(result.entry!.draft).toMatchObject({
    blocks: published.blocks,
    fields: published.fields,
    id: "post-draft",
    revision: 3,
    slug: "post",
    title: published.title,
    updatedAt: 20,
    updatedBy: { id: "editor" },
  });
  expect(result.entry!.published).toEqual({ ...published, revision: 3 });
  const referenceRows = (snapshotId: string) =>
    sql.all(
      "select source_key, field_path, media_id from content_media_references where snapshot_id = ? order by source_key, field_path",
      snapshotId,
    );
  expect(await referenceRows("post-draft")).toEqual(await referenceRows("post-published"));
  for (const table of ["published_routes", "published_state", "outbox_events"]) {
    expect(await sql.all(`select * from ${table} order by 1`)).toEqual(before[table]);
  }
  const listed = await repository.list({
    limit: 10,
    listFields: [],
    modelKey: contentModelKey("posts"),
    sort: "-updatedAt",
  });
  expect(listed.items[0]).toMatchObject({ id: "post", status: "published" });

  await repository.publish(publish("post", 3, 21, "post-published-2"));
  const republished = await lifecycleState(sql);
  await expect(
    repository.revertDraft(revertCommand("post", 3, "post-published")),
  ).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
  expect(await lifecycleState(sql)).toEqual(republished);
  await repository.unpublish(unpublishCommand("home", "home-published", 22));
  const unpublished = await lifecycleState(sql);
  await expect(
    repository.revertDraft(revertCommand("home", 1, "home-published")),
  ).rejects.toMatchObject({ code: "CONTENT_NOT_PUBLISHED" });
  expect(await lifecycleState(sql)).toEqual(unpublished);
});

contract("rolls back a draft revert at every injected checkpoint", async (runtime, expect) => {
  for (const checkpoint of REVERT_CHECKPOINTS) {
    let armed = false;
    const { repository, sql } = await runtime.open({
      beforeMutation: (name) => {
        if (armed && name === checkpoint) throw new Error(`injected ${checkpoint}`);
      },
      resolveModel: resolveRoute,
    });
    await seedPublishedLifecycle(repository, sql);
    await repository.saveCompleteDraft(changedPost("post", 3));
    const before = await lifecycleState(sql);
    armed = true;
    await expect(
      repository.revertDraft(revertCommand("post", 2, "post-published")),
      checkpoint,
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await lifecycleState(sql), checkpoint).toEqual(before);
  }
});

contract("creates a duplicate only while the source revision matches", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
  await seedModels(sql, "posts");
  await seedMedia(sql, "media-1");
  await seedMedia(sql, "media-2");
  await repository.create({
    entry: heroEntry("post", "posts", 1),
    mediaReferences: references("post-block"),
  });
  await repository.saveCompleteDraft(changedPost("post", 2));
  const copy = entry("copy", "posts", {
    blocks: [heroBlock("copy-block", "media-1", "Copy")],
    fields: { image: "media-1", title: "Copy" },
    title: "post (copy)",
    updatedAt: 5,
  });
  const before = await lifecycleState(sql);
  await expect(
    repository.create({
      duplicateOf: { entryId: contentEntryId("post"), expectedRevision: 1 },
      entry: copy,
      mediaReferences: references("copy-block"),
    }),
  ).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
  expect(await lifecycleState(sql)).toEqual(before);
  await expect(
    repository.create({
      duplicateOf: { entryId: contentEntryId("missing"), expectedRevision: 1 },
      entry: copy,
      mediaReferences: references("copy-block"),
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  expect(await lifecycleState(sql)).toEqual(before);

  const created = await repository.create({
    duplicateOf: { entryId: contentEntryId("post"), expectedRevision: 2 },
    entry: copy,
    mediaReferences: references("copy-block"),
  });
  expect(created).toMatchObject({ entry: { draft: { revision: 1, title: "post (copy)" } } });
  expect(created.entry!.draft).not.toHaveProperty("slug");
  expect(
    await count(
      sql,
      "select count(*) as count from content_media_references where snapshot_id = ?",
      "copy-draft",
    ),
  ).toBe(2);
  expect((await repository.load({ entryId: contentEntryId("post") }))!.draft.revision).toBe(2);
});

contract("guards deletions by draft revision and publication identity", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
  await seedModels(sql, "posts");
  const post = entry("guarded-post", "posts", { slug: "guarded-post", updatedAt: 20 });
  await repository.create({ entry: post, mediaReferences: [] });
  const remove = (expectedRevision: number, at: number, expectedPublishedSnapshotId?: string) =>
    repository.delete({
      deletedAt: unixMilliseconds(at),
      deletedBy: editor,
      entryId: post.id,
      ...(expectedPublishedSnapshotId === undefined
        ? {}
        : { expectedPublishedSnapshotId: contentSnapshotId(expectedPublishedSnapshotId) }),
      expectedRevision,
    });
  await expect(remove(0, 21)).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
  expect(await repository.load({ entryId: post.id })).not.toBeNull();

  await repository.publish(publish("guarded-post", 1, 22, "guarded-post-published"));
  const version = (await readAllBuildContentPages(repository)).version;
  await expect(remove(1, 23)).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
  await expect(remove(2, 23, "guarded-post-published")).rejects.toMatchObject({
    code: "CONTENT_REVISION_CONFLICT",
  });
  expect((await readAllBuildContentPages(repository)).version).toBe(version);
  expect(await repository.loadPublic("/blog/guarded-post")).not.toBeNull();

  await expect(remove(1, 24, "guarded-post-published")).resolves.toEqual({ status: "deleted" });
  expect(await repository.load({ entryId: post.id })).toBeNull();
  expect(await repository.loadPublic("/blog/guarded-post")).toBeNull();
  expect(await repository.publishedContentVersion()).toBe(version + 1);
  for (const table of ["content_snapshots", "published_routes"]) {
    expect(await count(sql, `select count(*) as count from ${table}`)).toBe(0);
  }
  expect(
    JSON.parse(
      (await sql.get<{ payload_json: string }>("select payload_json from outbox_events"))!
        .payload_json,
    ),
  ).toMatchObject({ publishedSnapshotId: "guarded-post-published", targetVersion: version + 1 });
  await expect(remove(1, 25)).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });

  await repository.create({
    entry: entry("draft-only", "posts", { updatedAt: 30 }),
    mediaReferences: [],
  });
  await repository.delete({
    deletedAt: unixMilliseconds(31),
    deletedBy: editor,
    entryId: contentEntryId("draft-only"),
    expectedRevision: 1,
  });
  expect(await repository.publishedContentVersion()).toBe(version + 1);
});

contract(
  "lists entries with derived status, totals, search, sorts, and bound cursors",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    await seedUser(sql, "editor", "editor@example.test", "editor@example.test");
    const gone: Actor = { id: actorId("gone"), role: "editor" };
    const entries = [
      entry("e-zebra", "posts", {
        fields: { body: { type: "doc" }, category: "news" },
        slug: "zebra",
        title: "Zebra draft",
        updatedAt: 10,
      }),
      entry("e-apple", "posts", {
        fields: { rank: 2 },
        slug: "apple-launch",
        title: "apple launch",
        updatedAt: 11,
      }),
      entry("e-banana", "posts", {
        fields: { category: "design" },
        slug: "banana",
        title: "Banana Launch",
        updatedAt: 12,
        updatedBy: gone,
      }),
      entry("e-same-a", "posts", { slug: "same-a", title: "Same", updatedAt: 13 }),
      entry("e-same-b", "posts", { slug: "same-b", title: "same", updatedAt: 13 }),
      entry("e-literal", "posts", {
        slug: "literal",
        title: "100% _off_ 'deal'",
        updatedAt: 14,
        updatedBy: { id: actorId("system:content-sync"), role: "admin" },
      }),
    ];
    for (const value of entries) await repository.create({ entry: value, mediaReferences: [] });
    for (const [id, at] of [
      ["e-apple", 20],
      ["e-banana", 21],
    ] as const) {
      await repository.publish(publish(id, 1, at, `${id}-published`));
    }
    const base = {
      limit: 100,
      listFields: ["category", "rank", "body", "missing"],
      modelKey: contentModelKey("posts"),
      sort: "-updatedAt" as const,
    };
    expect((await repository.list(base)).totals).toEqual({
      all: 6,
      changed: 0,
      draft: 4,
      published: 2,
    });
    await repository.saveCompleteDraft(
      save("e-banana", 1, 30, {
        fields: { category: "design" },
        slug: "banana",
        title: "Banana Launch",
        updatedBy: gone,
      }),
    );
    const all = await repository.list(base);
    expect(all.totals).toEqual({ all: 6, changed: 1, draft: 4, published: 1 });
    const byId = new Map(all.items.map((item) => [String(item.id), item]));
    expect(byId.get("e-zebra")).toEqual({
      draftRevision: 1,
      id: "e-zebra",
      listValues: { category: "news" },
      modelKey: "posts",
      slug: "zebra",
      status: "draft",
      title: "Zebra draft",
      updatedAt: 10,
      updatedBy: { displayName: "editor@example.test", id: "editor" },
    });
    expect(byId.get("e-apple")).toMatchObject({
      listValues: { rank: 2 },
      publishedAt: 20,
      publishedSnapshotId: "e-apple-published",
      status: "published",
    });
    expect(byId.get("e-banana")).toMatchObject({
      publishedAt: 21,
      status: "changed",
      updatedBy: { displayName: "Unknown user", id: "gone" },
    });
    expect(byId.get("e-literal")!.updatedBy.displayName).toBe("System");

    const ids = async (input: Record<string, unknown>) =>
      (await repository.list({ ...base, ...input } as never)).items.map((item) => item.id);
    const search = await repository.list({ ...base, q: "launch", sort: "title" });
    expect(search.items.map((item) => item.id)).toEqual(["e-apple", "e-banana"]);
    expect(search.totals).toEqual({ all: 2, changed: 1, draft: 0, published: 1 });
    const filtered = await repository.list({ ...base, q: "launch", status: "changed" });
    expect(filtered.items.map((item) => item.id)).toEqual(["e-banana"]);
    expect(filtered.totals).toEqual(search.totals);
    expect(await ids({ q: "apple-l" })).toEqual(["e-apple"]);
    for (const [q, expected] of [
      ["%", ["e-literal"]],
      ["_off_", ["e-literal"]],
      ["'deal'", ["e-literal"]],
      ["o_f", []],
    ] as const) {
      expect(await ids({ q })).toEqual(expected);
    }

    const pageThrough = async (sort: string) => {
      const result: string[] = [];
      let after: string | undefined;
      do {
        const page = await repository.list({
          ...base,
          limit: 1,
          sort: sort as never,
          ...(after === undefined ? {} : { after: after as never }),
        });
        result.push(...page.items.map((item) => String(item.id)));
        after = page.nextCursor;
      } while (after !== undefined);
      return result;
    };
    // Publication advances the entry update time; never-published entries sort earliest.
    const expectedOrders = {
      "-publishedAt": ["e-banana", "e-apple", "e-zebra", "e-same-b", "e-same-a", "e-literal"],
      "-title": ["e-zebra", "e-same-b", "e-same-a", "e-banana", "e-apple", "e-literal"],
      "-updatedAt": ["e-banana", "e-apple", "e-literal", "e-same-b", "e-same-a", "e-zebra"],
      publishedAt: ["e-literal", "e-same-a", "e-same-b", "e-zebra", "e-apple", "e-banana"],
      title: ["e-literal", "e-apple", "e-banana", "e-same-a", "e-same-b", "e-zebra"],
      updatedAt: ["e-zebra", "e-same-a", "e-same-b", "e-literal", "e-apple", "e-banana"],
    };
    for (const [sort, expected] of Object.entries(expectedOrders)) {
      expect(await pageThrough(sort)).toEqual(expected);
      expect(await ids({ sort })).toEqual(expected);
    }

    const titlePage = await repository.list({ ...base, limit: 1, sort: "title" });
    for (const mismatch of [
      { sort: "-updatedAt" },
      { q: "launch", sort: "title" },
      { sort: "title", status: "draft" },
      { modelKey: contentModelKey("home"), sort: "title" },
    ]) {
      await expect(
        repository.list({ ...base, after: titlePage.nextCursor!, limit: 1, ...mismatch } as never),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    }
    const actualTitleCursor = JSON.parse(
      atob(titlePage.nextCursor!.replace(/-/gu, "+").replace(/_/gu, "/")),
    ) as { kind: string; version: number };
    const forged = (value: unknown) =>
      base64Url({
        id: "e-apple",
        kind: actualTitleCursor.kind,
        value,
        version: 2,
      });
    await expect(
      repository.list({ ...base, after: forged(5) as never, sort: "title" }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await ids({ after: forged("apple launch"), sort: "title" })).toEqual([
      "e-banana",
      "e-same-a",
      "e-same-b",
      "e-zebra",
    ]);
    await expect(
      repository.list({
        ...base,
        after: base64Url({ id: "e-apple", kind: "admin", timestamp: 1, version: 1 }) as never,
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    await expect(repository.list({ ...base, limit: 101 })).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });

    await expect(
      repository.describeActors([
        actorId("editor"),
        actorId("system:content-sync"),
        actorId("gone"),
      ]),
    ).resolves.toEqual([
      { displayName: "editor@example.test", id: "editor" },
      { displayName: "System", id: "system:content-sync" },
      { displayName: "Unknown user", id: "gone" },
    ]);
    const many = Array.from({ length: 150 }, (_, index) => actorId(`actor-${index}`));
    expect((await repository.describeActors(many)).at(-1)).toEqual({
      displayName: "Unknown user",
      id: "actor-149",
    });
  },
);

contract(
  "lists media with search, type filter, sorts, bound cursors, and usage",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({
      nextId: sequence("outbox"),
      resolveModel: resolveRoute,
    });
    await seedModels(sql, "posts");
    await seedUser(sql, "editor", "Ada", "ada@example.test");
    for (const [id, filename, mimeType, size, createdAt, createdBy] of [
      ["m-a", "Cover.png", "image/png", 30, 10, "editor"],
      ["m-b", "cover-2.jpg", "image/jpeg", 10, 11, "gone"],
      ["m-c", "100% _off_ 'deal'.webp", "image/webp", 20, 12, "system:content-sync"],
      ["m-d", "banner.png", "image/png", 20, 12, "editor"],
      ["m-e", "cover.png", "image/png", 30, 10, "editor"],
    ] as const) {
      await repository.createMedia({
        createdAt: unixMilliseconds(createdAt),
        createdBy: actorId(createdBy),
        filename,
        height: 2,
        id: mediaId(id),
        mimeType,
        size,
        storageKey: `media/${id}`,
        width: 3,
      });
    }
    await expect(
      repository.createMedia({
        createdAt: unixMilliseconds(1),
        createdBy: actorId("editor"),
        filename: "dup.png",
        height: 1,
        id: mediaId("m-dup"),
        mimeType: "image/png",
        size: 1,
        storageKey: "media/m-a",
        width: 1,
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    const base = { limit: 100, sort: "-createdAt" as const };
    const ids = async (input: Record<string, unknown>) =>
      (await repository.listMedia({ ...base, ...input } as never)).items.map(
        (item) => item.media.id,
      );
    const all = await repository.listMedia(base);
    const byId = new Map(all.items.map((item) => [String(item.media.id), item]));
    expect(byId.get("m-a")).toEqual({
      createdBy: { displayName: "Ada", id: "editor" },
      media: expect.objectContaining({ filename: "Cover.png", height: 2, width: 3 }),
      usageCount: 0,
    });
    expect(byId.get("m-b")!.createdBy).toEqual({ displayName: "Unknown user", id: "gone" });
    expect(byId.get("m-c")!.createdBy.displayName).toBe("System");
    expect(await ids({ q: "cover" })).toEqual(["m-b", "m-e", "m-a"]);
    expect(await ids({ q: "COVER", type: "image/png" })).toEqual(["m-e", "m-a"]);
    for (const [q, expected] of [
      ["%", ["m-c"]],
      ["_off_", ["m-c"]],
      ["'deal'", ["m-c"]],
      ["o_f", []],
    ] as const) {
      expect(await ids({ q })).toEqual(expected);
    }
    await expect(
      repository.listMedia({ ...base, type: "image/svg+xml" as never }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });

    const pageThrough = async (sort: string) => {
      const result: string[] = [];
      let after: string | undefined;
      do {
        const page = await repository.listMedia({
          limit: 1,
          sort: sort as never,
          ...(after === undefined ? {} : { after: after as never }),
        });
        result.push(...page.items.map((item) => String(item.media.id)));
        after = page.nextCursor;
      } while (after !== undefined);
      return result;
    };
    const expectedOrders = {
      "-createdAt": ["m-d", "m-c", "m-b", "m-e", "m-a"],
      "-filename": ["m-e", "m-a", "m-b", "m-d", "m-c"],
      "-size": ["m-e", "m-a", "m-d", "m-c", "m-b"],
      createdAt: ["m-a", "m-e", "m-b", "m-c", "m-d"],
      filename: ["m-c", "m-d", "m-b", "m-a", "m-e"],
      size: ["m-b", "m-c", "m-d", "m-a", "m-e"],
    };
    for (const [sort, expected] of Object.entries(expectedOrders)) {
      expect(await pageThrough(sort)).toEqual(expected);
      expect(await ids({ sort })).toEqual(expected);
    }
    const filenamePage = await repository.listMedia({ limit: 1, sort: "filename" });
    for (const mismatch of [
      { sort: "-createdAt" },
      { sort: "filename", type: "image/png" },
      { q: "cover", sort: "filename" },
    ]) {
      await expect(
        repository.listMedia({ after: filenamePage.nextCursor!, limit: 1, ...mismatch } as never),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    }
    const forged = (fields: Record<string, unknown>) =>
      base64Url({
        id: "m-a",
        kind: JSON.stringify(["media", "filename", null, null, []]),
        value: "cover.png",
        version: 2,
        ...fields,
      });
    for (const after of [
      forged({ value: 10 }),
      forged({ version: 1 }),
      base64Url({ id: "m-a", kind: "media", timestamp: 10, version: 1 }),
      "not a cursor",
    ]) {
      await expect(
        repository.listMedia({ after: after as never, limit: 1, sort: "filename" }),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    }
    await expect(
      repository.listMedia({ after: forged({}) as never, limit: 1, sort: "filename" }),
    ).resolves.toMatchObject({ items: [{ media: { id: "m-e" } }] });

    const mediaBlock = (key: string, type: string, position: number, image: string) => ({
      data: { image },
      hidden: false,
      key: blockKey(key),
      position,
      schemaVersion: 1,
      settings: {},
      type,
    });
    const published = entry("e-one", "posts", {
      blocks: [
        mediaBlock("hero-1", "hero", 1000, "m-a"),
        mediaBlock("gallery-1", "gallery", 2000, "m-a"),
      ],
      fields: { cover: "m-a" },
      slug: "e-one",
      title: "Title e-one",
      updatedAt: 20,
    });
    await repository.create({
      entry: published,
      mediaReferences: [
        { fieldPath: "cover", mediaId: mediaId("m-a"), sourceKey: "$fields" },
        { fieldPath: "image", mediaId: mediaId("m-a"), sourceKey: blockKey("hero-1") },
        { fieldPath: "image", mediaId: mediaId("m-a"), sourceKey: blockKey("gallery-1") },
      ],
    });
    await repository.publish(publish("e-one", 1, 30, "e-one-published"));
    await repository.saveCompleteDraft(
      save("e-one", 1, 40, {
        blocks: [mediaBlock("gallery-1", "carousel", 1000, "m-a")],
        fields: { cover: "m-d" },
        mediaReferences: [
          { fieldPath: "cover", mediaId: mediaId("m-d"), sourceKey: "$fields" },
          { fieldPath: "image", mediaId: mediaId("m-a"), sourceKey: blockKey("gallery-1") },
        ],
        slug: "e-one",
        title: "Title e-one",
      }),
    );
    await repository.create({
      entry: entry("e-two", "posts", {
        fields: { cover: "m-a" },
        slug: "e-two",
        title: "Title e-two",
        updatedAt: 50,
      }),
      mediaReferences: [{ fieldPath: "cover", mediaId: mediaId("m-a"), sourceKey: "$fields" }],
    });
    expect((await repository.loadMediaCatalogItem("m-a"))!.usageCount).toBe(2);
    expect((await repository.loadMediaCatalogItem("m-d"))!.usageCount).toBe(1);
    expect((await repository.loadMediaCatalogItem("m-b"))!.usageCount).toBe(0);
    await expect(repository.loadMediaCatalogItem("missing")).resolves.toBeNull();
    expect(
      new Map((await repository.listMedia(base)).items.map((i) => [i.media.id, i.usageCount])),
    ).toEqual(
      new Map([
        ["m-a", 2],
        ["m-b", 0],
        ["m-c", 0],
        ["m-d", 1],
        ["m-e", 0],
      ]),
    );
    expect(await repository.loadMediaUsage({ limit: 50, mediaId: mediaId("m-a") })).toEqual([
      {
        entryId: "e-two",
        locations: [{ field: "cover", source: "field", states: ["draft"] }],
        modelKey: "posts",
        slug: "e-two",
        status: "draft",
        title: "Title e-two",
      },
      {
        entryId: "e-one",
        locations: [
          { field: "cover", source: "field", states: ["published"] },
          {
            blockKey: "gallery-1",
            blockType: "carousel",
            field: "image",
            source: "block",
            states: ["draft", "published"],
          },
          {
            blockKey: "hero-1",
            blockType: "hero",
            field: "image",
            source: "block",
            states: ["published"],
          },
        ],
        modelKey: "posts",
        slug: "e-one",
        status: "changed",
        title: "Title e-one",
      },
    ]);
    expect(await repository.loadMediaUsage({ limit: 50, mediaId: mediaId("m-d") })).toEqual([
      expect.objectContaining({
        entryId: "e-one",
        locations: [{ field: "cover", source: "field", states: ["draft"] }],
      }),
    ]);
    expect(
      (await repository.loadMediaUsage({ limit: 1, mediaId: mediaId("m-a") })).map(
        (value) => value.entryId,
      ),
    ).toEqual(["e-two"]);
    for (const limit of [0, 51]) {
      await expect(
        repository.loadMediaUsage({ limit, mediaId: mediaId("m-a") }),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    }

    const outboxCount = () =>
      count(
        sql,
        "select count(*) as count from outbox_events where type = 'media.delete.requested'",
      );
    const request = (id: string) => ({
      mediaId: mediaId(id),
      requestedAt: unixMilliseconds(60),
      requestedBy: editor,
    });
    await expect(repository.markForDeletion(request("m-a"))).rejects.toMatchObject({
      code: "MEDIA_IN_USE",
    });
    await expect(repository.retryDeletion(request("m-a"))).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    await sql.run("update media set status = 'delete_failed' where id = 'm-d'");
    await expect(repository.retryDeletion(request("m-d"))).rejects.toMatchObject({
      code: "MEDIA_IN_USE",
    });
    expect(await outboxCount()).toBe(0);
    await expect(repository.markForDeletion(request("m-b"))).resolves.toMatchObject({
      media: { id: "m-b", status: "deleting", updatedAt: 60 },
      status: "deleting",
    });
    await expect(repository.markForDeletion(request("m-b"))).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    await expect(repository.markForDeletion(request("missing"))).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect(await outboxCount()).toBe(1);
    expect(
      JSON.parse(
        (await sql.get<{ payload_json: string }>(
          "select payload_json from outbox_events where type = 'media.delete.requested'",
        ))!.payload_json,
      ),
    ).toEqual({ mediaId: "m-b", requestedBy: "editor" });
    expect((await repository.loadMedia("m-a"))!.status).toBe("active");
  },
);

/** Identical lifecycle cases every SQL runtime adapter must pass. */
contract("build diagnostics persist safely across recovery and retry", async (runtime, expect) => {
  const { repository, sql, reopen } = await runtime.open({ resolveModel: noModels });
  const request = await repository.requestBuild({
    requestedAt: unixMilliseconds(1),
    requestedBy: admin,
  });
  const [lease] = await repository.claimSiteBuilds({ limit: 1, now: unixMilliseconds(5001) });
  await repository.recordSiteBuildFailure({
    leaseId: lease!.id,
    now: unixMilliseconds(5002),
    reason: "source_symlink",
    path: "src/linked.astro",
    terminal: false,
    retryAt: unixMilliseconds(6000),
  });
  expect(await repository.getSiteBuild(lease!.buildId)).toMatchObject({
    status: "pending",
    error: "source_symlink",
    errorPath: "src/linked.astro",
  });
  expect(await reopen().getSiteBuild(lease!.buildId)).toMatchObject({
    error: "source_symlink",
    errorPath: "src/linked.astro",
  });
  expect(
    await sql.get("select last_error from outbox_events where id = ?", request.eventId),
  ).toEqual({ last_error: "source_symlink" });
  const [retryLease] = await repository.claimSiteBuilds({ limit: 1, now: unixMilliseconds(6000) });
  await expect(
    repository.recordSiteBuildFailure({
      leaseId: lease!.id,
      now: unixMilliseconds(6001),
      reason: "source_missing",
      path: "package.json",
      terminal: true,
    }),
  ).rejects.toThrow();
  await repository.recordSiteBuildFailure({
    leaseId: retryLease!.id,
    now: unixMilliseconds(6001),
    reason: "source_symlink",
    path: "src/linked.astro",
    terminal: true,
  });
  const newRequest = await repository.requestBuild({
    requestedAt: unixMilliseconds(7000),
    requestedBy: admin,
    retryOfBuildId: lease!.buildId,
  });
  const [newLease] = await repository.claimSiteBuilds({ limit: 1, now: unixMilliseconds(12000) });
  await repository.recordSiteBuildSuccess({ leaseId: newLease!.id, now: unixMilliseconds(12001) });
  expect(await repository.getSiteBuild(newLease!.buildId)).not.toHaveProperty("error");
  expect(await repository.getSiteBuild(newLease!.buildId)).not.toHaveProperty("errorPath");
  expect(newRequest.eventId).not.toBe(request.eventId);
  expect(await repository.getSiteBuild(lease!.buildId)).toMatchObject({
    status: "failed",
    error: "source_symlink",
    errorPath: "src/linked.astro",
  });
});

for (const fault of ["mutation", "commit"] as const) {
  contract(
    `rolls back publication after actual SQL ${fault} failure and retries safely`,
    async (runtime, expect) => {
      const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
      await seedModels(sql, "posts");
      await seedMedia(sql, "media-1");
      await repository.create({
        entry: heroEntry("post", "posts", 1),
        mediaReferences: references("post-block"),
      });
      if (fault === "commit") {
        await sql.run(
          "create table fault_commit (entry_id text references content_entries(id) deferrable initially deferred)",
        );
        await sql.run(
          "create trigger injected_sql_failure after insert on published_routes begin insert into fault_commit values ('missing-entry'); end",
        );
      } else {
        await sql.run(
          "create trigger injected_sql_failure before insert on published_routes begin select raise(abort, 'injected SQL failure'); end",
        );
      }
      const tables = [
        "content_entries",
        "content_snapshots",
        "content_blocks",
        "content_media_references",
        "published_routes",
        "published_state",
        "outbox_events",
        "site_builds",
        "idempotency_records",
        "mutation_guards",
      ];
      const snapshot = () =>
        Promise.all(
          tables.map(async (table) => [
            table,
            await sql.all(`select * from ${table} order by rowid`),
          ]),
        );
      const before = await snapshot();
      await expect(repository.publish(publish("post", 1, 2, "published"))).rejects.toMatchObject({
        code: "CONTENT_INVALID_STATE",
      });
      expect(await snapshot()).toEqual(before);
      if (fault === "commit") expect(await sql.all("select * from fault_commit")).toEqual([]);
      await sql.run("drop trigger injected_sql_failure");
      await repository.publish(publish("post", 1, 3, "retry-published"));
      expect((await repository.load({ entryId: contentEntryId("post") }))?.published).toBeDefined();
      expect(await count(sql, "select count(*) as count from published_routes")).toBe(1);
    },
  );
}

contract(
  "bulk metadata reads deduplicate IDs, cross chunks and preserve missing/inactive state",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: () => undefined });
    for (let index = 0; index < 201; index++)
      await seedMedia(sql, `bulk-${index}`, index === 200 ? "deleting" : "active");
    expect(await repository.loadMediaMany([])).toEqual([]);
    const records = await repository.loadMediaMany([
      ...Array.from({ length: 201 }, (_, index) => `bulk-${index}`),
      "bulk-0",
      "missing",
    ]);
    expect(records).toHaveLength(201);
    expect(new Set(records.map((record) => record.id)).size).toBe(201);
    expect(records.find((record) => record.id === "bulk-200")?.status).toBe("deleting");
    expect(records.filter((record) => record.status === "active")).toHaveLength(200);
  },
);

/** A real normalized `posts` model (with canonical structure) for schema-evolution cases. */

declare function atob(data: string): string;

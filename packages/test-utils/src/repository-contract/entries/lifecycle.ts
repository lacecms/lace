import {
  lifecycleState,
  unpublishCommand,
  revertCommand,
  changedPost,
  seedPublishedLifecycle,
} from "../entries/fixtures.js";
import { publicationIdempotencyKey, publicationRequestFingerprint } from "@lacecms/application";
import { readAllBuildContentPages } from "../../delivery/build-export.js";
import {
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  unixMilliseconds,
} from "@lacecms/domain";

import {
  type RepositoryContractCase,
  UNPUBLICATION_CHECKPOINTS,
  REVERT_CHECKPOINTS,
  editor,
  admin,
  resolveRoute,
  count,
  seedModels,
  seedMedia,
  entry,
  heroBlock,
  heroEntry,
  references,
  publish,
  registerContract,
} from "../shared.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

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

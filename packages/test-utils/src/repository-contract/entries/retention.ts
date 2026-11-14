import { publicationIdempotencyKey, publicationRequestFingerprint } from "@lacecms/application";
import { lifecycleState, seedPublishedLifecycle, unpublishCommand } from "./fixtures.js";
import {
  type ContractSql,
  type RepositoryContractCase,
  admin,
  count,
  editor,
  entry,
  heroEntry,
  publish,
  references,
  registerContract,
  resolveRoute,
  save,
  seedMedia,
  seedModels,
} from "../shared.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

/** Architecture §9.8: publication idempotency records live for 24 hours. */
const TTL = 86_400_000;
/** The per-call bound of the maintenance purge on both runtimes. */
const PURGE_LIMIT = 20;

async function records(sql: ContractSql) {
  return sql.all<{ scope: string; key: string; request_hash: string; expires_at: number }>(
    "select scope, key, request_hash, expires_at from idempotency_records order by scope, key",
  );
}

async function snapshotRows(sql: ContractSql, entryId: string) {
  const ids = (
    await sql.all<{ id: string }>(
      "select id from content_snapshots where entry_id = ? order by id",
      entryId,
    )
  ).map((row) => row.id);
  const owned = async (table: string) =>
    count(
      sql,
      `select count(*) as count from ${table} t where t.snapshot_id not in (select id from content_snapshots)`,
    );
  return {
    ids,
    orphanBlocks: await owned("content_blocks"),
    orphanLinks: await owned("content_entry_link_references"),
    orphanReferences: await owned("content_media_references"),
    blocks: await count(sql, "select count(*) as count from content_blocks"),
    links: await count(sql, "select count(*) as count from content_entry_link_references"),
    references: await count(sql, "select count(*) as count from content_media_references"),
  };
}

contract(
  "an expired publication key is processed as a new request and replaces its record",
  async (runtime, expect) => {
    const harness = await runtime.open({ resolveModel: resolveRoute });
    const { repository, sql } = harness;
    await seedModels(sql, "posts");
    await repository.create({
      entry: entry("post", "posts", { slug: "post", updatedAt: 1 }),
      mediaReferences: [],
    });
    const idempotency = {
      actorId: editor.id,
      fingerprint: publicationRequestFingerprint("fingerprint-1"),
      key: publicationIdempotencyKey("request-1"),
    };
    const first = await repository.publish({ ...publish("post", 1, 2, "first"), idempotency });
    expect(first.outcome).toBe("published");
    // One millisecond before expiry the key still replays without new state.
    const early = await repository.publish({
      ...publish("post", 1, 1 + TTL, "early"),
      idempotency,
    });
    expect(early).toEqual({ entry: first.entry, outcome: "replayed", status: "published" });
    expect(await repository.publishedContentVersion()).toBe(1);
    expect(await count(sql, "select count(*) as count from content_snapshots")).toBe(2);

    await repository.saveCompleteDraft(save("post", 1, 3, { slug: "post", title: "Second" }));
    // At its expiry time the record is absent: the retry is a new, guarded publication.
    const second = await harness
      .reopen()
      .publish({ ...publish("post", 2, 2 + TTL, "second"), idempotency });
    expect(second.outcome).toBe("published");
    expect(second.entry.published).toMatchObject({ id: "second", title: "Second" });
    expect(await repository.publishedContentVersion()).toBe(2);
    expect(await records(sql)).toEqual([
      {
        expires_at: 2 + 2 * TTL,
        key: "request-1",
        request_hash: "fingerprint-1",
        scope: "publication:post:editor",
      },
    ]);
    const stored = await sql.get<{ response_json: string }>(
      "select response_json from idempotency_records",
    );
    expect(JSON.parse(stored!.response_json).published.id).toBe("second");

    // An expired key reused with different input is not an idempotency conflict.
    await repository.saveCompleteDraft(save("post", 2, 4, { slug: "post", title: "Third" }));
    const third = await repository.publish({
      ...publish("post", 3, 2 + 2 * TTL, "third"),
      idempotency: { ...idempotency, fingerprint: publicationRequestFingerprint("fingerprint-2") },
    });
    expect(third.outcome).toBe("published");
    expect(await repository.publishedContentVersion()).toBe(3);
    expect(await records(sql)).toEqual([
      {
        expires_at: 2 + 3 * TTL,
        key: "request-1",
        request_hash: "fingerprint-2",
        scope: "publication:post:editor",
      },
    ]);
  },
);

contract(
  "an expired unpublication key with stale input changes nothing and a current one unpublishes anew",
  async (runtime, expect) => {
    const harness = await runtime.open({ resolveModel: resolveRoute });
    const { repository, sql } = harness;
    await seedPublishedLifecycle(repository, sql);
    const idempotency = {
      actorId: admin.id,
      fingerprint: publicationRequestFingerprint("unpublish-fingerprint"),
      key: publicationIdempotencyKey("unpublish-key"),
    };
    const first = await repository.unpublish({
      ...unpublishCommand("post", "post-published", 5),
      idempotency,
    });
    expect(first.outcome).toBe("unpublished");
    await repository.publish(publish("post", 1, 6, "post-again"));
    const replay = await repository.unpublish({
      ...unpublishCommand("post", "post-published", 4 + TTL),
      idempotency,
    });
    expect(replay).toEqual({ entry: first.entry, outcome: "replayed", status: "unpublished" });

    const before = await lifecycleState(sql);
    await expect(
      harness.reopen().unpublish({
        ...unpublishCommand("post", "post-published", 5 + TTL),
        idempotency,
      }),
    ).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
    expect(await lifecycleState(sql)).toEqual(before);

    const version = await repository.publishedContentVersion();
    const second = await repository.unpublish({
      ...unpublishCommand("post", "post-again", 5 + TTL),
      idempotency,
    });
    expect(second.outcome).toBe("unpublished");
    expect(await repository.publishedContentVersion()).toBe(version + 1);
    expect(await records(sql)).toEqual([
      {
        expires_at: 5 + 2 * TTL,
        key: "unpublish-key",
        request_hash: "unpublish-fingerprint",
        scope: "unpublication:post:admin",
      },
    ]);
  },
);

contract("purges expired idempotency records in bounded batches", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
  const now = 1_000;
  for (let index = 0; index <= PURGE_LIMIT; index += 1)
    await sql.run(
      "insert into idempotency_records (scope, key, request_hash, response_json, created_at, expires_at) values (?, ?, 'hash', '{}', 1, ?)",
      "publication:post:editor",
      `expired-${String(index).padStart(2, "0")}`,
      index === 0 ? now : now - index,
    );
  for (const key of ["live-a", "live-b"])
    await sql.run(
      "insert into idempotency_records (scope, key, request_hash, response_json, created_at, expires_at) values ('unpublication:post:admin', ?, 'hash', '{}', 1, ?)",
      key,
      now + 1,
    );
  await expect(repository.purgeExpiredIdempotencyRecords(now, PURGE_LIMIT + 1)).rejects.toThrow();
  expect(await repository.purgeExpiredIdempotencyRecords(now, PURGE_LIMIT)).toBe(PURGE_LIMIT);
  expect(await count(sql, "select count(*) as count from idempotency_records")).toBe(3);
  expect(
    await count(sql, "select count(*) as count from idempotency_records where expires_at > ?", now),
  ).toBe(2);
  expect(await repository.purgeExpiredIdempotencyRecords(now, PURGE_LIMIT)).toBe(1);
  expect(await repository.purgeExpiredIdempotencyRecords(now, PURGE_LIMIT)).toBe(0);
  expect((await records(sql)).map((row) => row.key)).toEqual(["live-a", "live-b"]);
});

contract(
  "republication keeps only the draft and the new publication and a refused one deletes nothing",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    await seedMedia(sql, "media-1");
    await repository.create({
      entry: entry("target", "posts", { slug: "target", updatedAt: 1 }),
      mediaReferences: [],
    });
    await repository.publish(publish("target", 1, 2, "target-published"));
    const linked = heroEntry("post", "posts", 1);
    const link = {
      area: "fields" as const,
      delivered: true,
      pointer: "/link",
      sourceKey: "$fields" as const,
      targetId: "target",
    };
    await repository.create({
      entry: linked,
      internalLinks: [link],
      mediaReferences: references("post-block"),
    });
    await repository.publish(publish("post", 1, 3, "post-first"));
    // A stray snapshot of the same entry, as a concurrent same-revision publication leaves.
    await sql.run(
      "insert into content_snapshots (id, entry_id, revision, slug, title, fields_json, schema_version, created_at, updated_at, updated_by) values ('post-stray', 'post', 1, 'post', 'Stray', '{}', 1, 3, 3, 'editor')",
    );
    await sql.run(
      "insert into content_blocks (snapshot_id, block_key, block_type, position, schema_version, data_json, created_at, updated_at) values ('post-stray', 'stray-block', 'hero', 1000, 1, '{}', 3, 3)",
    );
    await sql.run(
      "insert into content_media_references (snapshot_id, source_key, field_path, media_id, created_at) values ('post-stray', '$fields', 'image', 'media-1', 3)",
    );
    await repository.saveCompleteDraft(
      save("post", 1, 4, {
        blocks: linked.draft.blocks,
        fields: { image: "media-1", title: "Changed" },
        mediaReferences: references("post-block"),
        slug: "post",
        title: "Changed",
      }),
    );
    // saveCompleteDraft replaces internal links only when given; keep the draft link.
    await sql.run(
      "insert or ignore into content_entry_link_references (snapshot_id, source_key, area, field_path, target_entry_id, delivered) values ('post-draft', '$fields', 'fields', '/link', 'target', 1)",
    );
    await repository.publish(publish("post", 2, 5, "post-second"));
    const republished = await snapshotRows(sql, "post");
    expect(republished).toMatchObject({
      ids: ["post-draft", "post-second"],
      orphanBlocks: 0,
      orphanLinks: 0,
      orphanReferences: 0,
    });
    for (const table of [
      "content_blocks",
      "content_media_references",
      "content_entry_link_references",
    ])
      expect(
        await count(
          sql,
          `select count(*) as count from ${table} where snapshot_id in ('post-first', 'post-stray')`,
        ),
      ).toBe(0);
    expect(
      await count(
        sql,
        "select count(*) as count from content_entry_link_references where snapshot_id = 'post-second'",
      ),
    ).toBe(1);

    await repository.saveCompleteDraft(save("post", 2, 6, { slug: "post", title: "Third" }));
    const before = await snapshotRows(sql, "post");
    await expect(repository.publish(publish("post", 2, 7, "post-stale"))).rejects.toMatchObject({
      code: "CONTENT_REVISION_CONFLICT",
    });
    expect(await snapshotRows(sql, "post")).toEqual(before);
    expect(await snapshotRows(sql, "target")).toMatchObject({
      ids: ["target-draft", "target-published"],
    });
  },
);

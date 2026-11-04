import { publicationIdempotencyKey, publicationRequestFingerprint } from "@lacecms/application";
import { readAllBuildContentPages } from "../../delivery/build-export.js";
import {
  actorId,
  blockKey,
  contentEntryId,
  contentModelKey,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";
import {
  type RepositoryContractCase,
  PUBLICATION_CHECKPOINTS,
  editor,
  resolveRoute,
  sequence,
  count,
  seedModels,
  seedMedia,
  entry,
  heroBlock,
  heroEntry,
  references,
  save,
  publish,
  registerContract,
} from "../shared.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

contract(
  "persists bounded draft reads and writes without exposing drafts publicly",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts", "home");
    await seedMedia(sql, "media-1");
    const first = heroEntry("post-a", "posts", 20, "First");
    const second = heroEntry("post-b", "posts", 20, "Second");
    await expect(
      repository.create({ entry: first, mediaReferences: references("post-a-block") }),
    ).resolves.toMatchObject({ entry: { id: "post-a" }, status: "created" });
    await repository.create({ entry: second, mediaReferences: references("post-b-block") });
    const listInput = {
      limit: 1,
      listFields: [],
      modelKey: contentModelKey("posts"),
      sort: "-updatedAt" as const,
    };
    const firstPage = await repository.list(listInput);
    expect(firstPage.items.map((item) => item.id)).toEqual(["post-b"]);
    const secondPage = await repository.list({ ...listInput, after: firstPage.nextCursor! });
    expect(secondPage.items.map((item) => item.id)).toEqual(["post-a"]);
    expect(secondPage.nextCursor).toBeUndefined();
    await expect(
      repository.list({ ...listInput, after: "not-a-cursor" as never }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await repository.loadDraft({ entryId: first.id })).toMatchObject({
      blocks: [{ key: "post-a-block" }],
      id: "post-a-draft",
      revision: 1,
      title: "First",
    });
    expect(await repository.loadPublished({ entryId: first.id })).toBeNull();
    expect(await repository.load({ entryId: contentEntryId("missing") })).toBeNull();

    const saved = await repository.saveCompleteDraft(
      save("post-a", 1, 30, {
        blocks: [heroBlock("saved-block", "media-1", "Saved")],
        fields: { image: "media-1", title: "Saved" },
        mediaReferences: references("saved-block"),
        slug: "post-a",
        title: "Saved",
      }),
    );
    expect(saved).toMatchObject({ entry: { draft: { revision: 2 } }, status: "saved" });
    expect((await repository.load({ entryId: first.id }))!.draft).toMatchObject({
      blocks: [{ key: "saved-block" }],
      revision: 2,
      title: "Saved",
    });
    expect(
      await count(
        sql,
        "select count(*) as count from content_media_references where snapshot_id = ?",
        "post-a-draft",
      ),
    ).toBe(2);
    await expect(
      repository.saveCompleteDraft(save("post-a", 1, 31, { title: "Stale" })),
    ).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
    expect((await repository.load({ entryId: first.id }))!.draft.title).toBe("Saved");
    await seedMedia(sql, "deleting-media", "deleting");
    for (const unavailable of ["missing-media", "deleting-media"]) {
      await expect(
        repository.saveCompleteDraft(
          save("post-a", 2, 32, {
            fields: { title: "Broken" },
            mediaReferences: [
              { fieldPath: "image", mediaId: mediaId(unavailable), sourceKey: "$fields" },
            ],
            title: "Broken",
          }),
        ),
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    }
    expect((await repository.load({ entryId: first.id }))!.draft).toMatchObject({
      blocks: [{ key: "saved-block" }],
      revision: 2,
      title: "Saved",
    });
    await expect(repository.saveCompleteDraft(save("missing", 1, 33))).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });

    await repository.create({
      entry: heroEntry("home-a", "home", 21),
      mediaReferences: references("home-a-block"),
    });
    await expect(
      repository.create({
        entry: heroEntry("home-b", "home", 22),
        mediaReferences: references("home-b-block"),
      }),
    ).rejects.toMatchObject({ code: "CONTENT_MODEL_CARDINALITY_CONFLICT" });
    expect(await repository.load({ entryId: contentEntryId("home-b") })).toBeNull();
    await expect(
      repository.create({
        entry: entry("broken", "posts", { updatedAt: 23 }),
        mediaReferences: [{ fieldPath: "x", mediaId: mediaId("missing"), sourceKey: "$fields" }],
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await repository.load({ entryId: contentEntryId("broken") })).toBeNull();

    const published = await repository.publish(publish("post-a", 2, 40, "post-a-published"));
    expect(published).toMatchObject({
      outcome: "published",
      status: "published",
      targetVersion: 1,
    });
    if (published.outcome !== "published") throw new Error("expected publication");
    expect(published.entry).toEqual(await repository.load({ entryId: first.id }));
    expect(published.entry.published).toMatchObject({
      createdAt: 40,
      id: "post-a-published",
      revision: 2,
      state: "published",
      updatedBy: { id: "editor" },
    });
    expect(
      await count(
        sql,
        "select count(*) as count from content_media_references where snapshot_id = ?",
        "post-a-published",
      ),
    ).toBe(2);
    await sql.run(
      "insert into content_snapshots (id, entry_id, revision, slug, title, fields_json, schema_version, created_at, updated_at, updated_by) select ?, entry_id, revision, slug, title, fields_json, schema_version, ?, ?, updated_by from content_snapshots where id = ?",
      "post-b-published",
      41,
      41,
      "post-b-draft",
    );
    await sql.run(
      "insert into content_blocks (snapshot_id, block_key, block_type, position, schema_version, data_json, created_at, updated_at) select ?, block_key, block_type, position, schema_version, data_json, created_at, updated_at from content_blocks where snapshot_id = ?",
      "post-b-published",
      "post-b-draft",
    );
    await sql.run(
      "update content_entries set published_snapshot_id = ? where id = ?",
      "post-b-published",
      "post-b",
    );
    await sql.run(
      "insert into published_routes (path, entry_id, snapshot_id, updated_at) values (?, ?, ?, ?)",
      "/blog/post-b",
      "post-b",
      "post-b-published",
      41,
    );
    expect(await repository.loadPublic("/blog/post-a")).toMatchObject({
      entry: { id: "post-a", published: { id: "post-a-published" } },
      path: "/blog/post-a",
    });
    const publicPage = await repository.listPublic({
      limit: 1,
      modelKey: contentModelKey("posts"),
    });
    expect(publicPage).toMatchObject({ items: [{ path: "/blog/post-b" }] });
    expect(
      await repository.listPublic({
        after: publicPage.nextCursor!,
        limit: 1,
        modelKey: contentModelKey("posts"),
      }),
    ).toMatchObject({ items: [{ path: "/blog/post-a" }] });
    await expect(
      repository.listPublic({
        after: publicPage.nextCursor!,
        limit: 1,
        modelKey: contentModelKey("home"),
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await repository.publishedContentVersion()).toBe(1);
    expect((await repository.loadPublicMedia("media-1"))?.id).toBe("media-1");
    expect(await repository.loadPublicMedia("deleting-media")).toBeNull();
    expect(await readAllBuildContentPages(repository)).toMatchObject({
      entries: [{ path: "/blog/post-a" }, { path: "/blog/post-b" }],
      version: 1,
    });
    expect(await repository.loadPublic("/missing")).toBeNull();
    await sql.run(
      "update content_snapshots set fields_json = ? where id = ?",
      "not-json",
      "post-b-published",
    );
    await expect(repository.loadPublic("/blog/post-b")).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
  },
);

contract(
  "keeps the previous publication until a later publish replaces it",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    await seedMedia(sql, "media-1");
    await repository.create({
      entry: heroEntry("post", "posts", 1),
      mediaReferences: references("post-block"),
    });
    await repository.publish(publish("post", 1, 2, "first-publication"));
    await repository.saveCompleteDraft(save("post", 1, 3, { slug: "renamed", title: "Draft" }));
    expect((await repository.loadPublished({ entryId: contentEntryId("post") }))?.title).toBe(
      "post",
    );
    expect(await repository.loadPublic("/blog/post")).not.toBeNull();
    await repository.publish(publish("post", 2, 4, "second-publication"));
    expect(await repository.loadPublic("/blog/post")).toBeNull();
    expect(await repository.loadPublic("/blog/renamed")).toMatchObject({
      entry: { published: { id: "second-publication", title: "Draft" } },
    });
    expect(
      await sql.all("select id from content_snapshots where entry_id = 'post' order by id"),
    ).toEqual([{ id: "post-draft" }, { id: "second-publication" }]);
    expect(
      await count(
        sql,
        "select count(*) as count from content_media_references where snapshot_id = 'first-publication'",
      ),
    ).toBe(0);
    expect(await repository.publishedContentVersion()).toBe(2);
    expect(
      JSON.parse(
        (await sql.get<{ payload_json: string }>("select payload_json from outbox_events"))!
          .payload_json,
      ),
    ).toEqual({
      publishedSnapshotId: "second-publication",
      reason: "publication",
      requestedAt: 4,
      requestedBy: "editor",
      targetVersion: 2,
    });
    await expect(repository.publish(publish("post", 1, 5))).rejects.toMatchObject({
      code: "CONTENT_REVISION_CONFLICT",
    });
    await expect(repository.publish(publish("missing", 1, 5))).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
  },
);

contract(
  "removing a media block from a draft leaves published-only usage until republication",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({
      nextId: sequence("outbox"),
      resolveModel: resolveRoute,
    });
    await seedModels(sql, "posts");
    await seedMedia(sql, "media-1");
    await seedMedia(sql, "media-2");
    const kept = heroBlock("kept", "media-2", "Kept", "hero", 2000);
    await repository.create({
      entry: entry("post", "posts", {
        blocks: [heroBlock("removed", "media-1", "Removed"), kept],
        slug: "post",
        title: "Post",
        updatedAt: 1,
      }),
      mediaReferences: [
        { fieldPath: "image", mediaId: mediaId("media-1"), sourceKey: blockKey("removed") },
        { fieldPath: "image", mediaId: mediaId("media-2"), sourceKey: blockKey("kept") },
      ],
    });
    await repository.publish(publish("post", 1, 2));
    await repository.saveCompleteDraft(
      save("post", 1, 3, {
        blocks: [{ ...kept, position: 1000 }],
        mediaReferences: [
          { fieldPath: "image", mediaId: mediaId("media-2"), sourceKey: blockKey("kept") },
        ],
        slug: "post",
        title: "Post",
      }),
    );
    const request = (at: number) => ({
      mediaId: mediaId("media-1"),
      requestedAt: unixMilliseconds(at),
      requestedBy: editor,
    });
    expect((await repository.loadMediaCatalogItem("media-1"))!.usageCount).toBe(1);
    expect(await repository.loadMediaUsage({ limit: 50, mediaId: mediaId("media-1") })).toEqual([
      expect.objectContaining({
        entryId: "post",
        locations: [
          {
            blockKey: "removed",
            blockType: "hero",
            field: "image",
            source: "block",
            states: ["published"],
          },
        ],
        status: "changed",
      }),
    ]);
    await expect(repository.markForDeletion(request(4))).rejects.toMatchObject({
      code: "MEDIA_IN_USE",
    });

    await repository.publish(publish("post", 2, 5));
    expect((await repository.loadMediaCatalogItem("media-1"))!.usageCount).toBe(0);
    expect(await repository.loadMediaUsage({ limit: 50, mediaId: mediaId("media-1") })).toEqual([]);
    expect((await repository.loadMediaCatalogItem("media-2"))!.usageCount).toBe(1);
    await expect(repository.markForDeletion(request(6))).resolves.toMatchObject({
      status: "deleting",
    });
  },
);

contract(
  "rejects a route conflict without changing either entry or public state",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "posts");
    await seedMedia(sql, "media-1");
    await repository.create({
      entry: entry("owner", "posts", { slug: "shared", updatedAt: 1 }),
      mediaReferences: [],
    });
    await repository.publish(publish("owner", 1, 2, "owner-published"));
    await repository.create({
      entry: entry("challenger", "posts", {
        blocks: [heroBlock("challenger-block", "media-1")],
        slug: "shared",
        updatedAt: 3,
      }),
      mediaReferences: references("challenger-block"),
    });
    const outboxBefore = await sql.all("select id, payload_json, available_at from outbox_events");
    await expect(
      repository.publish(publish("challenger", 1, 4, "challenger-published")),
    ).rejects.toMatchObject({ code: "CONTENT_ROUTE_CONFLICT" });
    expect(await sql.all("select path, entry_id, snapshot_id from published_routes")).toEqual([
      { entry_id: "owner", path: "/blog/shared", snapshot_id: "owner-published" },
    ]);
    expect((await repository.load({ entryId: contentEntryId("challenger") }))?.published).toBe(
      undefined,
    );
    expect(
      await count(
        sql,
        "select count(*) as count from content_snapshots where id = ?",
        "challenger-published",
      ),
    ).toBe(0);
    expect(await count(sql, "select count(*) as count from content_blocks")).toBe(1);
    expect(await count(sql, "select count(*) as count from content_media_references")).toBe(2);
    expect(await repository.publishedContentVersion()).toBe(1);
    expect(await sql.all("select id, payload_json, available_at from outbox_events")).toEqual(
      outboxBefore,
    );
  },
);

contract(
  "replays an idempotent publication once and refuses a changed fingerprint",
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
    const [left, right] = await Promise.all([
      repository.publish({ ...publish("post", 1, 2, "left"), idempotency }),
      harness.reopen().publish({ ...publish("post", 1, 2, "right"), idempotency }),
    ]);
    expect([left.outcome, right.outcome].sort()).toEqual(["published", "replayed"]);
    expect(right.entry).toEqual(left.entry);
    expect(await repository.publishedContentVersion()).toBe(1);
    expect(await count(sql, "select count(*) as count from outbox_events")).toBe(1);
    expect(await count(sql, "select count(*) as count from content_snapshots")).toBe(2);
    const replay = await repository.publish({ ...publish("post", 1, 9, "late"), idempotency });
    expect(replay).toEqual({ entry: left.entry, outcome: "replayed", status: "published" });
    await expect(
      repository.publish({
        ...publish("post", 1, 10),
        idempotency: { ...idempotency, fingerprint: publicationRequestFingerprint("other") },
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    await expect(
      repository.publish({
        ...publish("post", 1, 10),
        idempotency: { ...idempotency, actorId: actorId("someone-else") },
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await repository.publishedContentVersion()).toBe(1);
    expect(
      await sql.get("select scope, key, request_hash, expires_at from idempotency_records"),
    ).toEqual({
      expires_at: 86_400_002,
      key: "request-1",
      request_hash: "fingerprint-1",
      scope: "publication:post:editor",
    });
  },
);

contract("admits exactly one of two concurrent saves at one revision", async (runtime, expect) => {
  const harness = await runtime.open({ resolveModel: resolveRoute });
  const { repository, sql } = harness;
  await seedModels(sql, "posts");
  await seedMedia(sql, "media-1");
  await repository.create({ entry: entry("post", "posts", { updatedAt: 1 }), mediaReferences: [] });
  const attempt = (label: string, at: number) =>
    save("post", 1, at, {
      blocks: [heroBlock(`${label}-block`, "media-1", label)],
      mediaReferences: [
        { fieldPath: "image", mediaId: mediaId("media-1"), sourceKey: blockKey(`${label}-block`) },
      ],
      title: label,
    });
  const results = await Promise.allSettled([
    repository.saveCompleteDraft(attempt("left", 2)),
    harness.reopen().saveCompleteDraft(attempt("right", 3)),
  ]);
  const committed = results.filter((result) => result.status === "fulfilled");
  const refused = results.filter((result) => result.status === "rejected");
  expect(committed).toHaveLength(1);
  expect(refused).toHaveLength(1);
  expect((refused[0] as PromiseRejectedResult).reason).toMatchObject({
    code: "CONTENT_REVISION_CONFLICT",
  });
  const winner = (await repository.load({ entryId: contentEntryId("post") }))!.draft;
  expect(winner.revision).toBe(2);
  expect(winner.blocks.map((block) => block.key)).toEqual([`${winner.title}-block`]);
  expect(await sql.all("select source_key from content_media_references")).toEqual([
    { source_key: `${winner.title}-block` },
  ]);
});

contract("rejects drafts beyond the block and media-reference caps", async (runtime, expect) => {
  const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
  await seedModels(sql, "posts");
  await seedMedia(sql, "media-1");
  const blocks = Array.from({ length: 201 }, (_, index) =>
    heroBlock(`block-${index}`, "media-1", "x", "hero", (index + 1) * 1000),
  );
  const tooManyReferences = Array.from({ length: 201 }, (_, index) => ({
    fieldPath: `image-${index}`,
    mediaId: mediaId("media-1"),
    sourceKey: "$fields" as const,
  }));
  await expect(
    repository.create({
      entry: entry("big", "posts", { blocks, updatedAt: 1 }),
      mediaReferences: [],
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  await repository.create({ entry: entry("post", "posts", { updatedAt: 1 }), mediaReferences: [] });
  await expect(
    repository.saveCompleteDraft(save("post", 1, 2, { mediaReferences: tooManyReferences })),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  await expect(repository.saveCompleteDraft(save("post", 1, 2, { blocks }))).rejects.toMatchObject({
    code: "CONTENT_INVALID_STATE",
  });
  expect(await count(sql, "select count(*) as count from content_entries")).toBe(1);
  expect((await repository.load({ entryId: contentEntryId("post") }))!.draft.revision).toBe(1);
});

contract("rolls back publication at every injected checkpoint", async (runtime, expect) => {
  for (const checkpoint of PUBLICATION_CHECKPOINTS) {
    const { repository, sql } = await runtime.open({
      beforeMutation: (name) => {
        if (name === checkpoint) throw new Error(`injected ${checkpoint}`);
      },
      resolveModel: resolveRoute,
    });
    await seedModels(sql, "posts");
    await seedMedia(sql, "media-1");
    await repository.create({
      entry: heroEntry("post", "posts", 1),
      mediaReferences: references("post-block"),
    });
    await expect(repository.publish(publish("post", 1, 2, "published"))).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
    expect((await repository.load({ entryId: contentEntryId("post") }))?.published).toBe(undefined);
    for (const table of [
      "published_routes",
      "published_state",
      "outbox_events",
      "idempotency_records",
    ]) {
      expect(await count(sql, `select count(*) as count from ${table}`), checkpoint).toBe(0);
    }
    expect(await count(sql, "select count(*) as count from content_snapshots"), checkpoint).toBe(1);
    expect(await count(sql, "select count(*) as count from content_blocks"), checkpoint).toBe(1);
    expect(
      await count(sql, "select count(*) as count from content_media_references"),
      checkpoint,
    ).toBe(2);
  }
});

import { readAllBuildContentPages } from "../build-export.js";

import { blockKey, contentModelKey, mediaId, unixMilliseconds } from "@lacecms/domain";
import type { MediaMetadata } from "@lacecms/domain";

import {
  type ContractSql,
  type RepositoryContractCase,
  editor,
  resolveRoute,
  seedModels,
  seedMedia,
  heroEntry,
  save,
  publish,
  registerContract,
} from "./shared.js";
import { lifecycleState, changedPost, seedPublishedLifecycle } from "./lifecycle.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);
export const MEDIA_METADATA_CHECKPOINTS = Object.freeze([
  "media.metadata",
  "media.tags",
  "public-state",
  "build-outbox",
]);

export function metadataUpdate(
  id: string,
  expectedUpdatedAt: number,
  updatedAt: number,
  values: {
    readonly alt?: string | null;
    readonly caption?: string | null;
    readonly focalPoint?: { readonly x: number; readonly y: number } | null;
  } = {},
) {
  return {
    alt: values.alt ?? null,
    caption: values.caption ?? null,
    expectedUpdatedAt: unixMilliseconds(expectedUpdatedAt),
    focalPoint: values.focalPoint ?? null,
    mediaId: mediaId(id),
    requestedBy: editor,
    updatedAt: unixMilliseconds(updatedAt),
  };
}

export async function mediaMetadataState(
  sql: ContractSql,
): Promise<Record<string, readonly unknown[]>> {
  return {
    ...(await lifecycleState(sql)),
    media: await sql.all("select * from media order by id"),
    tags: await sql.all("select * from media_tags order by media_id, tag"),
  };
}

export async function pendingBuilds(sql: ContractSql) {
  const rows = await sql.all<{ payload_json: string }>(
    "select payload_json from outbox_events where type = 'site.build.requested' and processed_at is null",
  );
  return rows.map((row) => JSON.parse(row.payload_json) as Record<string, unknown>);
}

contract(
  "updates media metadata and requests a build only for published usage",
  async (runtime, expect) => {
    const harness = await runtime.open({ resolveModel: resolveRoute });
    const { repository, sql } = harness;
    await seedPublishedLifecycle(repository, sql);
    await repository.saveCompleteDraft(changedPost("post", 3));
    await seedMedia(sql, "media-3");
    const version = await repository.publishedContentVersion();
    const builds = await pendingBuilds(sql);
    expect(builds).toHaveLength(1);

    const drafted = await repository.updateMediaMetadata(
      metadataUpdate("media-2", 1, 10, { focalPoint: { x: 0.2, y: 0.8 } }),
    );
    expect(drafted).toEqual({ media: expect.objectContaining({ focalPoint: { x: 0.2, y: 0.8 } }) });
    expect(drafted.media.updatedAt).toBe(10);
    const unused = await repository.updateMediaMetadata(
      metadataUpdate("media-3", 1, 10, { alt: "Unused" }),
    );
    expect(unused).not.toHaveProperty("targetVersion");
    expect(await repository.publishedContentVersion()).toBe(version);
    expect(await pendingBuilds(sql)).toEqual(builds);

    const live = await repository.updateMediaMetadata(
      metadataUpdate("media-1", 1, 11, {
        alt: "Red bicycle",
        caption: "A\nbike",
        focalPoint: { x: 0, y: 1 },
      }),
    );
    expect(live.targetVersion).toBe(version + 1);
    expect(await repository.publishedContentVersion()).toBe(version + 1);
    const coalesced = await pendingBuilds(sql);
    expect(coalesced).toHaveLength(1);
    expect(coalesced[0]).toMatchObject({
      publishedSnapshotId: null,
      reason: "media_metadata",
      requestedBy: "editor",
      targetVersion: version + 1,
    });
    const described = {
      alt: "Red bicycle",
      caption: "A\nbike",
      focalPoint: { x: 0, y: 1 },
      updatedAt: 11,
    };
    expect(live.media).toMatchObject(described);
    expect(await repository.loadMedia("media-1")).toMatchObject(described);
    expect(await repository.loadPublicMedia("media-1")).toMatchObject(described);
    expect((await repository.loadMediaMany(["media-1"]))[0]).toMatchObject(described);
    expect((await repository.loadMediaCatalogItem("media-1"))!.media).toMatchObject(described);
    const listed = await repository.listMedia({ limit: 10, sort: "-createdAt" });
    expect(listed.items.find((item) => item.media.id === "media-1")!.media).toMatchObject(
      described,
    );
    expect(listed.items.find((item) => item.media.id === "media-3")!.media).toMatchObject({
      alt: "Unused",
    });
    expect(await sql.get("select metadata_json from media where id = 'media-1'")).toEqual({
      metadata_json: "{}",
    });

    const cleared = await repository.updateMediaMetadata(metadataUpdate("media-1", 11, 12));
    for (const key of ["alt", "caption", "focalPoint"]) {
      expect(cleared.media).not.toHaveProperty(key);
    }
    expect(cleared.targetVersion).toBe(version + 2);

    // A write committed by an independent repository makes the expected version stale.
    await harness.reopen().updateMediaMetadata(metadataUpdate("media-1", 12, 13, { alt: "Other" }));
    const committed = await mediaMetadataState(sql);
    await expect(
      repository.updateMediaMetadata(metadataUpdate("media-1", 12, 14, { alt: "Stale" })),
    ).rejects.toMatchObject({ code: "MEDIA_UPDATE_CONFLICT" });
    await expect(
      repository.updateMediaMetadata(metadataUpdate("missing", 1, 2, { alt: "x" })),
    ).rejects.toMatchObject({ code: "MEDIA_UPDATE_CONFLICT" });
    await seedMedia(sql, "media-4", "deleting");
    const withDeleting = await mediaMetadataState(sql);
    await expect(
      repository.updateMediaMetadata(metadataUpdate("media-4", 1, 2, { alt: "x" })),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await mediaMetadataState(sql)).toEqual(withDeleting);
    expect(withDeleting["published_state"]).toEqual(committed["published_state"]);

    // Concurrent edits at the same expected version commit once.
    const outcomes = await Promise.allSettled([
      repository.updateMediaMetadata(metadataUpdate("media-1", 13, 20, { alt: "First" })),
      harness.reopen().updateMediaMetadata(metadataUpdate("media-1", 13, 21, { alt: "Second" })),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const refused = outcomes.find((outcome) => outcome.status === "rejected");
    expect((refused as PromiseRejectedResult).reason).toMatchObject({
      code: "MEDIA_UPDATE_CONFLICT",
    });
    expect(await repository.publishedContentVersion()).toBe(version + 4);
  },
);

contract(
  "returns the active media of published snapshots with public reads",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: resolveRoute });
    await seedModels(sql, "home", "posts");
    for (const id of ["media-1", "media-2", "media-3"]) await seedMedia(sql, id);
    await sql.run(
      "update media set width = 1600, height = 900, alt = 'Office', caption = 'Our office', focal_x = 0.25, focal_y = 0.4 where id = 'media-2'",
    );
    await repository.create({
      entry: heroEntry("post", "posts", 1),
      mediaReferences: [
        { fieldPath: "image", mediaId: mediaId("media-1"), sourceKey: "$fields" },
        { fieldPath: "image", mediaId: mediaId("media-2"), sourceKey: blockKey("post-block") },
        { fieldPath: "media", mediaId: mediaId("media-2"), sourceKey: blockKey("other-block") },
      ],
    });
    await repository.publish(publish("post", 1, 2, "post-published"));
    await repository.saveCompleteDraft(
      save("post", 1, 3, {
        mediaReferences: [
          { fieldPath: "image", mediaId: mediaId("media-3"), sourceKey: "$fields" },
        ],
        title: "DRAFT ONLY",
      }),
    );

    const expectMedia = (media: readonly MediaMetadata[]) => {
      expect(media.map((item) => item.id)).toEqual(["media-1", "media-2"]);
      expect(media[1]).toMatchObject({
        alt: "Office",
        caption: "Our office",
        focalPoint: { x: 0.25, y: 0.4 },
        height: 900,
        width: 1600,
      });
    };
    const loaded = (await repository.loadPublic("/blog/post"))!;
    expectMedia(loaded.media);
    expect(loaded.entry.published!.title).toBe("post");
    expect(JSON.stringify(loaded)).not.toContain("DRAFT ONLY");
    const listed = await repository.listPublic({ limit: 10, modelKey: contentModelKey("posts") });
    expectMedia(listed.items[0]!.media);
    const exported = await readAllBuildContentPages(repository);
    expectMedia(exported.entries[0]!.media);
    expect(JSON.stringify(exported)).not.toContain("DRAFT ONLY");
  },
);

contract("enforces media metadata constraints in the database", async (runtime, expect) => {
  const { sql } = await runtime.open({ resolveModel: resolveRoute });
  await seedMedia(sql, "media-1");
  for (const [statement, ...params] of [
    ["update media set focal_x = 0.5 where id = 'media-1'"],
    ["update media set focal_x = 0.5, focal_y = 1.5 where id = 'media-1'"],
    ["update media set focal_x = -0.1, focal_y = 0.5 where id = 'media-1'"],
    ["update media set alt = ? where id = 'media-1'", "x".repeat(1001)],
    ["update media set caption = ? where id = 'media-1'", "x".repeat(2001)],
  ] as const) {
    await expect(sql.run(statement, ...params), statement).rejects.toThrow();
  }
  await sql.run(
    "update media set alt = ?, caption = ?, focal_x = 0, focal_y = 1 where id = 'media-1'",
    "x".repeat(1000),
    "x".repeat(2000),
  );
  expect(await sql.get("select focal_x, focal_y from media where id = 'media-1'")).toEqual({
    focal_x: 0,
    focal_y: 1,
  });
});

contract(
  "rolls back media metadata updates at every injected checkpoint",
  async (runtime, expect) => {
    for (const checkpoint of MEDIA_METADATA_CHECKPOINTS) {
      let armed = false;
      const { repository, sql } = await runtime.open({
        beforeMutation: (name) => {
          if (armed && name === checkpoint) throw new Error(`injected ${checkpoint}`);
        },
        resolveModel: resolveRoute,
      });
      await seedPublishedLifecycle(repository, sql);
      const before = await mediaMetadataState(sql);
      armed = true;
      await expect(
        repository.updateMediaMetadata(metadataUpdate("media-1", 1, 10, { alt: "Rolled back" })),
        checkpoint,
      ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
      expect(await mediaMetadataState(sql), checkpoint).toEqual(before);
    }
  },
);

// ---------------------------------------------------------------- globals

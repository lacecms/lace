import {
  blockKey,
  contentEntryId,
  contentSnapshotId,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";
import type { ContentBlock } from "@lacecms/domain";
import {
  type ContractRepository,
  type ContractSql,
  admin,
  editor,
  seedModels,
  seedMedia,
  entry,
  heroBlock,
  heroEntry,
  references,
  save,
  publish,
} from "../shared.js";

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

export function envelopeBlock(
  key: string,
  image: string,
  envelope: Partial<Pick<ContentBlock, "anchor" | "className" | "hidden" | "settings">>,
  position = 1000,
): ContentBlock {
  return Object.freeze({ ...heroBlock(key, image, key, "hero", position), ...envelope });
}

export function blockReference(media: string, key: string) {
  return Object.freeze({ fieldPath: "image", mediaId: mediaId(media), sourceKey: blockKey(key) });
}

export function globalEntry(id: string, updatedAt: number, image = "media-1") {
  return entry(id, "settings", {
    blocks: [heroBlock(`${id}-block`, image, "Banner")],
    fields: { image, title: "Lace" },
    title: "Site settings",
    updatedAt,
  });
}

export const seoReference = (media: string) =>
  Object.freeze({ fieldPath: "image", mediaId: mediaId(media), sourceKey: "$seo" as const });

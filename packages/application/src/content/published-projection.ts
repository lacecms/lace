import type { JsonObject } from "@lacecms/content";
import { DomainError, type ContentEntry, type BlockKey } from "@lacecms/domain";
import type { PublishedProjection } from "../ports/content.js";

/**
 * Applies a supplied projection to an entry whose draft was copied into its
 * publication. Fails without a result when the projection does not name every
 * draft block exactly once.
 */
export function withPublishedProjection(
  entry: ContentEntry,
  projection: PublishedProjection,
): ContentEntry {
  const published = entry.published;
  if (published === undefined)
    throw new DomainError("CONTENT_INVALID_STATE", "The entry has no publication to project.");
  const data = publishedProjectionBlockData(
    entry.draft.blocks.map((block) => block.key),
    projection,
  );
  return {
    ...entry,
    published: {
      ...published,
      blocks: published.blocks.map((block) => ({ ...block, data: data.get(block.key)! })),
      fields: projection.fields,
    },
  };
}

/** Maps projected block data by key after checking it names exactly the draft's blocks. */
export function publishedProjectionBlockData(
  draftKeys: readonly BlockKey[],
  projection: PublishedProjection,
): ReadonlyMap<BlockKey, JsonObject> {
  const data = new Map(projection.blocks.map((block) => [block.key, block.data]));
  if (
    data.size !== projection.blocks.length ||
    data.size !== draftKeys.length ||
    draftKeys.some((key) => !data.has(key))
  )
    throw new DomainError(
      "CONTENT_INVALID_STATE",
      "The published projection must name every draft block exactly once.",
    );
  return data;
}

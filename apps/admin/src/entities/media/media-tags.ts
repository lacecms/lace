import { normalizeMediaTag } from "@lacecms/contracts";

/** The API's tag limit per media item. */
export const MAX_MEDIA_TAGS_PER_ITEM = 20;
/** The API's limit of tags combined in one list filter. */
export const MAX_MEDIA_TAG_FILTERS = 5;

/**
 * A tag filter from untrusted input (a URL value or local state): valid tags
 * only, normalized, deduplicated, sorted, and limited to the first five, or
 * `undefined` when none remain so equivalent filters share one URL.
 */
export function canonicalTagFilter(value: unknown): readonly string[] | undefined {
  const values = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  const tags = new Set<string>();
  for (const item of values) {
    const tag = normalizeMediaTag(item);
    if (tag !== undefined) tags.add(tag);
  }
  const sorted = [...tags].sort().slice(0, MAX_MEDIA_TAG_FILTERS);
  return sorted.length > 0 ? sorted : undefined;
}

/** Tags of one item as a sorted, duplicate-free list. */
export function sortedTags(tags: readonly string[]): readonly string[] {
  return [...new Set(tags)].sort();
}

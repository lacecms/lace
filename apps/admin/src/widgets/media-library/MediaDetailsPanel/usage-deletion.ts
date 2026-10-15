import type { MediaUsageEntryDto } from "@lacecms/contracts";

/** A using entry whose published version still uses the media. */
export interface PublishedUsage {
  readonly entry: MediaUsageEntryDto;
  /** True when the draft no longer uses the media, so publishing releases it. */
  readonly releasedByPublishing: boolean;
}

/** How the details panel may offer deletion of an item, decided from its loaded usage. */
export type UsageDeletion =
  | { readonly kind: "unused" }
  | { readonly kind: "unknown" }
  | { readonly entries: readonly PublishedUsage[]; readonly kind: "published" }
  | { readonly kind: "truncated" }
  | { readonly entries: readonly MediaUsageEntryDto[]; readonly kind: "drafts" };

/**
 * Deletion is ordinary for unused media. Used media may be detached from drafts
 * only when every using entry is listed and no published version uses it.
 */
export function usageDeletion(
  usageCount: number,
  usage: readonly MediaUsageEntryDto[] | undefined,
): UsageDeletion {
  if (usageCount === 0) return { kind: "unused" };
  if (usage === undefined) return { kind: "unknown" };
  const published = usage.flatMap((entry) => {
    const states = entry.locations.flatMap((location) => location.states);
    return states.includes("published")
      ? [{ entry, releasedByPublishing: !states.includes("draft") }]
      : [];
  });
  if (published.length > 0) return { entries: published, kind: "published" };
  if (usageCount > usage.length) return { kind: "truncated" };
  return { entries: usage, kind: "drafts" };
}

import type { StoredContentModelState, SnapshotStateCounts, SnapshotHolders } from "./types.js";

export function hasSnapshots(model: StoredContentModelState): boolean {
  return model.draftSnapshotCount > 0 || model.publishedSnapshotCount > 0;
}

export function snapshotDescription(model: StoredContentModelState): string {
  const states: string[] = [];
  if (model.draftSnapshotCount > 0) states.push(`draft=${model.draftSnapshotCount}`);
  if (model.publishedSnapshotCount > 0) states.push(`published=${model.publishedSnapshotCount}`);
  return states.join(", ");
}

export function countsDescription(counts: SnapshotStateCounts): string {
  return `draft=${counts.draft}, published=${counts.published}`;
}

export function total(counts: SnapshotStateCounts | undefined): number {
  return counts === undefined ? 0 : counts.draft + counts.published;
}

/** Draft and published counts of holder evidence, without the named snapshots. */
export function holderCounts(
  holders: SnapshotHolders | undefined,
): SnapshotStateCounts | undefined {
  return holders === undefined
    ? undefined
    : Object.freeze({ draft: holders.draft, published: holders.published });
}

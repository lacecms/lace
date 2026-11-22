import type { CursorPage } from "@lacecms/application";
import type { ContentEntry, MediaMetadata } from "@lacecms/domain";
import type { BlockRow } from "../content/blocks.js";
import type { ContentModelResolver } from "../content/entries.js";
import { hydrateEntries, storedSnapshots } from "../content/snapshots.js";
import type { SnapshotRow } from "../content/snapshots.js";
import { encodeCursor } from "../shared/cursors.js";
import { failure } from "../shared/failures.js";
import { publicContentEntry, publicSnapshotMedia } from "./public.js";
import type { PublicGlobalRow } from "./public.js";
import type { PublicSelection } from "./public-selection.js";

interface CandidateRow {
  readonly id: string;
  readonly model_key: string;
  readonly path?: string;
  readonly published_snapshot_id: string;
  readonly published_created_at: number;
}

type ProjectionRow = PublicGlobalRow & Pick<CandidateRow, "path">;
export type PublicProjector<T> = (
  row: ProjectionRow,
  entries: ReadonlyMap<string, ContentEntry>,
  media: ReadonlyMap<string, readonly MediaMetadata[]>,
) => T;

export const routedPublicContent: PublicProjector<ReturnType<typeof publicContentEntry>> = (
  row,
  entries,
  media,
) => {
  if (row.path === undefined) failure("Public routed entry is missing its path.");
  return publicContentEntry({ ...row, path: row.path }, entries, media);
};

export function assemblePublicPage<T>(
  selection: PublicSelection,
  [candidateRows, snapshotRows, blockRows, mediaRows]: readonly (readonly unknown[])[],
  resolveModel: ContentModelResolver,
  project: PublicProjector<T>,
): CursorPage<T> {
  const candidates = candidateRows as readonly CandidateRow[];
  const snapshots = snapshotRows as readonly (SnapshotRow & {
    readonly internal_links_json: string;
  })[];
  const links = new Map(snapshots.map((row) => [row.id, row.internal_links_json]));
  const page = candidates.slice(0, selection.limit).map((candidate) => {
    const internalLinks = links.get(candidate.published_snapshot_id);
    if (internalLinks === undefined) failure("Content entry published snapshot is missing.");
    return {
      ...candidate,
      // The public projection fills the internal draft slot with published values.
      draft_snapshot_id: candidate.published_snapshot_id,
      internal_links_json: internalLinks,
    };
  });
  const entries = hydrateEntries(
    page,
    storedSnapshots(snapshots, blockRows as readonly BlockRow[]),
    resolveModel,
  );
  const media = publicSnapshotMedia(mediaRows as readonly Record<string, unknown>[]);
  const last = page.at(-1);
  return Object.freeze({
    items: Object.freeze(page.map((row) => project(row, entries, media))),
    ...(selection.cursorKind !== undefined && candidates.length > selection.limit && last
      ? { nextCursor: encodeCursor(selection.cursorKind, last.published_created_at, last.id) }
      : {}),
  });
}

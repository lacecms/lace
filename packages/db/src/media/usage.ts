import type { MediaUsageEntry, MediaUsageLocation, MediaUsageState } from "@lacecms/application";
import { blockKey, contentEntryId, contentModelKey } from "@lacecms/domain";
import { ENTRY_STATUS_SQL, entryStatus } from "../content/entries.js";

export interface MediaUsageRow {
  readonly block_type: string | null;
  readonly entry_id: string;
  readonly field_path: string;
  readonly model_key: string;
  readonly position: number | null;
  readonly slug: string | null;
  readonly source_key: string;
  readonly state: MediaUsageState;
  readonly status: string;
  readonly title: string;
}

/** Binds media ID, entry limit, and media ID. */
export const MEDIA_USAGE_SQL = `with used as (
   select distinct s.entry_id
     from content_media_references r
     join content_snapshots s on s.id = r.snapshot_id
    where r.media_id = ?
 ), page as (
   select e.id
     from content_entries e
     join used on used.entry_id = e.id
    order by e.updated_at desc, e.id desc
    limit ?
 )
 select e.id as entry_id, e.model_key, d.title, d.slug,
        ${ENTRY_STATUS_SQL} as status,
        case when r.snapshot_id = e.draft_snapshot_id then 'draft' else 'published' end as state,
        r.source_key, r.field_path, b.block_type, b.position
   from content_media_references r
   join content_snapshots s on s.id = r.snapshot_id
   join content_entries e on e.id = s.entry_id
   join content_snapshots d on d.id = e.draft_snapshot_id
   left join content_snapshots p on p.id = e.published_snapshot_id
   left join content_blocks b on b.snapshot_id = r.snapshot_id and b.block_key = r.source_key
  where r.media_id = ? and e.id in (select id from page)
  order by e.updated_at desc, e.id desc`;

interface MediaUsageLocationDraft {
  readonly blockKey?: string;
  blockType?: string;
  readonly field: string;
  position: number;
  readonly seo?: true;
  readonly states: Set<MediaUsageState>;
}

function usageLocationRank(location: MediaUsageLocationDraft): number {
  return location.blockKey !== undefined ? 2 : location.seo === true ? 1 : 0;
}

/** Orders usage locations: entry fields by name, the SEO image, then blocks by position and key. */
function compareUsageLocations(
  left: MediaUsageLocationDraft,
  right: MediaUsageLocationDraft,
): number {
  const rank = usageLocationRank(left) - usageLocationRank(right);
  if (rank !== 0) return rank;
  if (left.position !== right.position) return left.position - right.position;
  const leftKey = `${left.blockKey ?? ""}\u0000${left.field}`;
  const rightKey = `${right.blockKey ?? ""}\u0000${right.field}`;
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function usageStates(states: ReadonlySet<MediaUsageState>): readonly MediaUsageState[] {
  return Object.freeze((["draft", "published"] as const).filter((state) => states.has(state)));
}

/** Groups `MEDIA_USAGE_SQL` rows into ordered per-entry usage locations. */
export function mediaUsageEntries(rows: readonly MediaUsageRow[]): readonly MediaUsageEntry[] {
  const entries = new Map<
    string,
    { readonly locations: Map<string, MediaUsageLocationDraft>; readonly row: MediaUsageRow }
  >();
  for (const row of rows) {
    let entry = entries.get(row.entry_id);
    if (entry === undefined) {
      entry = { locations: new Map(), row };
      entries.set(row.entry_id, entry);
    }
    const isSeo = row.source_key === "$seo";
    const isBlock = !isSeo && row.source_key !== "$fields";
    if (isBlock && (row.block_type === null || row.position === null)) {
      throw new Error("A media reference names a block that does not exist.");
    }
    const key = `${row.source_key}\u0000${row.field_path}`;
    let location = entry.locations.get(key);
    if (location === undefined) {
      location = {
        ...(isBlock ? { blockKey: row.source_key, blockType: row.block_type! } : {}),
        field: row.field_path,
        position: isBlock ? row.position! : 0,
        ...(isSeo ? { seo: true as const } : {}),
        states: new Set(),
      };
      entry.locations.set(key, location);
    } else if (isBlock) {
      // The draft's block type describes what an editor sees now.
      if (row.state === "draft") location.blockType = row.block_type!;
      location.position = Math.min(location.position, row.position!);
    }
    location.states.add(row.state);
  }
  return Object.freeze(
    [...entries.values()].map(({ locations, row }) =>
      Object.freeze({
        entryId: contentEntryId(row.entry_id),
        locations: Object.freeze(
          [...locations.values()].sort(compareUsageLocations).map((location): MediaUsageLocation =>
            location.seo === true
              ? Object.freeze({
                  field: "image" as const,
                  source: "seo" as const,
                  states: usageStates(location.states),
                })
              : location.blockKey === undefined
                ? Object.freeze({
                    field: location.field,
                    source: "field" as const,
                    states: usageStates(location.states),
                  })
                : Object.freeze({
                    blockKey: blockKey(location.blockKey),
                    blockType: location.blockType!,
                    field: location.field,
                    source: "block" as const,
                    states: usageStates(location.states),
                  }),
          ),
        ),
        modelKey: contentModelKey(row.model_key),
        ...(row.slug === null ? {} : { slug: row.slug }),
        status: entryStatus(row.status),
        title: row.title,
      }),
    ),
  );
}

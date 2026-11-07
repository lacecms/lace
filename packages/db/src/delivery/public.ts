import { failure } from "../shared/failures.js";
import type { PublicContentEntry, PublicGlobalContent } from "@lacecms/application";
import type { ContentEntry, MediaMetadata } from "@lacecms/domain";
import type { EntryRow } from "../content/entries.js";
import { MEDIA_COLUMNS_SQL, mediaMetadata } from "../media/catalog.js";

export interface PublicRow extends EntryRow {
  readonly internal_links_json: string;
  readonly path: string;
  readonly published_created_at: number;
}

export interface PublicGlobalRow extends EntryRow {
  readonly internal_links_json: string;
  readonly published_created_at: number;
}

/** Local delivered projection, ordered by exact source location and scoped by snapshot PK. */
export const PUBLIC_INTERNAL_LINKS_JSON_SQL = `(select coalesce(json_group_array(json_object(
  'sourceKey', source_key, 'area', area, 'pointer', field_path, 'targetId', target_entry_id)), '[]')
  from (select source_key,area,field_path,target_entry_id from content_entry_link_references
    where snapshot_id=s.id and delivered=1 order by source_key,area,field_path))`;

export const PUBLIC_ROUTE_SQL = `select e.id, e.model_key, e.draft_snapshot_id, e.published_snapshot_id,
        r.path, s.created_at as published_created_at, ${PUBLIC_INTERNAL_LINKS_JSON_SQL} as internal_links_json
   from published_routes r
   join content_entries e on e.id = r.entry_id and e.published_snapshot_id = r.snapshot_id
   join content_snapshots s on s.id = r.snapshot_id`;

/** Published route-less globals; never joins `published_routes`. */
export const PUBLIC_GLOBAL_SQL = `select e.id, e.model_key, e.draft_snapshot_id, e.published_snapshot_id,
        s.created_at as published_created_at, ${PUBLIC_INTERNAL_LINKS_JSON_SQL} as internal_links_json
   from content_entries e
   join content_models m on m.key = e.model_key and m.kind = 'global'
   join content_snapshots s on s.id = e.published_snapshot_id`;

/**
 * Excludes a reference `r` held by a hidden block, which is never delivered;
 * `$fields` and `$seo` never match a block key.
 */
export const DELIVERED_REFERENCE_SQL = `not exists (select 1 from content_blocks b
                    where b.snapshot_id = r.snapshot_id and b.block_key = r.source_key
                      and b.hidden = 1)`;

export const PUBLIC_MEDIA_SQL = `select ${MEDIA_COLUMNS_SQL}
   from media m
  where m.id = ? and exists (
    select 1 from content_media_references r
    join content_entries e on e.published_snapshot_id = r.snapshot_id
    where r.media_id = m.id and ${DELIVERED_REFERENCE_SQL}
  ) limit 1`;

/** Active media delivered by the given published snapshots, one row per pair. */
export function publicSnapshotMediaSql(count: number): string {
  return `select distinct r.snapshot_id as public_snapshot_id, ${MEDIA_COLUMNS_SQL}
   from content_media_references r
   join media m on m.id = r.media_id
  where r.snapshot_id in (${Array.from({ length: count }, () => "?").join(", ")})
    and m.status = 'active' and ${DELIVERED_REFERENCE_SQL}
  order by r.snapshot_id asc, m.id asc`;
}

/** Groups `publicSnapshotMediaSql` rows by published snapshot ID. */
export function publicSnapshotMedia(
  rows: readonly Record<string, unknown>[],
): Map<string, readonly MediaMetadata[]> {
  const result = new Map<string, MediaMetadata[]>();
  for (const row of rows) {
    const snapshotId = row.public_snapshot_id;
    if (typeof snapshotId !== "string") failure("Public media snapshot ID is invalid.");
    const items = result.get(snapshotId) ?? [];
    items.push(mediaMetadata(row));
    result.set(snapshotId, items);
  }
  return result;
}

/** Projects a published route row into a public entry with its referenced media. */
export function publicContentEntry(
  row: PublicRow,
  entries: ReadonlyMap<string, ContentEntry>,
  media: ReadonlyMap<string, readonly MediaMetadata[]>,
): PublicContentEntry {
  const entry = entries.get(row.id);
  if (entry === undefined) failure("Published route references an unreadable entry.");
  return Object.freeze({
    entry: publicEntry(entry),
    internalLinks: Object.freeze(JSON.parse(row.internal_links_json)),
    media: Object.freeze([...(media.get(row.published_snapshot_id ?? "") ?? [])]),
    path: row.path,
  });
}

/** Projects a published global row into a public global with its referenced media. */
export function publicGlobalContent(
  row: PublicGlobalRow,
  entries: ReadonlyMap<string, ContentEntry>,
  media: ReadonlyMap<string, readonly MediaMetadata[]>,
): PublicGlobalContent {
  const entry = entries.get(row.id);
  if (entry === undefined) failure("Published global references an unreadable entry.");
  return Object.freeze({
    entry: publicEntry(entry),
    internalLinks: Object.freeze(JSON.parse(row.internal_links_json)),
    media: Object.freeze([...(media.get(row.published_snapshot_id ?? "") ?? [])]),
  });
}

/**
 * Public projections cannot disclose the independently mutable draft snapshot
 * or hidden blocks, which stay stored but are never delivered.
 */
export function publicEntry(entry: ContentEntry): ContentEntry {
  if (entry.published === undefined) failure("Public entry is missing its published snapshot.");
  const published = Object.freeze({
    ...entry.published,
    blocks: Object.freeze(entry.published.blocks.filter((block) => !block.hidden)),
  });
  return Object.freeze({
    draft: Object.freeze({ ...published, state: "draft" as const }),
    id: entry.id,
    model: entry.model,
    published,
  });
}

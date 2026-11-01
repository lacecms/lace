import type { PublishedProjection } from "@lacecms/application";
import { publishedProjectionBlockData } from "@lacecms/application";
import { DomainError } from "@lacecms/domain";
import { INTERNAL_LINK_ROWS_SQL, internalLinkRowsJson } from "./sql-internal-links.js";

/**
 * Bound JSON rowsets of a conditional-field publication projection. Both
 * adapters bind each rowset as one parameter, so statement and bind counts do
 * not grow with the number of blocks or references.
 */
export interface ProjectedPublicationRows {
  /** `[{ key, data }]`, with `data` as stored `data_json` text. */
  readonly blockDataJson: string;
  readonly fieldsJson: string;
  /** `internalLinkRowsJson` of the projected references. */
  readonly internalLinksJson: string;
  /** `[[sourceKey, fieldPath, mediaId]]`. */
  readonly mediaReferencesJson: string;
}

/** Checks a projection against the draft's block keys and encodes its rowsets. */
export function projectedPublicationRows(
  draftBlockKeys: readonly string[],
  projection: PublishedProjection,
): ProjectedPublicationRows {
  const data = publishedProjectionBlockData(
    draftBlockKeys as Parameters<typeof publishedProjectionBlockData>[0],
    projection,
  );
  for (const reference of projection.mediaReferences)
    if (
      typeof reference.sourceKey !== "string" ||
      typeof reference.fieldPath !== "string" ||
      typeof reference.mediaId !== "string" ||
      (reference.sourceKey.startsWith("$")
        ? !["$fields", "$seo"].includes(reference.sourceKey)
        : !data.has(reference.sourceKey as never))
    )
      throw new DomainError("CONTENT_INVALID_STATE", "Invalid published media projection.");
  return {
    blockDataJson: JSON.stringify(
      [...data].map(([key, value]) => ({ key, data: JSON.stringify(value) })),
    ),
    fieldsJson: JSON.stringify(projection.fields),
    internalLinksJson: internalLinkRowsJson(projection.internalLinks),
    mediaReferencesJson: JSON.stringify(
      projection.mediaReferences.map((reference) => [
        reference.sourceKey,
        reference.fieldPath,
        reference.mediaId,
      ]),
    ),
  };
}

/**
 * Copies draft block envelopes with projected data. Parameters: new snapshot,
 * `blockDataJson`, draft snapshot, then `condition`'s.
 */
export function projectedBlocksSql(condition = "1 = 1"): string {
  return `insert into content_blocks (snapshot_id, block_key, block_type, position, schema_version, data_json, anchor, class_name, hidden, settings_json, created_at, updated_at)
  select ?, b.block_key, b.block_type, b.position, b.schema_version, p.value ->> 'data', b.anchor, b.class_name, b.hidden, b.settings_json, b.created_at, b.updated_at
    from content_blocks b join json_each(?) p on p.value ->> 'key' = b.block_key
   where b.snapshot_id = ? and ${condition}`;
}

/**
 * Inserts projected media references. Parameters: new snapshot, creation time,
 * `mediaReferencesJson`, then `condition`'s.
 */
export function projectedMediaReferencesSql(condition = "1 = 1"): string {
  return `insert into content_media_references (snapshot_id, source_key, field_path, media_id, created_at)
  select ?, p.value ->> '$[0]', p.value ->> '$[1]', p.value ->> '$[2]', ?
    from json_each(?) p where ${condition}`;
}

/**
 * Inserts projected internal-link references. Parameters: new snapshot,
 * `internalLinksJson`, then `condition`'s.
 */
export function projectedInternalLinksSql(condition = "1 = 1"): string {
  return `insert into content_entry_link_references (snapshot_id, source_key, area, field_path, target_entry_id, delivered)
  select ?, i.source_key, i.area, i.field_path, i.target_entry_id, i.delivered
    from (${INTERNAL_LINK_ROWS_SQL}) i where ${condition}`;
}

/**
 * Delivered projected links whose target has no published route. Binds
 * `internalLinksJson`, the publishing entry and its candidate path, like
 * `INVALID_PUBLISHED_LINK_TARGETS_SQL` does for stored draft rows.
 */
export const INVALID_PROJECTED_LINK_TARGETS_SQL = `select r.source_key, r.area, r.field_path, r.target_entry_id
  from (${INTERNAL_LINK_ROWS_SQL}) r
  left join content_entries target on target.id=r.target_entry_id
  left join published_routes route on route.entry_id=target.id and route.snapshot_id=target.published_snapshot_id
  where r.delivered=1 and not (r.target_entry_id=? and ? is not null) and route.path is null`;

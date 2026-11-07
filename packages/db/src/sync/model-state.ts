import { failure } from "../shared/failures.js";
import { parseObject } from "../shared/values.js";
import type { StoredContentModelState } from "@lacecms/application";
import { contentModelKey } from "@lacecms/domain";

export interface StoredModelStateRow {
  readonly draft_snapshot_count: number;
  readonly entry_count: number;
  readonly key: string;
  readonly kind: string;
  readonly projection_hash: string;
  readonly public_projection_hash: string | null;
  readonly public_projection_source_hash: string | null;
  readonly published_snapshot_count: number;
  readonly snapshot_fingerprint: string;
  /** Valid structure baseline only; `NULL` when absent or written for another hash. */
  readonly structure_json: string | null;
  readonly structure_hash: string;
  readonly version: number;
}

/** A baseline counts only while it was written for the row's current structural hash. */
const VALID_BASELINE_SQL =
  "case when m.structure_json_hash = m.structure_hash then m.structure_json end";

/**
 * Snapshot count, revision sum, update-time sum, and latest update time of a
 * model's snapshots plus reference projection activity. Saves/publication/deletion
 * are revision guarded; reference counts/timestamps/lengths also detect projection changes.
 */
const SNAPSHOT_FINGERPRINT_SQL = `(select count(*) || ':' || coalesce(sum(s.revision), 0) || ':' ||
          coalesce(sum(s.updated_at), 0) || ':' || coalesce(max(s.updated_at), 0) || ':' ||
          (select count(*) || ':' || coalesce(sum(r.created_at),0) || ':' || coalesce(sum(length(r.source_key)+length(r.field_path)+length(r.media_id)),0)
             from content_media_references r join content_snapshots rs on rs.id=r.snapshot_id
             join content_entries re on re.id=rs.entry_id where re.model_key=m.key)
     from content_snapshots s join content_entries x on x.id = s.entry_id
    where x.model_key = m.key)`;

export const STORED_MODEL_STATE_SQL = `select m.key, m.kind, m.config_version as version, m.structure_hash, m.projection_hash, m.public_projection_hash, m.public_projection_source_hash,
        ${VALID_BASELINE_SQL} as structure_json,
        count(e.id) as entry_count,
        sum(case when e.draft_snapshot_id is null then 0 else 1 end) as draft_snapshot_count,
        sum(case when e.published_snapshot_id is null then 0 else 1 end) as published_snapshot_count,
        ${SNAPSHOT_FINGERPRINT_SQL} as snapshot_fingerprint
   from content_models m
   left join content_entries e on e.model_key = m.key
  group by m.key, m.kind, m.config_version, m.structure_hash, m.projection_hash, m.public_projection_hash, m.public_projection_source_hash,
           m.structure_json, m.structure_json_hash
  order by m.key asc`;

/**
 * Renders the stored synchronization state as one JSON text so a D1 batch can
 * compare it with the state its plan was derived from. Baselines are reduced to
 * their presence; their content is fixed by the structural hash.
 */
export const STORED_MODEL_STATE_JSON_SQL = `(select coalesce(json_group_array(json_array(
    state.key, state.kind, state.version, state.structure_hash, state.projection_hash,
    state.entry_count, state.draft_snapshot_count, state.published_snapshot_count,
    state.structure_json is not null, state.snapshot_fingerprint, state.public_projection_hash, state.public_projection_source_hash)), '[]')
   from (${STORED_MODEL_STATE_SQL}) state)`;

/** Valid structure baselines by model key, read alongside the JSON state on D1. */
export const STORED_MODEL_BASELINES_SQL = `select m.key, ${VALID_BASELINE_SQL} as structure_json
   from content_models m order by m.key asc`;

export function sameStoredModelStates(
  expected: readonly StoredContentModelState[],
  actual: readonly StoredContentModelState[],
): boolean {
  if (expected.length !== actual.length) return false;
  return expected.every((value, index) => {
    const candidate = actual[index];
    return (
      candidate !== undefined &&
      value.key === candidate.key &&
      value.kind === candidate.kind &&
      value.version === candidate.version &&
      value.structureHash === candidate.structureHash &&
      value.projectionHash === candidate.projectionHash &&
      value.publicProjectionHash === candidate.publicProjectionHash &&
      value.publicProjectionSourceHash === candidate.publicProjectionSourceHash &&
      (value.structure === undefined) === (candidate.structure === undefined) &&
      value.snapshotFingerprint === candidate.snapshotFingerprint &&
      value.entryCount === candidate.entryCount &&
      value.draftSnapshotCount === candidate.draftSnapshotCount &&
      value.publishedSnapshotCount === candidate.publishedSnapshotCount
    );
  });
}

export function storedModelStates(
  rows: readonly StoredModelStateRow[],
): readonly StoredContentModelState[] {
  return Object.freeze(
    rows.map((row) => {
      if (row.kind !== "collection" && row.kind !== "global" && row.kind !== "page")
        failure("Stored model kind is invalid.");
      return Object.freeze({
        draftSnapshotCount: row.draft_snapshot_count,
        entryCount: row.entry_count,
        key: contentModelKey(row.key),
        kind: row.kind,
        projectionHash: row.projection_hash,
        ...(row.public_projection_hash == null
          ? {}
          : { publicProjectionHash: row.public_projection_hash }),
        ...(row.public_projection_source_hash == null
          ? {}
          : { publicProjectionSourceHash: row.public_projection_source_hash }),
        publishedSnapshotCount: row.published_snapshot_count,
        snapshotFingerprint: row.snapshot_fingerprint,
        ...(row.structure_json === null
          ? {}
          : { structure: parseObject(row.structure_json, "Model structure baseline") }),
        structureHash: row.structure_hash,
        version: row.version,
      });
    }),
  );
}

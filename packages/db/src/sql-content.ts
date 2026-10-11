/**
 * Runtime-neutral SQLite-dialect helpers shared by the Node SQLite and
 * Cloudflare D1 content repositories. Nothing here executes SQL or uses a
 * Node-only API, so both runtimes map identical rows to identical values.
 */
import {
  actorDisplayName,
  MAX_CONTENT_ENTRY_SEARCH_LENGTH,
  opaqueCursor,
} from "@lacecms/application";
import type {
  ConfigurationSyncContentWrite,
  ContentEntryListValues,
  ContentEntrySort,
  ContentEntryStatus,
  ContentEntryStatusTotals,
  ContentEntrySummary,
  ListContentEntriesInput,
  ListMediaInput,
  MediaCatalogItem,
  MediaSort,
  MediaUsageEntry,
  MediaUsageLocation,
  MediaUsageState,
  ConfigurationSyncMediaReference,
  ConfigurationSyncMigrationBlock,
  ConfigurationSyncMigrationPage,
  ConfigurationSyncMigrationSnapshot,
  ConfigurationSyncMigrationTarget,
  ConfigurationSyncSnapshot,
  ConfigurationSyncSnapshotMigration,
  ConfigurationSyncSnapshotPage,
  SiteBuildRecord,
  StoredContentModelState,
  TrackedSiteBuildCheck,
} from "@lacecms/application";
import { MAX_TOP_LEVEL_BLOCKS } from "@lacecms/content";
import type { JsonObject } from "@lacecms/content";
import {
  DomainError,
  normalizeBuildFailure,
  actorId,
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  isSiteBuildProviderStage,
  isSiteBuildStatus,
  normalizeTrackedOutcomeReason,
  retryableSiteBuildStatuses,
  siteBuildId,
  unixMilliseconds,
} from "@lacecms/domain";
import type {
  Actor,
  ContentBlock,
  ContentEntry,
  ContentModelRoute,
  DraftSnapshot,
  MediaMetadata,
  PublishedSnapshot,
  Role,
  SiteBuildProviderStage,
  TrackedSiteBuildOutcome,
} from "@lacecms/domain";

// Web-platform globals available in both Node and Workers; this package compiles
// against ES2024 only, so declare the narrow surface it uses.
declare function atob(data: string): string;
declare function btoa(data: string): string;
declare const TextDecoder: new () => { decode(input: Uint8Array): string };
declare const TextEncoder: new () => { encode(input: string): Uint8Array };

export const SQL_CURSOR_VERSION = 1;
export const SQL_SORT_CURSOR_VERSION = 2;
export const SQL_MAX_PAGE_SIZE = 100;
export const SQL_MAX_MEDIA_FILENAME_LENGTH = 255;
/** Architecture caps that keep one complete draft within one D1 batch. */
export const SQL_MAX_DRAFT_BLOCKS = MAX_TOP_LEVEL_BLOCKS;
export const SQL_MAX_DRAFT_MEDIA_REFERENCES = 200;
export const PUBLICATION_IDEMPOTENCY_TTL_MS = 86_400_000;

/** Maps the current runtime configuration to a persisted content-model identity. */
export type ContentModelResolver = (key: string) => ContentModelRoute | undefined;

/** Literal SQL list of closed status values; never built from input. */
function statusListSql(statuses: readonly string[]): string {
  return `(${statuses.map((status) => `'${status}'`).join(", ")})`;
}

/** Statuses an administrator may retry from. */
export const RETRYABLE_SITE_BUILD_STATUS_SQL = statusListSql(retryableSiteBuildStatuses);
/** A claim may (re)start only a queued or orphaned in-progress row. */
export const CLAIMABLE_SITE_BUILD_STATUS_SQL = statusListSql(["pending", "running"]);
export const RETRYABLE_SITE_BUILD_REFUSAL =
  "Only a failed, cancelled, unknown, or accepted build can be retried.";

/** Provider deployment references are bounded opaque identifiers. */
export function assertProviderBuildId(value: string): void {
  if (value.length === 0 || value.length > 200)
    throw new TypeError("Provider build ID is invalid.");
}

/** Stored error for a tracked outcome: only a reason from that outcome's closed vocabulary. */
export function trackedOutcomeError(
  outcome: TrackedSiteBuildOutcome,
  reason: string | undefined,
): string | null {
  return normalizeTrackedOutcomeReason(outcome, reason) ?? null;
}

/** Bounds one tracking-check claim and its lease. */
export function assertTrackingClaim(input: { readonly limit: number; readonly leaseMs: number }) {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 25)
    throw new TypeError("Tracking claim limit is invalid.");
  if (!Number.isSafeInteger(input.leaseMs) || input.leaseMs < 1 || input.leaseMs > 3_600_000)
    throw new TypeError("Tracking lease is invalid.");
}

/** Due tracked builds in next-check order; the tracking start is the event completion. */
export const DUE_TRACKED_SITE_BUILDS_SQL = `select b.id, b.provider_build_id, b.provider_checked_at, b.provider_check_after, e.processed_at
  from site_builds b
  join outbox_events e on e.id = b.id
 where b.status = 'running'
   and b.provider_build_id is not null
   and b.provider_check_after is not null
   and b.provider_check_after <= ?
   and e.processed_at is not null
 order by b.provider_check_after asc, b.id asc
 limit ?`;

export interface DueTrackedSiteBuildRow {
  readonly id: string;
  readonly provider_build_id: string;
  readonly provider_checked_at: number | null;
  readonly provider_check_after: number;
  readonly processed_at: number;
}

/** Leases one selected check: guarded by provider ID, status and the selected due time. */
export const LEASE_TRACKED_SITE_BUILD_SQL =
  "update site_builds set provider_check_after = ? where id = ? and status = 'running' and provider_build_id = ? and provider_check_after = ?";

export function trackedSiteBuildCheck(row: DueTrackedSiteBuildRow): TrackedSiteBuildCheck {
  return Object.freeze({
    buildId: siteBuildId(row.id),
    providerBuildId: row.provider_build_id,
    trackingStartedAt: unixMilliseconds(row.processed_at),
    ...(row.provider_checked_at === null
      ? {}
      : { lastCheckedAt: unixMilliseconds(row.provider_checked_at) }),
  });
}

/** Records a check of a still-running tracked build; the stage variant marks a successful read. */
export function trackedSiteBuildCheckUpdate(input: {
  readonly buildId: string;
  readonly providerBuildId: string;
  readonly now: number;
  readonly checkAfter: number;
  readonly stage?: SiteBuildProviderStage;
}): { readonly sql: string; readonly params: readonly (number | string)[] } {
  if (input.stage !== undefined && !isSiteBuildProviderStage(input.stage))
    throw new TypeError("Provider stage is invalid.");
  return input.stage === undefined
    ? {
        params: [input.checkAfter, input.buildId, input.providerBuildId],
        sql: "update site_builds set provider_check_after = ? where id = ? and status = 'running' and provider_build_id = ?",
      }
    : {
        params: [input.checkAfter, input.stage, input.now, input.buildId, input.providerBuildId],
        sql: "update site_builds set provider_check_after = ?, provider_stage = ?, provider_checked_at = ? where id = ? and status = 'running' and provider_build_id = ?",
      };
}

/** Columns a tracked completion writes; a stage also records the last successful check. */
export function trackedCompletionStage(
  stage: SiteBuildProviderStage | undefined,
  now: number,
): readonly [string | null, number | null] {
  if (stage !== undefined && !isSiteBuildProviderStage(stage))
    throw new TypeError("Provider stage is invalid.");
  return stage === undefined ? [null, null] : [stage, now];
}

export interface SiteBuildRow {
  readonly id: string;
  readonly reason: string;
  readonly status: SiteBuildRecord["status"];
  readonly target_version: number;
  readonly requested_by: string;
  readonly requested_at: number;
  readonly started_at: number | null;
  readonly completed_at: number | null;
  readonly provider_build_id: string | null;
  readonly error: string | null;
  readonly provider_stage?: string | null;
  readonly provider_checked_at?: number | null;
  readonly provider_check_after?: number | null;
}

export interface EntryRow {
  readonly draft_snapshot_id: string | null;
  readonly id: string;
  readonly model_key: string;
  readonly published_snapshot_id: string | null;
}

export interface OutboxRow {
  readonly attempts: number;
  readonly available_at: number;
  readonly id: string;
  readonly payload_json: string;
  readonly type: string;
}

export interface SnapshotRow {
  readonly created_at: number;
  readonly entry_id: string;
  readonly fields_json: string;
  readonly id: string;
  readonly revision: number;
  readonly role: string | null;
  readonly schema_version: number;
  readonly slug: string | null;
  readonly title: string;
  readonly updated_at: number;
  readonly updated_by: string;
}

export interface BlockRow {
  readonly block_key: string;
  readonly block_type: string;
  readonly created_at: number;
  readonly data_json: string;
  readonly position: number;
  readonly schema_version: number;
  readonly snapshot_id: string;
  readonly updated_at: number;
}

export interface StoredSnapshot {
  readonly blocks: readonly ContentBlock[];
  readonly createdAt: number;
  readonly entryId: string;
  readonly fields: JsonObject;
  readonly id: string;
  readonly revision: number;
  readonly slug?: string;
  readonly title: string;
  readonly updatedAt: number;
  readonly updatedBy: Actor;
}

export interface SummaryRow {
  readonly draft_revision: number;
  readonly fields_json: string;
  readonly id: string;
  readonly model_key: string;
  readonly published_at: number | null;
  readonly published_snapshot_id: string | null;
  readonly slug: string | null;
  readonly sort_value: number | string;
  readonly status: string;
  readonly title: string;
  readonly updated_at: number;
  readonly updated_by: string;
  readonly updated_by_name: string | null;
}

export interface TotalsRow {
  readonly changed_count: number | null;
  readonly draft_count: number | null;
  readonly published_count: number | null;
  readonly total_count: number;
}

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

export interface PublicRow extends EntryRow {
  readonly path: string;
  readonly published_created_at: number;
}

export interface StoredModelStateRow {
  readonly draft_snapshot_count: number;
  readonly entry_count: number;
  readonly key: string;
  readonly kind: string;
  readonly projection_hash: string;
  readonly published_snapshot_count: number;
  readonly snapshot_fingerprint: string;
  /** Valid structure baseline only; `NULL` when absent or written for another hash. */
  readonly structure_json: string | null;
  readonly structure_hash: string;
  readonly version: number;
}

export interface SyncSnapshotRow {
  readonly entry_id: string;
  readonly fields_json: string;
  readonly id: string;
  readonly revision: number;
  readonly state: string;
  readonly title: string;
}

export interface SyncBlockRow {
  readonly block_key: string;
  readonly block_type: string;
  readonly schema_version: number;
  readonly snapshot_id: string;
}

export interface DecodedCursor {
  readonly id: string;
  readonly timestamp: number;
}

export interface DecodedSortCursor {
  readonly id: string;
  readonly value: number | string;
}

export interface SortSql {
  readonly order: string;
  readonly value: string;
}

export const ENTRY_SOURCE_SQL = `content_entries e
  join content_snapshots d on d.id = e.draft_snapshot_id
  left join content_snapshots p on p.id = e.published_snapshot_id`;
export const ENTRY_STATUS_SQL = `case when e.published_snapshot_id is null then 'draft'
  when p.revision = d.revision then 'published' else 'changed' end`;
export const ENTRY_SEARCH_SQL =
  "(instr(lower(d.title), ?) > 0 or instr(coalesce(d.slug, ''), ?) > 0)";
export const ENTRY_SORT_SQL: Readonly<Record<string, SortSql>> = {
  publishedAt: { order: "coalesce(p.created_at, -1)", value: "coalesce(p.created_at, -1)" },
  title: { order: "d.title collate nocase", value: "d.title" },
  updatedAt: { order: "e.updated_at", value: "e.updated_at" },
};
export const ENTRY_COLUMNS_SQL =
  "select id, model_key, draft_snapshot_id, published_snapshot_id from content_entries";
export const MEDIA_COLUMNS_SQL =
  "m.id, m.storage_key, m.filename, m.mime_type, m.size, m.width, m.height, m.status, m.created_by, m.created_at, m.updated_at";
/** Distinct entries whose current draft or published snapshot references the media row `m`. */
export const MEDIA_USAGE_COUNT_SQL = `(select count(distinct s.entry_id)
  from content_media_references r
  join content_snapshots s on s.id = r.snapshot_id
  where r.media_id = m.id)`;
export const MEDIA_CATALOG_SQL = `select ${MEDIA_COLUMNS_SQL}, u.name as created_by_name,
  ${MEDIA_USAGE_COUNT_SQL} as usage_count`;
export const MEDIA_SORT_SQL: Readonly<Record<string, SortSql>> = {
  createdAt: { order: "m.created_at", value: "m.created_at" },
  filename: { order: "m.filename collate nocase", value: "m.filename" },
  size: { order: "m.size", value: "m.size" },
};
export const PUBLIC_ROUTE_SQL = `select e.id, e.model_key, e.draft_snapshot_id, e.published_snapshot_id,
        r.path, s.created_at as published_created_at
   from published_routes r
   join content_entries e on e.id = r.entry_id and e.published_snapshot_id = r.snapshot_id
   join content_snapshots s on s.id = r.snapshot_id`;
export const PUBLIC_MEDIA_SQL = `select ${MEDIA_COLUMNS_SQL}
   from media m
  where m.id = ? and exists (
    select 1 from content_media_references r
    join content_entries e on e.published_snapshot_id = r.snapshot_id
    where r.media_id = m.id
  ) limit 1`;
export const MEDIA_BY_ID_SQL = `select ${MEDIA_COLUMNS_SQL} from media m where m.id = ? limit 1`;
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
/** A baseline counts only while it was written for the row's current structural hash. */
const VALID_BASELINE_SQL =
  "case when m.structure_json_hash = m.structure_hash then m.structure_json end";
/**
 * Snapshot count, revision sum, update-time sum, and latest update time of a
 * model's snapshots. Every save, publication, and deletion changes it.
 */
const SNAPSHOT_FINGERPRINT_SQL = `(select count(*) || ':' || coalesce(sum(s.revision), 0) || ':' ||
          coalesce(sum(s.updated_at), 0) || ':' || coalesce(max(s.updated_at), 0)
     from content_snapshots s join content_entries x on x.id = s.entry_id
    where x.model_key = m.key)`;
export const STORED_MODEL_STATE_SQL = `select m.key, m.kind, m.config_version as version, m.structure_hash, m.projection_hash,
        ${VALID_BASELINE_SQL} as structure_json,
        count(e.id) as entry_count,
        sum(case when e.draft_snapshot_id is null then 0 else 1 end) as draft_snapshot_count,
        sum(case when e.published_snapshot_id is null then 0 else 1 end) as published_snapshot_count,
        ${SNAPSHOT_FINGERPRINT_SQL} as snapshot_fingerprint
   from content_models m
   left join content_entries e on e.model_key = m.key
  group by m.key, m.kind, m.config_version, m.structure_hash, m.projection_hash,
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
    state.structure_json is not null, state.snapshot_fingerprint)), '[]')
   from (${STORED_MODEL_STATE_SQL}) state)`;
/** Valid structure baselines by model key, read alongside the JSON state on D1. */
export const STORED_MODEL_BASELINES_SQL = `select m.key, ${VALID_BASELINE_SQL} as structure_json
   from content_models m order by m.key asc`;
/** Binds model key, exclusive snapshot-ID cursor, and page limit. */
export const SYNC_SNAPSHOTS_SQL = `select s.id, s.entry_id, s.revision, s.title, s.fields_json,
        case when e.published_snapshot_id = s.id then 'published' else 'draft' end as state
   from content_snapshots s
   join content_entries e on e.id = s.entry_id
  where e.model_key = ? and (s.id = e.draft_snapshot_id or s.id = e.published_snapshot_id)
    and s.id > ?
  order by s.id asc
  limit ?`;
/** Block summaries for a list of snapshot IDs; append the placeholders. */
export const SYNC_BLOCKS_SQL =
  "select snapshot_id, block_key, block_type, schema_version from content_blocks where snapshot_id in";
const BACKFILL_FIELD_KEY = /^[A-Za-z][A-Za-z0-9]*$/u;

/**
 * Set-based default backfill for one field of one model. Binds the default as
 * JSON text and the model key; rows that already hold the key are untouched.
 */
export function backfillFieldSql(fieldKey: string): string {
  if (!BACKFILL_FIELD_KEY.test(fieldKey)) failure("Backfill field key is invalid.");
  return `update content_snapshots set fields_json = json_set(fields_json, '$.${fieldKey}', json(?))
   where entry_id in (select id from content_entries where model_key = ?)
     and json_type(fields_json, '$.${fieldKey}') is null`;
}

function syncFieldPath(fieldKey: string): string {
  if (!BACKFILL_FIELD_KEY.test(fieldKey)) failure("Synchronization field key is invalid.");
  return `'$.${fieldKey}'`;
}

/** One parameterized statement of a synchronization content write. */
export interface ConfigurationSyncWriteStatement {
  readonly params: readonly (number | string)[];
  readonly sql: string;
}

const MODEL_ENTRY_IDS_SQL = "select id from content_entries where model_key = ?";
const MODEL_SNAPSHOT_IDS_SQL = `select s.id from content_snapshots s
     join content_entries e on e.id = s.entry_id where e.model_key = ?`;

/**
 * Set-based statements for one synchronization content write of one model.
 * Every statement ends in a `where` clause so a D1 batch can append its guard.
 * Field keys are checked before they are interpolated into JSON paths; block
 * types, field keys used as values and the model key are bound.
 */
export function configurationSyncWriteStatements(
  write: ConfigurationSyncContentWrite,
  modelKey: string,
): readonly ConfigurationSyncWriteStatement[] {
  switch (write.action) {
    case "rename-field": {
      const from = syncFieldPath(write.from);
      const to = syncFieldPath(write.to);
      return [
        {
          // `->` keeps the JSON representation of every value type.
          params: [modelKey],
          sql: `update content_snapshots
     set fields_json = json_remove(json_set(fields_json, ${to}, json(fields_json -> ${from})), ${from})
   where entry_id in (${MODEL_ENTRY_IDS_SQL}) and json_type(fields_json, ${from}) is not null`,
        },
        {
          params: [write.to, write.from, modelKey],
          sql: `update content_media_references set field_path = ?
   where source_key = '$fields' and field_path = ? and snapshot_id in (${MODEL_SNAPSHOT_IDS_SQL})`,
        },
      ];
    }
    case "remove-field": {
      const path = syncFieldPath(write.fieldKey);
      return [
        {
          params: [modelKey],
          sql: `update content_snapshots set fields_json = json_remove(fields_json, ${path})
   where entry_id in (${MODEL_ENTRY_IDS_SQL}) and json_type(fields_json, ${path}) is not null`,
        },
        {
          params: [write.fieldKey, modelKey],
          sql: `delete from content_media_references
   where source_key = '$fields' and field_path = ? and snapshot_id in (${MODEL_SNAPSHOT_IDS_SQL})`,
        },
      ];
    }
    case "remove-block-type":
      return [
        {
          params: [modelKey, write.blockType],
          sql: `delete from content_media_references
   where snapshot_id in (${MODEL_SNAPSHOT_IDS_SQL})
     and exists (select 1 from content_blocks b
                  where b.snapshot_id = content_media_references.snapshot_id
                    and b.block_key = content_media_references.source_key
                    and b.block_type = ?)`,
        },
        {
          params: [write.blockType, modelKey],
          sql: `delete from content_blocks
   where block_type = ? and snapshot_id in (${MODEL_SNAPSHOT_IDS_SQL})`,
        },
      ];
    case "backfill-field":
      return [{ params: [write.json, modelKey], sql: backfillFieldSql(write.fieldKey) }];
  }
}

/** Maps one scan page of snapshot and block rows to portable values. */
export function syncSnapshotPage(
  rows: readonly SyncSnapshotRow[],
  blockRows: readonly SyncBlockRow[],
  limit: number,
): ConfigurationSyncSnapshotPage {
  const blocks = new Map<string, { key: string; schemaVersion: number; type: string }[]>();
  for (const row of blockRows) {
    const list = blocks.get(row.snapshot_id) ?? [];
    list.push({ key: row.block_key, schemaVersion: row.schema_version, type: row.block_type });
    blocks.set(row.snapshot_id, list);
  }
  const items: ConfigurationSyncSnapshot[] = rows.map((row) =>
    Object.freeze({
      blocks: Object.freeze(blocks.get(row.id) ?? []),
      entryId: row.entry_id,
      fields: parseObject(row.fields_json, "Snapshot fields"),
      revision: row.revision,
      snapshotId: row.id,
      state: row.state === "published" ? "published" : "draft",
      title: row.title,
    }),
  );
  const last = rows.at(-1);
  return Object.freeze({
    items: Object.freeze(items),
    ...(rows.length === limit && last !== undefined ? { next: last.id } : {}),
  });
}
/**
 * Entries of one model holding a block of a target type at another schema
 * version. Binds model key, target JSON (`[[type, version], …]`), exclusive
 * entry-ID cursor and page limit.
 */
export const SYNC_MIGRATION_ENTRIES_SQL = `select e.id, e.draft_snapshot_id, e.published_snapshot_id
   from content_entries e
  where e.model_key = ?
    and exists (select 1 from content_blocks b, json_each(?) t
                 where b.snapshot_id in (e.draft_snapshot_id, e.published_snapshot_id)
                   and b.block_type = t.value ->> 0 and b.schema_version <> t.value ->> 1)
    and e.id > ?
  order by e.id asc
  limit ?`;
/** Snapshot heads for a list of snapshot IDs; append the placeholders. */
export const SYNC_MIGRATION_SNAPSHOTS_SQL =
  "select id, revision, title from content_snapshots where id in";
/**
 * Blocks of a list of snapshot IDs with data only for target types. Binds the
 * target type JSON array first; append the snapshot placeholders and the order.
 */
export const SYNC_MIGRATION_BLOCKS_SQL = `select snapshot_id, block_key, block_type, position, schema_version,
        case when block_type in (select value from json_each(?)) then data_json end as data_json
   from content_blocks where snapshot_id in`;
/** Media references of a list of snapshot IDs; append the placeholders. */
export const SYNC_MIGRATION_REFERENCES_SQL =
  "select snapshot_id, source_key, field_path, media_id from content_media_references where snapshot_id in";

export interface SyncMigrationEntryRow {
  readonly draft_snapshot_id: string | null;
  readonly id: string;
  readonly published_snapshot_id: string | null;
}

export interface SyncMigrationSnapshotRow {
  readonly id: string;
  readonly revision: number;
  readonly title: string;
}

export interface SyncMigrationBlockRow {
  readonly block_key: string;
  readonly block_type: string;
  readonly data_json: string | null;
  readonly position: number;
  readonly schema_version: number;
  readonly snapshot_id: string;
}

export interface SyncMigrationReferenceRow {
  readonly field_path: string;
  readonly media_id: string;
  readonly snapshot_id: string;
  readonly source_key: string;
}

/** Largest migration scan page either adapter serves. */
export const SQL_MAX_MIGRATION_PAGE_SIZE = 50;

export function assertMigrationPageSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > SQL_MAX_MIGRATION_PAGE_SIZE) {
    failure(`Migration page size must be between 1 and ${SQL_MAX_MIGRATION_PAGE_SIZE}.`);
  }
  return value;
}

/** The stale-plan failure raised when a block-migration guard no longer holds. */
export function staleBlockMigration(): never {
  failure("Block migration guard failed; the synchronization plan is stale.");
}

/** Bound JSON of migration targets for {@link SYNC_MIGRATION_ENTRIES_SQL}. */
export function syncMigrationTargetsJson(
  targets: readonly ConfigurationSyncMigrationTarget[],
): string {
  return JSON.stringify(targets.map((target) => [target.type, target.version]));
}

/** Snapshot IDs referenced by migration entry rows, in row order. */
export function syncMigrationSnapshotIds(rows: readonly SyncMigrationEntryRow[]): string[] {
  return rows.flatMap((row) =>
    [row.draft_snapshot_id, row.published_snapshot_id].filter((id): id is string => id !== null),
  );
}

/** Maps one migration scan page of entry, snapshot, block and reference rows. */
export function syncMigrationPage(
  rows: readonly SyncMigrationEntryRow[],
  snapshotRows: readonly SyncMigrationSnapshotRow[],
  blockRows: readonly SyncMigrationBlockRow[],
  referenceRows: readonly SyncMigrationReferenceRow[],
  limit: number,
): ConfigurationSyncMigrationPage {
  const blocks = new Map<string, ConfigurationSyncMigrationBlock[]>();
  for (const row of [...blockRows].sort(
    (left, right) =>
      left.snapshot_id.localeCompare(right.snapshot_id) || left.position - right.position,
  )) {
    const list = blocks.get(row.snapshot_id) ?? [];
    list.push(
      Object.freeze({
        ...(row.data_json === null ? {} : { data: parseObject(row.data_json, "Block data") }),
        key: row.block_key,
        position: row.position,
        schemaVersion: row.schema_version,
        type: row.block_type,
      }),
    );
    blocks.set(row.snapshot_id, list);
  }
  const references = new Map<string, ConfigurationSyncMediaReference[]>();
  for (const row of [...referenceRows].sort(
    (left, right) =>
      left.snapshot_id.localeCompare(right.snapshot_id) ||
      left.source_key.localeCompare(right.source_key) ||
      left.field_path.localeCompare(right.field_path),
  )) {
    const list = references.get(row.snapshot_id) ?? [];
    list.push(
      Object.freeze({
        fieldPath: row.field_path,
        mediaId: row.media_id,
        sourceKey: row.source_key,
      }),
    );
    references.set(row.snapshot_id, list);
  }
  const snapshots = new Map(snapshotRows.map((row) => [row.id, row]));
  const snapshot = (
    id: string | null,
    state: "draft" | "published",
  ): ConfigurationSyncMigrationSnapshot | undefined => {
    const row = id === null ? undefined : snapshots.get(id);
    if (row === undefined) return undefined;
    return Object.freeze({
      blocks: Object.freeze(blocks.get(row.id) ?? []),
      references: Object.freeze(references.get(row.id) ?? []),
      revision: row.revision,
      snapshotId: row.id,
      state,
      title: row.title,
    });
  };
  const items = rows.map((row) => {
    const draft = snapshot(row.draft_snapshot_id, "draft");
    const published = snapshot(row.published_snapshot_id, "published");
    return Object.freeze({
      ...(draft === undefined ? {} : { draft }),
      entryId: row.id,
      ...(published === undefined ? {} : { published }),
    });
  });
  const last = rows.at(-1);
  return Object.freeze({
    items: Object.freeze(items),
    ...(rows.length === limit && last !== undefined ? { next: last.id } : {}),
  });
}

/** Guard condition and ordered writes of one migrated snapshot. */
export interface ConfigurationSyncMigrationStatements {
  /** A boolean SQL expression that holds only while the snapshot is unchanged since the scan. */
  readonly guard: ConfigurationSyncWriteStatement;
  /** Writes that each end in a `where` clause, so a D1 batch can append its guard. */
  readonly writes: readonly ConfigurationSyncWriteStatement[];
}

const MIGRATED_BLOCK_VALUES = 4;
const MIGRATED_REFERENCE_VALUES = 3;

function valueRows(rows: number, width: number): string {
  const tuple = `(${Array.from({ length: width }, () => "?").join(", ")})`;
  return Array.from({ length: rows }, () => tuple).join(", ");
}

/**
 * Guard and in-place writes for one snapshot of a block-migration unit. Each
 * write binds at most `maxParameters` anonymous values in textual order, so a
 * D1 batch can append its guard parameters after them.
 */
export function configurationSyncMigrationStatements(
  migration: ConfigurationSyncSnapshotMigration,
  migratedAt: number,
  maxParameters: number,
): ConfigurationSyncMigrationStatements {
  const current =
    migration.state === "draft" ? "e.draft_snapshot_id = s.id" : "e.published_snapshot_id = s.id";
  const expectedBlocks = JSON.stringify(
    migration.blocks.map((block) => [block.key, block.expectedSchemaVersion]),
  );
  const guardParams: (number | string)[] = [
    migration.snapshotId,
    migration.expectedRevision,
    expectedBlocks,
    migration.snapshotId,
    migration.blocks.length,
  ];
  let guardSql = `(exists (select 1 from content_snapshots s join content_entries e on e.id = s.entry_id
              where s.id = ? and s.revision = ? and ${current})
   and (select count(*) from content_blocks b, json_each(?) j
         where b.snapshot_id = ? and b.block_key = j.value ->> 0
           and b.schema_version = j.value ->> 1) = ?`;
  if (migration.draftGuard !== undefined) {
    guardSql += `
   and exists (select 1 from content_snapshots d join content_entries e on e.draft_snapshot_id = d.id
                where d.id = ? and d.revision = ?)`;
    guardParams.push(migration.draftGuard.snapshotId, migration.draftGuard.revision);
  }
  guardSql += ")";

  const writes: ConfigurationSyncWriteStatement[] = [];
  // Each write also binds the migration time and the snapshot ID.
  const shared = 2;
  const blockRows = Math.floor((maxParameters - shared) / MIGRATED_BLOCK_VALUES);
  for (const group of chunks(migration.blocks, blockRows)) {
    writes.push({
      params: [
        migratedAt,
        ...group.flatMap((block) => [
          block.key,
          block.schemaVersion,
          JSON.stringify(block.data),
          block.expectedSchemaVersion,
        ]),
        migration.snapshotId,
      ],
      sql: `update content_blocks
     set schema_version = v.column2, data_json = v.column3, updated_at = ?
    from (values ${valueRows(group.length, MIGRATED_BLOCK_VALUES)}) as v
   where content_blocks.snapshot_id = ? and content_blocks.block_key = v.column1
     and content_blocks.schema_version = v.column4`,
    });
  }
  writes.push({
    params: [migration.snapshotId, JSON.stringify(migration.blocks.map((block) => block.key))],
    sql: `delete from content_media_references
   where snapshot_id = ? and source_key in (select value from json_each(?))`,
  });
  const referenceRows = Math.floor((maxParameters - shared) / MIGRATED_REFERENCE_VALUES);
  for (const group of chunks(migration.references, referenceRows)) {
    writes.push({
      params: [
        migration.snapshotId,
        migratedAt,
        ...group.flatMap((reference) => [
          reference.sourceKey,
          reference.fieldPath,
          reference.mediaId,
        ]),
      ],
      // A missing or inactive media ID yields NULL and fails the NOT NULL constraint.
      sql: `insert into content_media_references (snapshot_id, source_key, field_path, media_id, created_at)
   select ?, v.column1, v.column2,
          (select m.id from media m where m.id = v.column3 and m.status = 'active'), ?
     from (values ${valueRows(group.length, MIGRATED_REFERENCE_VALUES)}) as v
    where 1 = 1`,
    });
  }
  writes.push(
    migration.updatedBy === undefined
      ? {
          params: [migration.revision, migratedAt, migration.snapshotId],
          sql: "update content_snapshots set revision = ?, updated_at = ? where id = ?",
        }
      : {
          params: [migration.revision, migratedAt, migration.updatedBy, migration.snapshotId],
          sql: "update content_snapshots set revision = ?, updated_at = ?, updated_by = ? where id = ?",
        },
  );
  return Object.freeze({
    guard: { params: guardParams, sql: guardSql },
    writes: Object.freeze(writes),
  });
}
export const SNAPSHOT_COLUMNS_SQL = `select s.id, s.entry_id, s.revision, s.slug, s.title, s.fields_json, s.schema_version,
        s.created_at, s.updated_at, s.updated_by, u.role
   from content_snapshots s left join user u on u.id = s.updated_by`;
export const BLOCK_COLUMNS_SQL =
  "select snapshot_id, block_key, block_type, position, schema_version, data_json, created_at, updated_at from content_blocks";
export const PENDING_SITE_BUILD_SQL =
  "type = 'site.build.requested' and processed_at is null and locked_at is null";

export function failure(message: string): never {
  throw new DomainError("CONTENT_INVALID_STATE", message);
}

export function revisionConflict(message: string): never {
  throw new DomainError("CONTENT_REVISION_CONFLICT", message);
}

export function siteBuildRecord(row: SiteBuildRow): SiteBuildRecord {
  if (!isSiteBuildStatus(row.status)) failure("Stored build status is invalid.");
  return {
    id: siteBuildId(row.id),
    reason: row.reason,
    status: row.status,
    targetVersion: row.target_version,
    requestedBy: row.requested_by,
    requestedAt: unixMilliseconds(row.requested_at),
    ...(row.started_at === null ? {} : { startedAt: unixMilliseconds(row.started_at) }),
    ...(row.completed_at === null ? {} : { completedAt: unixMilliseconds(row.completed_at) }),
    ...(row.provider_build_id === null ? {} : { providerBuildId: row.provider_build_id }),
    ...(isSiteBuildProviderStage(row.provider_stage) ? { providerStage: row.provider_stage } : {}),
    ...(row.provider_checked_at === null || row.provider_checked_at === undefined
      ? {}
      : { providerCheckedAt: unixMilliseconds(row.provider_checked_at) }),
    ...(row.error === null ? {} : buildErrorRecord(row.error)),
  };
}

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
      if (row.kind !== "collection" && row.kind !== "page")
        failure("Stored model kind is invalid.");
      return Object.freeze({
        draftSnapshotCount: row.draft_snapshot_count,
        entryCount: row.entry_count,
        key: contentModelKey(row.key),
        kind: row.kind,
        projectionHash: row.projection_hash,
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

export function assertPageSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > SQL_MAX_PAGE_SIZE) {
    failure(`Page limit must be a positive integer no greater than ${SQL_MAX_PAGE_SIZE}.`);
  }
  return value;
}

export function assertNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    failure(`${label} is invalid.`);
  }
  return value;
}

export function assertTimestamp(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0)
    failure(`${label} must be a UTC millisecond value.`);
  return value;
}

/** Rejects drafts that cannot be persisted in one bounded atomic write. */
export function assertDraftPersistenceBounds(
  blocks: readonly unknown[],
  references: readonly unknown[],
): void {
  if (blocks.length > SQL_MAX_DRAFT_BLOCKS) {
    failure(`A draft must not contain more than ${SQL_MAX_DRAFT_BLOCKS} blocks.`);
  }
  if (references.length > SQL_MAX_DRAFT_MEDIA_REFERENCES) {
    failure(
      `A draft must not contain more than ${SQL_MAX_DRAFT_MEDIA_REFERENCES} media references.`,
    );
  }
}

export function sanitizeDispatchError(value: string): string {
  return (
    value
      .replace(/[\r\n\t]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 160) || "storage_unavailable"
  );
}

export function sanitizeBuildReason(value: string): string {
  return normalizeBuildFailure(value).reason;
}
export function encodeBuildError(reason: string, path?: string): string {
  const failure = normalizeBuildFailure(reason, path);
  return failure.path === undefined ? failure.reason : JSON.stringify(failure);
}
export function buildErrorRecord(value: string): { error: string; errorPath?: string } {
  let failure = normalizeBuildFailure(value);
  if (value.startsWith("{") && value.length <= 1024) {
    try {
      const record: unknown = JSON.parse(value);
      if (record !== null && typeof record === "object" && !Array.isArray(record)) {
        const item = record as Record<string, unknown>;
        if (
          Object.keys(item).every((key) => key === "reason" || key === "path") &&
          typeof item.reason === "string" &&
          (item.path === undefined || typeof item.path === "string")
        )
          failure = normalizeBuildFailure(item.reason, item.path);
      }
    } catch {
      /* malformed stored data never reaches transport */
    }
  }
  return {
    error: failure.reason,
    ...(failure.path === undefined ? {} : { errorPath: failure.path }),
  };
}

export function parseObject(value: string, label: string): JsonObject {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      failure(`${label} must contain a JSON object.`);
    }
    return parsed as JsonObject;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    failure(`${label} contains invalid JSON.`);
  }
}

export function storedRole(value: string | null | undefined): Role {
  return value === "admin" || value === "editor" || value === "viewer" ? value : "viewer";
}

/** Base64url without padding, byte-identical to Node's `Buffer` `base64url` encoding. */
export function encodeBase64Url(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

export function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return new TextDecoder().decode(
    Uint8Array.from(binary, (character: string) => character.charCodeAt(0)),
  );
}

function parseCursorObject(value: string): Record<string, unknown> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) failure("Cursor is not base64url encoded.");
  try {
    const parsed: unknown = JSON.parse(decodeBase64Url(value));
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== 4
    ) {
      failure("Cursor has an invalid shape.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    failure("Cursor contains invalid JSON.");
  }
}

export function encodeCursor(
  kind: string,
  timestamp: number,
  id: string,
): ReturnType<typeof opaqueCursor> {
  return opaqueCursor(
    encodeBase64Url(JSON.stringify({ id, kind, timestamp, version: SQL_CURSOR_VERSION })),
  );
}

export function decodeCursor(value: string, kind: string): DecodedCursor {
  const candidate = parseCursorObject(value);
  if (
    candidate.version !== SQL_CURSOR_VERSION ||
    candidate.kind !== kind ||
    typeof candidate.id !== "string" ||
    candidate.id.length === 0 ||
    typeof candidate.timestamp !== "number"
  ) {
    failure("Cursor is unsupported or belongs to a different list.");
  }
  return { id: candidate.id, timestamp: assertTimestamp(candidate.timestamp, "Cursor timestamp") };
}

export function encodeSortCursor(
  kind: string,
  value: number | string,
  id: string,
): ReturnType<typeof opaqueCursor> {
  return opaqueCursor(
    encodeBase64Url(JSON.stringify({ id, kind, value, version: SQL_SORT_CURSOR_VERSION })),
  );
}

export function decodeSortCursor(
  value: string,
  kind: string,
  validValue: (sortValue: unknown) => boolean,
): DecodedSortCursor {
  const candidate = parseCursorObject(value);
  if (
    candidate.version !== SQL_SORT_CURSOR_VERSION ||
    candidate.kind !== kind ||
    typeof candidate.id !== "string" ||
    candidate.id.length === 0
  ) {
    failure("Cursor is unsupported or belongs to a different list.");
  }
  if (!validValue(candidate.value)) failure("Cursor sort value is invalid.");
  return { id: candidate.id, value: candidate.value as number | string };
}

export function entryCursorKind(input: ListContentEntriesInput): string {
  return JSON.stringify([
    "entries",
    input.modelKey,
    input.sort,
    input.status ?? null,
    input.q ?? null,
  ]);
}

export function decodeEntryCursor(
  value: string,
  kind: string,
  sort: ContentEntrySort,
): DecodedSortCursor {
  return decodeSortCursor(value, kind, (sortValue) =>
    sort.endsWith("title")
      ? typeof sortValue === "string" && sortValue.length <= MAX_CONTENT_ENTRY_SEARCH_LENGTH
      : typeof sortValue === "number" && Number.isSafeInteger(sortValue) && sortValue >= -1,
  );
}

export function mediaCursorKind(input: ListMediaInput): string {
  return JSON.stringify(["media", input.sort, input.type ?? null, input.q ?? null]);
}

export function decodeMediaCursor(value: string, kind: string, sort: MediaSort): DecodedSortCursor {
  return decodeSortCursor(value, kind, (sortValue) =>
    sort.endsWith("filename")
      ? typeof sortValue === "string" && sortValue.length <= SQL_MAX_MEDIA_FILENAME_LENGTH
      : typeof sortValue === "number" && Number.isSafeInteger(sortValue) && sortValue >= 0,
  );
}

export function entryStatus(value: string): ContentEntryStatus {
  if (value === "changed" || value === "draft" || value === "published") return value;
  failure("Entry status is invalid.");
}

function listValues(fieldsJson: string, listFields: readonly string[]): ContentEntryListValues {
  const values: Record<string, boolean | number | string> = {};
  if (listFields.length === 0) return Object.freeze(values);
  const fields = parseObject(fieldsJson, "Snapshot fields");
  for (const key of listFields) {
    const value = Object.hasOwn(fields, key) ? fields[key] : undefined;
    if (
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      values[key] = value;
    }
  }
  return Object.freeze(values);
}

export function entrySummary(row: SummaryRow, listFields: readonly string[]): ContentEntrySummary {
  const status = entryStatus(row.status);
  return Object.freeze({
    draftRevision: row.draft_revision,
    id: contentEntryId(row.id),
    listValues: listValues(row.fields_json, listFields),
    modelKey: contentModelKey(row.model_key),
    ...(row.published_snapshot_id === null || row.published_at === null
      ? {}
      : {
          publishedAt: unixMilliseconds(assertTimestamp(row.published_at, "Publication time")),
          publishedSnapshotId: contentSnapshotId(row.published_snapshot_id),
        }),
    ...(row.slug === null ? {} : { slug: row.slug }),
    status,
    title: row.title,
    updatedAt: unixMilliseconds(assertTimestamp(row.updated_at, "Entry timestamp")),
    updatedBy: Object.freeze({
      displayName: actorDisplayName(row.updated_by, row.updated_by_name),
      id: actorId(row.updated_by),
    }),
  });
}

export function entryTotals(row: TotalsRow): ContentEntryStatusTotals {
  return Object.freeze({
    all: assertNonNegativeInteger(row.total_count, "Entry total"),
    changed: assertNonNegativeInteger(row.changed_count ?? 0, "Changed entry total"),
    draft: assertNonNegativeInteger(row.draft_count ?? 0, "Draft entry total"),
    published: assertNonNegativeInteger(row.published_count ?? 0, "Published entry total"),
  });
}

/** Binds model key and, when searching, the folded term twice. */
export function entryTotalsSql(searching: boolean): string {
  return `select count(*) as total_count,
          sum(case when e.published_snapshot_id is null then 1 else 0 end) as draft_count,
          sum(case when p.revision = d.revision then 1 else 0 end) as published_count,
          sum(case when p.revision <> d.revision then 1 else 0 end) as changed_count
     from ${ENTRY_SOURCE_SQL}
    where e.model_key = ? ${searching ? `and ${ENTRY_SEARCH_SQL}` : ""}`;
}

export function mediaMetadata(row: Record<string, unknown>): MediaMetadata {
  const string = (name: string): string =>
    typeof row[name] === "string" ? row[name] : failure(`Media ${name} is invalid.`);
  const integer = (name: string): number =>
    typeof row[name] === "number" && Number.isSafeInteger(row[name])
      ? row[name]
      : failure(`Media ${name} is invalid.`);
  const status = string("status");
  if (status !== "active" && status !== "deleting" && status !== "delete_failed") {
    failure("Media status is invalid.");
  }
  const width = row.width;
  const height = row.height;
  return Object.freeze({
    createdAt: unixMilliseconds(integer("created_at")),
    createdBy: actorId(string("created_by")),
    filename: string("filename"),
    ...(typeof height === "number" ? { height } : {}),
    id: string("id") as MediaMetadata["id"],
    mimeType: string("mime_type"),
    size: integer("size"),
    status,
    storageKey: string("storage_key"),
    updatedAt: unixMilliseconds(integer("updated_at")),
    ...(typeof width === "number" ? { width } : {}),
  });
}

export function mediaCatalogItem(row: Record<string, unknown>): MediaCatalogItem {
  const media = mediaMetadata(row);
  const createdByName = typeof row.created_by_name === "string" ? row.created_by_name : null;
  return Object.freeze({
    createdBy: Object.freeze({
      displayName: actorDisplayName(media.createdBy, createdByName),
      id: media.createdBy,
    }),
    media,
    usageCount: assertNonNegativeInteger(row.usage_count, "Media usage count"),
  });
}

interface MediaUsageLocationDraft {
  readonly blockKey?: string;
  blockType?: string;
  readonly field: string;
  position: number;
  readonly states: Set<MediaUsageState>;
}

/** Orders usage locations: entry fields by name, then blocks by position and key. */
function compareUsageLocations(
  left: MediaUsageLocationDraft,
  right: MediaUsageLocationDraft,
): number {
  if ((left.blockKey === undefined) !== (right.blockKey === undefined)) {
    return left.blockKey === undefined ? -1 : 1;
  }
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
    const isBlock = row.source_key !== "$fields";
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
            location.blockKey === undefined
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

export function chunks<Value>(
  values: readonly Value[],
  size: number,
): readonly (readonly Value[])[] {
  const result: Value[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export function storedSnapshot(row: SnapshotRow): StoredSnapshot {
  return {
    blocks: [],
    createdAt: assertTimestamp(row.created_at, "Snapshot creation time"),
    entryId: row.entry_id,
    fields: parseObject(row.fields_json, "Snapshot fields"),
    id: row.id,
    revision: row.revision,
    ...(row.slug === null ? {} : { slug: row.slug }),
    title: row.title,
    updatedAt: assertTimestamp(row.updated_at, "Snapshot update time"),
    updatedBy: { id: actorId(row.updated_by), role: storedRole(row.role) },
  };
}

/** Attaches position-ordered block rows to their snapshots. */
export function storedSnapshots(
  snapshotRows: readonly SnapshotRow[],
  blockRows: readonly BlockRow[],
): Map<string, StoredSnapshot> {
  const snapshots = new Map(snapshotRows.map((row) => [row.id, storedSnapshot(row)]));
  const grouped = new Map<string, ContentBlock[]>();
  for (const row of blockRows) {
    const blocks = grouped.get(row.snapshot_id) ?? [];
    blocks.push({
      data: parseObject(row.data_json, "Block data"),
      key: blockKey(row.block_key),
      position: row.position,
      schemaVersion: row.schema_version,
      type: row.block_type,
    });
    grouped.set(row.snapshot_id, blocks);
  }
  for (const [id, snapshot] of snapshots) {
    snapshots.set(id, { ...snapshot, blocks: Object.freeze(grouped.get(id) ?? []) });
  }
  return snapshots;
}

export function snapshotIdsOf(rows: readonly EntryRow[]): readonly string[] {
  return [
    ...new Set(
      rows
        .flatMap((row) => [row.draft_snapshot_id, row.published_snapshot_id])
        .filter((id): id is string => id !== null),
    ),
  ];
}

export function snapshotValue(source: StoredSnapshot, state: "draft"): DraftSnapshot;
export function snapshotValue(source: StoredSnapshot, state: "published"): PublishedSnapshot;
export function snapshotValue(
  source: StoredSnapshot,
  state: "draft" | "published",
): DraftSnapshot | PublishedSnapshot {
  return Object.freeze({
    blocks: source.blocks,
    createdAt: unixMilliseconds(source.createdAt),
    entryId: contentEntryId(source.entryId),
    fields: source.fields,
    id: contentSnapshotId(source.id),
    revision: source.revision,
    ...(source.slug === undefined ? {} : { slug: source.slug }),
    state,
    title: source.title,
    updatedAt: unixMilliseconds(source.updatedAt),
    updatedBy: Object.freeze({ ...source.updatedBy }),
  }) as DraftSnapshot | PublishedSnapshot;
}

export function hydrateEntries(
  rows: readonly EntryRow[],
  snapshots: ReadonlyMap<string, StoredSnapshot>,
  resolveModel: ContentModelResolver,
): Map<string, ContentEntry> {
  const result = new Map<string, ContentEntry>();
  for (const row of rows) {
    if (row.draft_snapshot_id === null) failure("Content entry is missing its draft snapshot.");
    const draftSource = snapshots.get(row.draft_snapshot_id);
    if (draftSource === undefined) failure("Content entry draft snapshot is missing.");
    const model = resolveModel(row.model_key);
    if (model === undefined)
      failure(`Content model ${row.model_key} is unavailable in runtime configuration.`);
    const publishedSource =
      row.published_snapshot_id === null ? undefined : snapshots.get(row.published_snapshot_id);
    if (row.published_snapshot_id !== null && publishedSource === undefined) {
      failure("Content entry published snapshot is missing.");
    }
    result.set(
      row.id,
      Object.freeze({
        draft: snapshotValue(draftSource, "draft"),
        id: contentEntryId(row.id),
        model: Object.freeze({ ...model }),
        ...(publishedSource === undefined
          ? {}
          : { published: snapshotValue(publishedSource, "published") }),
      }),
    );
  }
  return result;
}

/** Public projections cannot disclose the independently mutable draft snapshot. */
export function publicEntry(entry: ContentEntry): ContentEntry {
  if (entry.published === undefined) failure("Public entry is missing its published snapshot.");
  return Object.freeze({
    draft: Object.freeze({ ...entry.published, state: "draft" as const }),
    id: entry.id,
    model: entry.model,
    published: entry.published,
  });
}

/** Validates a claimed `site.build.requested` payload; `null` marks an invalid event. */
export function siteBuildPayload(payloadJson: string): JsonObject | null {
  let payload: JsonObject;
  try {
    payload = parseObject(payloadJson, "Build payload");
  } catch {
    return null;
  }
  return !Number.isSafeInteger(payload.targetVersion) ||
    Number(payload.targetVersion) < 0 ||
    typeof payload.requestedBy !== "string" ||
    !payload.requestedBy ||
    typeof payload.reason !== "string" ||
    !payload.reason ||
    !Number.isSafeInteger(payload.requestedAt)
    ? null
    : payload;
}

/** Maps SQLite and D1 constraint failures to stable domain errors. */
export function sqliteWriteError(error: unknown, pageCreation: boolean, runtime: string): never {
  if (error instanceof DomainError) throw error;
  const message = error instanceof Error ? error.message : "";
  if (
    pageCreation &&
    (message.includes("content_entries_singleton_idx") ||
      message.includes("UNIQUE constraint failed: content_entries.model_key"))
  ) {
    throw new DomainError(
      "CONTENT_MODEL_CARDINALITY_CONFLICT",
      "A page model already has its singleton entry.",
    );
  }
  if (message.includes("UNIQUE constraint failed: published_routes.path")) {
    throw new DomainError("CONTENT_ROUTE_CONFLICT", "The public path belongs to another entry.");
  }
  if (message.includes("NOT NULL constraint failed: content_media_references.media_id")) {
    failure("Media is unavailable for reference.");
  }
  throw new DomainError("CONTENT_INVALID_STATE", `${runtime} content write failed.`);
}

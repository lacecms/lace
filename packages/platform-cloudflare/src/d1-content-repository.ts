import {
  actorDisplayName,
  ALLOWED_MEDIA_MIME_TYPES,
  DISPATCHER_LEASE_DURATION_MS,
  dispatcherEventId,
  dispatcherLeaseId,
  foldAscii,
  MAX_MEDIA_USAGE_ENTRIES,
  planConfigurationSynchronization,
  renderConfigurationSyncPlanJson,
  SITE_BUILD_DEBOUNCE_MS,
} from "@lacecms/application";
import type {
  ActorSummary,
  ApplyConfigurationSynchronizationInput,
  ApplyConfigurationSynchronizationResult,
  BuildContentExport,
  BuildQueueReceipt,
  ClaimDispatcherEventsInput,
  CompleteDispatcherLeaseInput,
  ConfigurationSyncApplyPort,
  ConfigurationSyncStateReadPort,
  ContentCommandResult,
  ContentEntryCommandPort,
  ContentEntryListPage,
  ContentEntryReadPort,
  CreateContentEntryInput,
  CreateMediaMetadataInput,
  CursorPage,
  DeleteContentEntryInput,
  DispatcherLease,
  DispatcherLeaseId,
  DispatcherLeasePort,
  EnqueueSiteBuildInput,
  ListContentEntriesInput,
  ListMediaInput,
  ListPublicContentInput,
  LoadContentEntryInput,
  LoadMediaUsageInput,
  MarkMediaForDeletionInput,
  MarkMediaForDeletionResult,
  MediaCatalogItem,
  MediaCatalogPort,
  MediaCommandPort,
  MediaDeletionDispatchPort,
  MediaListPort,
  MediaReadPort,
  MediaUsageEntry,
  PublicContentEntry,
  PublicContentReadPort,
  PublishContentEntryCommand,
  PublishContentEntryResult,
  RetryDispatcherLeaseInput,
  SaveCompleteDraftInput,
  SiteBuildCommandPort,
  SiteBuildDispatchPort,
  SiteBuildReadPort,
  SiteBuildRecord,
  SiteBuildWorkLease,
  TrackedSiteBuildCheck,
  StoredContentModelState,
} from "@lacecms/application";
import {
  BLOCK_COLUMNS_SQL,
  ENTRY_COLUMNS_SQL,
  ENTRY_SEARCH_SQL,
  ENTRY_SORT_SQL,
  ENTRY_SOURCE_SQL,
  ENTRY_STATUS_SQL,
  MEDIA_BY_ID_SQL,
  MEDIA_CATALOG_SQL,
  MEDIA_SORT_SQL,
  MEDIA_USAGE_SQL,
  PENDING_SITE_BUILD_SQL,
  PUBLICATION_IDEMPOTENCY_TTL_MS,
  PUBLIC_MEDIA_SQL,
  PUBLIC_ROUTE_SQL,
  SNAPSHOT_COLUMNS_SQL,
  SQL_MAX_PAGE_SIZE,
  STORED_MODEL_STATE_JSON_SQL,
  assertDraftPersistenceBounds,
  assertNonNegativeInteger,
  assertPageSize,
  assertTimestamp,
  chunks,
  decodeCursor,
  decodeEntryCursor,
  decodeMediaCursor,
  encodeCursor,
  encodeSortCursor,
  entryCursorKind,
  entryStatus,
  entrySummary,
  entryTotals,
  entryTotalsSql,
  failure,
  hydrateEntries,
  mediaCatalogItem,
  mediaCursorKind,
  mediaMetadata,
  mediaUsageEntries,
  parseObject,
  publicEntry,
  revisionConflict,
  sameStoredModelStates,
  sanitizeBuildReason,
  encodeBuildError,
  CLAIMABLE_SITE_BUILD_STATUS_SQL,
  RETRYABLE_SITE_BUILD_REFUSAL,
  RETRYABLE_SITE_BUILD_STATUS_SQL,
  assertProviderBuildId,
  assertTrackingClaim,
  DUE_TRACKED_SITE_BUILDS_SQL,
  LEASE_TRACKED_SITE_BUILD_SQL,
  trackedCompletionStage,
  trackedOutcomeError,
  trackedSiteBuildCheck,
  trackedSiteBuildCheckUpdate,
  sanitizeDispatchError,
  siteBuildPayload,
  siteBuildRecord,
  snapshotIdsOf,
  snapshotValue,
  sqliteWriteError,
  storedModelStates,
  storedRole,
  storedSnapshots,
} from "@lacecms/db";
import type {
  DueTrackedSiteBuildRow,
  BlockRow,
  ContentModelResolver,
  EntryRow,
  MediaUsageRow,
  OutboxRow,
  PublicRow,
  SiteBuildRow,
  SnapshotRow,
  StoredModelStateRow,
  StoredSnapshot,
  SummaryRow,
  TotalsRow,
} from "@lacecms/db";
import {
  DomainError,
  resolveContentPublicPath,
  siteBuildId,
  unixMilliseconds,
} from "@lacecms/domain";
import type {
  ActorId,
  ContentBlock,
  ContentEntry,
  DraftSnapshot,
  MediaMetadata,
  PublishedSnapshot,
  SiteBuildId,
  SiteBuildProviderStage,
  TrackedSiteBuildOutcome,
  UnixMilliseconds,
} from "@lacecms/domain";
import {
  D1_MAX_BATCH_STATEMENTS,
  D1_MAX_BOUND_PARAMETERS,
  D1_MAX_CLAIMS_PER_CALL,
  type D1Database,
  type D1PreparedStatement,
  type D1Result,
} from "./d1.js";

declare const crypto: { randomUUID(): string };

/** Every later statement of a guarded batch requires this batch-unique row. */
const GUARD_SQL = "exists (select 1 from mutation_guards where token = ?)";
/** Raised by an injected checkpoint: a runtime `NOT NULL` failure inside the batch. */
const INJECTED_FAILURE_SQL = "insert into mutation_guards (token, created_at) values (null, 0)";
const LEASED_SITE_BUILD_SQL =
  "select id from outbox_events where locked_by = ? and type = 'site.build.requested' and processed_at is null and locked_at > ?";
const BLOCK_VALUES_PER_ROW = 5;
const REFERENCE_VALUES_PER_ROW = 3;

export interface D1RepositoryOptions {
  /** Test hook: a throw at a named checkpoint injects a failing statement at that batch position. */
  readonly beforeMutation?: (checkpoint: string) => void;
  readonly nextId?: () => string;
}

/** A SQL condition fragment with its positional parameters. */
interface Condition {
  readonly params: readonly unknown[];
  readonly sql: string;
}

/** Builds one atomic `batch()` and records named checkpoint positions. */
class MutationBatch {
  public readonly statements: D1PreparedStatement[] = [];

  public constructor(
    private readonly database: D1Database,
    private readonly hook: ((checkpoint: string) => void) | undefined,
  ) {}

  public add(sql: string, ...params: unknown[]): number {
    this.statements.push(bind(this.database.prepare(sql), params));
    return this.statements.length - 1;
  }

  public checkpoint(name: string): void {
    try {
      this.hook?.(name);
    } catch {
      this.add(INJECTED_FAILURE_SQL);
    }
  }
}

function bind(statement: D1PreparedStatement, params: readonly unknown[]): D1PreparedStatement {
  return params.length === 0
    ? statement
    : statement.bind(...params.map((value) => (value === undefined ? null : value)));
}

function numberedValues(rows: number, width: number, offset: number): string {
  const tuples: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    const values: string[] = [];
    for (let column = 0; column < width; column += 1) {
      values.push(`?${offset + row * width + column + 1}`);
    }
    tuples.push(`(${values.join(", ")})`);
  }
  return tuples.join(", ");
}

function rowsPerStatement(shared: number, width: number): number {
  return Math.floor((D1_MAX_BOUND_PARAMETERS - shared) / width);
}

/**
 * Cloudflare D1 implementation of the portable content persistence ports.
 * Multi-row mutations are single guarded `batch()` calls; no statement relies
 * on an interactive transaction.
 */
export class D1ContentRepository
  implements
    ContentEntryCommandPort,
    ContentEntryReadPort,
    ConfigurationSyncApplyPort,
    ConfigurationSyncStateReadPort,
    DispatcherLeasePort,
    MediaCommandPort,
    MediaCatalogPort,
    MediaDeletionDispatchPort,
    MediaListPort,
    MediaReadPort,
    PublicContentReadPort,
    SiteBuildCommandPort,
    SiteBuildReadPort,
    SiteBuildDispatchPort
{
  public constructor(
    private readonly database: D1Database,
    private readonly resolveModel: ContentModelResolver,
    private readonly options: D1RepositoryOptions = {},
  ) {}

  // ---------------------------------------------------------------- reads

  public async readConfigurationSyncState(): Promise<readonly StoredContentModelState[]> {
    return (await this.readSyncState()).state;
  }

  public async load(input: LoadContentEntryInput): Promise<ContentEntry | null> {
    return this.loadEntry(input.entryId);
  }

  public async loadDraft(input: LoadContentEntryInput): Promise<DraftSnapshot | null> {
    return (await this.loadEntry(input.entryId))?.draft ?? null;
  }

  public async loadPublished(input: LoadContentEntryInput): Promise<PublishedSnapshot | null> {
    return (await this.loadEntry(input.entryId))?.published ?? null;
  }

  public async describeActors(ids: readonly ActorId[]): Promise<readonly ActorSummary[]> {
    const names = new Map<string, string>();
    for (const group of chunks([...new Set(ids)], D1_MAX_BOUND_PARAMETERS)) {
      const rows = await this.all<{ readonly id: string; readonly name: string }>(
        `select id, name from user where id in (${group.map(() => "?").join(", ")})`,
        ...group,
      );
      for (const row of rows) names.set(row.id, row.name);
    }
    return Object.freeze(
      ids.map((id) => Object.freeze({ displayName: actorDisplayName(id, names.get(id)), id })),
    );
  }

  public async list(input: ListContentEntriesInput): Promise<ContentEntryListPage> {
    const limit = assertPageSize(input.limit);
    const descending = input.sort.startsWith("-");
    const sort = ENTRY_SORT_SQL[descending ? input.sort.slice(1) : input.sort];
    if (sort === undefined) failure("Entry sort is unsupported.");
    if (input.status !== undefined) entryStatus(input.status);
    const kind = entryCursorKind(input);
    const after =
      input.after === undefined ? undefined : decodeEntryCursor(input.after, kind, input.sort);
    const term = input.q === undefined ? undefined : foldAscii(input.q);
    const comparison = descending ? "<" : ">";
    const direction = descending ? "desc" : "asc";
    const rows = await this.all<SummaryRow>(
      `select e.id, e.model_key, e.published_snapshot_id, e.updated_at,
              d.revision as draft_revision, d.title, d.slug, d.fields_json, d.updated_by,
              u.name as updated_by_name, p.created_at as published_at,
              ${ENTRY_STATUS_SQL} as status, ${sort.value} as sort_value
         from ${ENTRY_SOURCE_SQL}
         left join user u on u.id = d.updated_by
        where e.model_key = ? ${term === undefined ? "" : `and ${ENTRY_SEARCH_SQL}`}
          ${input.status === undefined ? "" : `and ${ENTRY_STATUS_SQL} = ?`}
          ${
            after === undefined
              ? ""
              : `and (${sort.order} ${comparison} ? or (${sort.order} = ? and e.id ${comparison} ?))`
          }
        order by ${sort.order} ${direction}, e.id ${direction} limit ?`,
      input.modelKey,
      ...(term === undefined ? [] : [term, term]),
      ...(input.status === undefined ? [] : [input.status]),
      ...(after === undefined ? [] : [after.value, after.value, after.id]),
      limit + 1,
    );
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);
    const totals = await this.first<TotalsRow>(
      entryTotalsSql(term !== undefined),
      input.modelKey,
      ...(term === undefined ? [] : [term, term]),
    );
    return Object.freeze({
      items: Object.freeze(pageRows.map((row) => entrySummary(row, input.listFields))),
      ...(rows.length > limit && last !== undefined
        ? { nextCursor: encodeSortCursor(kind, last.sort_value, last.id) }
        : {}),
      totals: entryTotals(totals!),
    });
  }

  public async listPublic(input: ListPublicContentInput): Promise<CursorPage<PublicContentEntry>> {
    const limit = assertPageSize(input.limit);
    const cursorKind = `public:${input.modelKey}`;
    const after = input.after === undefined ? undefined : decodeCursor(input.after, cursorKind);
    const rows = await this.all<PublicRow>(
      `${PUBLIC_ROUTE_SQL}
        where e.model_key = ?
          ${after === undefined ? "" : "and (s.created_at < ? or (s.created_at = ? and e.id < ?))"}
        order by s.created_at desc, e.id desc limit ?`,
      ...(after === undefined
        ? [input.modelKey, limit + 1]
        : [input.modelKey, after.timestamp, after.timestamp, after.id, limit + 1]),
    );
    const pageRows = rows.slice(0, limit);
    const entries = await this.hydrate(pageRows);
    const items = pageRows.map((row) => {
      const entry = entries.get(row.id);
      if (entry === undefined) failure("Published route references an unreadable entry.");
      return Object.freeze({ entry: publicEntry(entry), path: row.path });
    });
    const last = pageRows.at(-1);
    return Object.freeze({
      items: Object.freeze(items),
      ...(rows.length > limit && last !== undefined
        ? { nextCursor: encodeCursor(cursorKind, last.published_created_at, last.id) }
        : {}),
    });
  }

  public async publishedContentVersion(): Promise<number> {
    const row = await this.first<{ readonly version: number }>(
      "select version from published_state where singleton_key = 1",
    );
    return row?.version ?? 0;
  }

  public async loadPublic(path: string): Promise<PublicContentEntry | null> {
    const row = await this.first<PublicRow>(`${PUBLIC_ROUTE_SQL} where r.path = ? limit 1`, path);
    if (row === undefined) return null;
    const entry = (await this.hydrate([row])).get(row.id);
    return entry === undefined
      ? null
      : Object.freeze({ entry: publicEntry(entry), path: row.path });
  }

  public async loadPublicMedia(id: string): Promise<MediaMetadata | null> {
    const row = await this.first(PUBLIC_MEDIA_SQL, id);
    return row === undefined ? null : mediaMetadata(row);
  }

  public async loadMedia(id: string): Promise<MediaMetadata | null> {
    const row = await this.first(MEDIA_BY_ID_SQL, id);
    return row === undefined ? null : mediaMetadata(row);
  }

  public async loadDeletingMedia(id: string): Promise<MediaMetadata | null> {
    const media = await this.loadMedia(id);
    return media?.status === "deleting" ? media : null;
  }

  public async listMedia(input: ListMediaInput): Promise<CursorPage<MediaCatalogItem>> {
    const limit = assertPageSize(input.limit);
    const descending = input.sort.startsWith("-");
    const sort = MEDIA_SORT_SQL[descending ? input.sort.slice(1) : input.sort];
    if (sort === undefined) failure("Media sort is unsupported.");
    if (input.type !== undefined && !ALLOWED_MEDIA_MIME_TYPES.includes(input.type)) {
      failure("Media type filter is unsupported.");
    }
    const kind = mediaCursorKind(input);
    const after =
      input.after === undefined ? undefined : decodeMediaCursor(input.after, kind, input.sort);
    const comparison = descending ? "<" : ">";
    const direction = descending ? "desc" : "asc";
    const conditions: string[] = [];
    const bindings: (number | string)[] = [];
    if (input.q !== undefined) {
      conditions.push("instr(lower(m.filename), ?) > 0");
      bindings.push(foldAscii(input.q));
    }
    if (input.type !== undefined) {
      conditions.push("m.mime_type = ?");
      bindings.push(input.type);
    }
    if (after !== undefined) {
      conditions.push(
        `(${sort.order} ${comparison} ? or (${sort.order} = ? and m.id ${comparison} ?))`,
      );
      bindings.push(after.value, after.value, after.id);
    }
    const rows = await this.all(
      `${MEDIA_CATALOG_SQL}, ${sort.value} as sort_value
         from media m
         left join user u on u.id = m.created_by
        ${conditions.length === 0 ? "" : `where ${conditions.join(" and ")}`}
        order by ${sort.order} ${direction}, m.id ${direction} limit ?`,
      ...bindings,
      limit + 1,
    );
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);
    return Object.freeze({
      items: Object.freeze(pageRows.map((row) => mediaCatalogItem(row))),
      ...(rows.length > limit && last !== undefined
        ? {
            nextCursor: encodeSortCursor(kind, last.sort_value as number | string, String(last.id)),
          }
        : {}),
    });
  }

  public async loadMediaCatalogItem(id: string): Promise<MediaCatalogItem | null> {
    const row = await this.first(
      `${MEDIA_CATALOG_SQL}
         from media m
         left join user u on u.id = m.created_by
        where m.id = ? limit 1`,
      id,
    );
    return row === undefined ? null : mediaCatalogItem(row);
  }

  public async loadMediaUsage(input: LoadMediaUsageInput): Promise<readonly MediaUsageEntry[]> {
    if (
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > MAX_MEDIA_USAGE_ENTRIES
    ) {
      failure(`Media usage limit must be between 1 and ${MAX_MEDIA_USAGE_ENTRIES}.`);
    }
    return mediaUsageEntries(
      await this.all<MediaUsageRow>(MEDIA_USAGE_SQL, input.mediaId, input.limit, input.mediaId),
    );
  }

  public async exportBuildContent(): Promise<BuildContentExport> {
    const rows = await this.all<PublicRow>(`${PUBLIC_ROUTE_SQL} order by r.path asc`);
    const entries = await this.hydrate(rows);
    return Object.freeze({
      entries: Object.freeze(
        rows.map((row) => {
          const entry = entries.get(row.id);
          if (entry === undefined) failure("Build export contains an unreadable entry.");
          return Object.freeze({ entry: publicEntry(entry), path: row.path });
        }),
      ),
      version: await this.publishedContentVersion(),
    });
  }

  public async listSiteBuilds(limit: number): Promise<readonly SiteBuildRecord[]> {
    const bounded = Math.max(1, Math.min(100, Math.trunc(limit)));
    const rows = await this.all<SiteBuildRow>(
      "select * from site_builds order by requested_at desc, id desc limit ?",
      bounded,
    );
    return rows.map(siteBuildRecord);
  }

  public async getSiteBuild(buildId: SiteBuildId): Promise<SiteBuildRecord | null> {
    const row = await this.first<SiteBuildRow>("select * from site_builds where id = ?", buildId);
    return row === undefined ? null : siteBuildRecord(row);
  }

  // ------------------------------------------------------- entry mutations

  public async create(input: CreateContentEntryInput): Promise<ContentCommandResult> {
    const { draft, id, model } = input.entry;
    assertDraftPersistenceBounds(draft.blocks, input.mediaReferences);
    const version = await this.first<{ readonly config_version: number }>(
      "select config_version from content_models where key = ?",
      model.key,
    );
    if (version === undefined) failure(`Content model ${model.key} does not exist.`);
    const batch = this.batch();
    batch.add(
      "insert into content_entries (id, model_key, singleton_key, created_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?)",
      id,
      model.key,
      model.kind === "page" ? 1 : null,
      draft.updatedBy.id,
      draft.createdAt,
      draft.updatedAt,
    );
    this.addSnapshotInsert(batch, draft, version.config_version);
    this.addBlockInserts(batch, draft.id, draft.updatedAt, draft.blocks);
    this.addReferenceInserts(batch, draft.id, draft.updatedAt, input.mediaReferences);
    batch.add("update content_entries set draft_snapshot_id = ? where id = ?", draft.id, id);
    await this.execute(batch, model.kind === "page");
    const entry = await this.loadEntry(id);
    if (entry === null) failure("Created content entry could not be reloaded.");
    return { entry, status: "created" };
  }

  public async saveCompleteDraft(input: SaveCompleteDraftInput): Promise<ContentCommandResult> {
    const { mutation } = input;
    assertDraftPersistenceBounds(mutation.blocks, mutation.mediaReferences);
    const existing = await this.entryRow(input.entryId);
    if (existing === undefined || existing.draft_snapshot_id === null) {
      failure("Content entry does not have a mutable draft.");
    }
    const draftId = existing.draft_snapshot_id;
    const batch = this.batch();
    const token = this.guard(batch, mutation.updatedAt, {
      params: [input.entryId, draftId, mutation.expectedRevision],
      sql: "exists (select 1 from content_snapshots s join content_entries e on e.draft_snapshot_id = s.id where e.id = ? and s.id = ? and s.revision = ?)",
    });
    batch.add(`delete from content_blocks where snapshot_id = ? and ${GUARD_SQL}`, draftId, token);
    batch.add(
      `delete from content_media_references where snapshot_id = ? and ${GUARD_SQL}`,
      draftId,
      token,
    );
    this.addBlockInserts(batch, draftId, mutation.updatedAt, mutation.blocks, token);
    this.addReferenceInserts(batch, draftId, mutation.updatedAt, mutation.mediaReferences, token);
    batch.add(
      `update content_entries set updated_at = ? where id = ? and ${GUARD_SQL}`,
      mutation.updatedAt,
      input.entryId,
      token,
    );
    batch.add(
      `update content_snapshots set revision = revision + 1, slug = ?, title = ?, fields_json = ?, updated_at = ?, updated_by = ? where id = ? and ${GUARD_SQL}`,
      mutation.slug ?? null,
      mutation.title,
      JSON.stringify(mutation.fields),
      mutation.updatedAt,
      mutation.updatedBy.id,
      draftId,
      token,
    );
    this.releaseGuard(batch, token);
    const results = await this.execute(batch, false);
    if (results[0]!.meta.changes !== 1) {
      revisionConflict("The draft revision no longer matches the expected revision.");
    }
    const entry = await this.loadEntry(input.entryId);
    if (entry === null) failure("Saved content entry could not be reloaded.");
    return { entry, status: "saved" };
  }

  public async publish(input: PublishContentEntryCommand): Promise<PublishContentEntryResult> {
    const entry = await this.loadEntry(input.entryId);
    if (entry === null) failure("Content entry does not exist.");
    const path = resolveContentPublicPath(entry.model, entry.draft.slug);
    const idempotency = input.idempotency;
    const scope =
      idempotency === undefined ? undefined : `publication:${input.entryId}:${idempotency.actorId}`;
    if (idempotency !== undefined) {
      if (idempotency.actorId !== input.publishedBy.id)
        failure("Publication idempotency actor must match publisher.");
      const replay = await this.replayPublication(scope!, idempotency);
      if (replay !== null) return replay;
    }
    if (entry.draft.revision !== input.expectedRevision) {
      revisionConflict("The draft revision no longer matches the expected revision.");
    }
    const publisher = await this.first<{ readonly role: string }>(
      "select role from user where id = ?",
      input.publishedBy.id,
    );
    const committed = this.publishedEntry(entry, input, publisher?.role);
    const newId = input.publishedSnapshotId;
    const draftId = entry.draft.id;
    const exists: Condition = {
      params: [newId],
      sql: "exists (select 1 from content_snapshots where id = ?)",
    };
    const batch = this.batch();
    batch.checkpoint("publish.snapshot");
    const snapshotIndex = batch.add(
      `insert into content_snapshots (id, entry_id, revision, slug, title, fields_json, schema_version, created_at, updated_at, updated_by)
       select ?, s.entry_id, s.revision, s.slug, s.title, s.fields_json, s.schema_version, ?, ?, ?
         from content_snapshots s join content_entries e on e.draft_snapshot_id = s.id
        where e.id = ? and s.id = ? and s.revision = ?
          ${idempotency === undefined ? "" : "and not exists (select 1 from idempotency_records where scope = ? and key = ?)"}`,
      newId,
      input.publishedAt,
      input.publishedAt,
      input.publishedBy.id,
      input.entryId,
      draftId,
      input.expectedRevision,
      ...(idempotency === undefined ? [] : [scope, idempotency.key]),
    );
    batch.checkpoint("publish.blocks");
    batch.add(
      `insert into content_blocks (snapshot_id, block_key, block_type, position, schema_version, data_json, created_at, updated_at)
       select ?, block_key, block_type, position, schema_version, data_json, created_at, updated_at
         from content_blocks where snapshot_id = ? and ${exists.sql}`,
      newId,
      draftId,
      ...exists.params,
    );
    batch.checkpoint("publish.references");
    batch.add(
      `insert into content_media_references (snapshot_id, source_key, field_path, media_id, created_at)
       select ?, source_key, field_path, media_id, created_at
         from content_media_references where snapshot_id = ? and ${exists.sql}`,
      newId,
      draftId,
      ...exists.params,
    );
    batch.checkpoint("publish.route");
    batch.add(
      `delete from published_routes where entry_id = ? and ${exists.sql}`,
      input.entryId,
      ...exists.params,
    );
    batch.add(
      `insert into published_routes (path, entry_id, snapshot_id, updated_at) select ?, ?, ?, ? where ${exists.sql}`,
      path,
      input.entryId,
      newId,
      input.publishedAt,
      ...exists.params,
    );
    batch.add(
      `update content_entries set published_snapshot_id = ?, updated_at = ? where id = ? and ${exists.sql}`,
      newId,
      input.publishedAt,
      input.entryId,
      ...exists.params,
    );
    const state = this.addPublicStateBump(batch, exists, {
      requestedAt: input.publishedAt,
      requestedBy: input.publishedBy.id,
      snapshotId: newId,
    });
    if (idempotency !== undefined) {
      batch.add(
        `insert into idempotency_records (scope, key, request_hash, response_json, created_at, expires_at) select ?, ?, ?, ?, ?, ? where ${exists.sql}`,
        scope,
        idempotency.key,
        idempotency.fingerprint,
        JSON.stringify(committed),
        input.publishedAt,
        input.publishedAt + PUBLICATION_IDEMPOTENCY_TTL_MS,
        ...exists.params,
      );
    }
    batch.add(
      `delete from content_snapshots where entry_id = ? and id <> ? and id <> ? and ${exists.sql}`,
      input.entryId,
      draftId,
      newId,
      ...exists.params,
    );
    const results = await this.execute(batch, false);
    if (results[snapshotIndex]!.meta.changes !== 1) {
      if (idempotency !== undefined) {
        const replay = await this.replayPublication(scope!, idempotency);
        if (replay !== null) return replay;
      }
      revisionConflict("The draft revision no longer matches the expected revision.");
    }
    return {
      entry: committed,
      outcome: "published",
      status: "published",
      targetVersion: this.stateVersion(results, state),
    };
  }

  public async delete(input: DeleteContentEntryInput): Promise<ContentCommandResult> {
    const entry = await this.entryRow(input.entryId);
    if (entry === undefined) failure("Content entry does not exist.");
    const expectedPublished = input.expectedPublishedSnapshotId ?? null;
    if (entry.published_snapshot_id !== expectedPublished) {
      revisionConflict("The publication state no longer matches the deletion guard.");
    }
    const batch = this.batch();
    const token = this.guard(batch, input.deletedAt, {
      params: [input.entryId, expectedPublished, input.expectedRevision],
      sql: "exists (select 1 from content_entries e join content_snapshots d on d.id = e.draft_snapshot_id where e.id = ? and e.published_snapshot_id is ? and d.revision = ?)",
    });
    const guarded: Condition = { params: [token], sql: GUARD_SQL };
    if (expectedPublished !== null) {
      batch.checkpoint("delete.route");
      batch.add(
        `delete from published_routes where entry_id = ? and ${GUARD_SQL}`,
        input.entryId,
        token,
      );
      this.addPublicStateBump(batch, guarded, {
        requestedAt: input.deletedAt,
        requestedBy: input.deletedBy.id,
        snapshotId: expectedPublished,
      });
    }
    batch.checkpoint("delete.entry");
    batch.add(`delete from content_entries where id = ? and ${GUARD_SQL}`, input.entryId, token);
    this.releaseGuard(batch, token);
    const results = await this.execute(batch, false);
    if (results[0]!.meta.changes !== 1) {
      const current = await this.entryRow(input.entryId);
      if (current === undefined) failure("Content entry does not exist.");
      if (current.published_snapshot_id !== expectedPublished) {
        revisionConflict("The publication state no longer matches the deletion guard.");
      }
      revisionConflict("The draft revision no longer matches the deletion guard.");
    }
    return { status: "deleted" };
  }

  public async applyConfigurationSynchronization(
    input: ApplyConfigurationSynchronizationInput,
  ): Promise<ApplyConfigurationSynchronizationResult> {
    const { json, state } = await this.readSyncState();
    const actualPlan = planConfigurationSynchronization({
      models: input.models,
      storedModels: state,
    });
    if (
      !input.plan.isValid ||
      !sameStoredModelStates(input.expectedStoredModels, state) ||
      renderConfigurationSyncPlanJson(input.plan) !== renderConfigurationSyncPlanJson(actualPlan)
    ) {
      failure("Configuration synchronization plan is stale.");
    }
    if (!actualPlan.requiresApply) {
      return Object.freeze({ operations: Object.freeze([]), status: "noop" as const });
    }
    const expectedByKey = new Map(input.expectedStoredModels.map((model) => [model.key, model]));
    const configurationByKey = new Map(input.models.map((model) => [model.key, model]));
    const pageEntries = new Map(input.pageEntries.map((page) => [page.modelKey, page]));
    const batch = this.batch();
    const token = this.guard(batch, input.appliedAt, {
      params: [json],
      sql: `${STORED_MODEL_STATE_JSON_SQL} = ?`,
    });
    for (const operation of actualPlan.operations) {
      if (operation.action === "create") {
        const configuration = configurationByKey.get(operation.model.key);
        if (configuration === undefined) failure("Synchronization model is unavailable.");
        batch.checkpoint("sync.model.create");
        batch.add(
          `insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, created_at, updated_at) select ?, ?, ?, ?, ?, ?, ?, ? where ${GUARD_SQL}`,
          operation.model.key,
          operation.model.kind,
          configuration.label ?? configuration.key,
          operation.model.version,
          operation.model.structureHash,
          operation.model.projectionHash,
          input.appliedAt,
          input.appliedAt,
          token,
        );
        if (configuration.kind === "page") {
          const page = pageEntries.get(operation.model.key);
          if (page === undefined || page.entry.model.key !== operation.model.key) {
            failure("Page synchronization entry is missing or invalid.");
          }
          const draft = page.entry.draft;
          assertDraftPersistenceBounds(draft.blocks, []);
          batch.checkpoint("sync.page.entry");
          batch.add(
            `insert into content_entries (id, model_key, singleton_key, created_by, created_at, updated_at) select ?, ?, 1, ?, ?, ? where ${GUARD_SQL}`,
            page.entry.id,
            operation.model.key,
            draft.updatedBy.id,
            draft.createdAt,
            draft.updatedAt,
            token,
          );
          batch.checkpoint("sync.page.snapshot");
          this.addSnapshotInsert(batch, draft, operation.model.version, token);
          this.addBlockInserts(batch, draft.id, draft.updatedAt, draft.blocks, token);
          batch.add(
            `update content_entries set draft_snapshot_id = ? where id = ? and ${GUARD_SQL}`,
            draft.id,
            page.entry.id,
            token,
          );
        }
        continue;
      }
      if (operation.action === "remove") {
        const expected = expectedByKey.get(operation.model.key);
        if (expected === undefined) failure("Synchronization removal guard is missing.");
        batch.checkpoint("sync.model.remove");
        batch.add(
          `delete from content_models where key = ? and kind = ? and config_version = ? and structure_hash = ? and projection_hash = ? and ${GUARD_SQL}`,
          expected.key,
          expected.kind,
          expected.version,
          expected.structureHash,
          expected.projectionHash,
          token,
        );
        continue;
      }
      if (operation.action === "blocked-removal" || operation.action === "incompatible-change") {
        failure("Configuration synchronization plan contains an unsafe operation.");
      }
      const configuration = configurationByKey.get(operation.model.key);
      if (configuration === undefined) failure("Synchronization model is unavailable.");
      const previousKey =
        operation.action === "rename" ? operation.renamedFrom : operation.model.key;
      const expected = expectedByKey.get(previousKey);
      if (expected === undefined) failure("Synchronization update guard is missing.");
      batch.checkpoint(`sync.model.${operation.action}`);
      batch.add(
        `update content_models set key = ?, kind = ?, label = ?, config_version = ?, structure_hash = ?, projection_hash = ?, updated_at = ? where key = ? and kind = ? and config_version = ? and structure_hash = ? and projection_hash = ? and ${GUARD_SQL}`,
        operation.model.key,
        operation.model.kind,
        configuration.label ?? configuration.key,
        operation.model.version,
        operation.model.structureHash,
        operation.model.projectionHash,
        input.appliedAt,
        expected.key,
        expected.kind,
        expected.version,
        expected.structureHash,
        expected.projectionHash,
        token,
      );
    }
    const stateStatements = this.addPublicStateBump(
      batch,
      { params: [token], sql: GUARD_SQL },
      { requestedAt: input.appliedAt, requestedBy: "system:content-sync", snapshotId: null },
    );
    this.releaseGuard(batch, token);
    const results = await this.execute(batch, true);
    if (results[0]!.meta.changes !== 1) failure("Configuration synchronization plan is stale.");
    return Object.freeze({
      operations: actualPlan.operations,
      status: "applied" as const,
      targetVersion: this.stateVersion(results, stateStatements),
    });
  }

  // ------------------------------------------------------- media mutations

  public async createMedia(input: CreateMediaMetadataInput): Promise<MediaMetadata> {
    try {
      await bind(
        this.database.prepare(
          "insert into media (id, storage_key, filename, mime_type, size, width, height, metadata_json, status, created_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, '{}', 'active', ?, ?, ?)",
        ),
        [
          input.id,
          input.storageKey,
          input.filename,
          input.mimeType,
          input.size,
          input.width,
          input.height,
          input.createdBy,
          input.createdAt,
          input.createdAt,
        ],
      ).run();
    } catch (error) {
      sqliteWriteError(error, false, "D1");
    }
    const media = await this.loadMedia(input.id);
    if (media === null) failure("Created media could not be reloaded.");
    return media;
  }

  public async markForDeletion(
    input: MarkMediaForDeletionInput,
  ): Promise<MarkMediaForDeletionResult> {
    return this.requestMediaDeletion(input, "active", "Media is not eligible for deletion.");
  }

  public async retryDeletion(
    input: MarkMediaForDeletionInput,
  ): Promise<MarkMediaForDeletionResult> {
    return this.requestMediaDeletion(input, "delete_failed", "Media deletion cannot be retried.");
  }

  public async completeMediaDeletion(input: {
    readonly completedAt: UnixMilliseconds;
    readonly leaseId: DispatcherLeaseId;
    readonly mediaId: string;
  }): Promise<void> {
    const event = await this.requireLeasedMediaDeletionEvent(
      input.leaseId,
      input.completedAt,
      input.mediaId,
    );
    const batch = this.batch();
    const token = this.guard(batch, input.completedAt, {
      params: [
        event.id,
        input.leaseId,
        input.completedAt - DISPATCHER_LEASE_DURATION_MS,
        input.mediaId,
      ],
      sql: "exists (select 1 from outbox_events where id = ? and locked_by = ? and processed_at is null and locked_at > ?) and exists (select 1 from media m where m.id = ? and m.status = 'deleting' and not exists (select 1 from content_media_references r where r.media_id = m.id))",
    });
    batch.add(`delete from media where id = ? and ${GUARD_SQL}`, input.mediaId, token);
    batch.add(
      `update outbox_events set processed_at = ?, locked_at = null, locked_by = null where id = ? and ${GUARD_SQL}`,
      input.completedAt,
      event.id,
      token,
    );
    this.releaseGuard(batch, token);
    const results = await this.execute(batch, false);
    if (results[0]!.meta.changes !== 1) {
      await this.requireLeasedMediaDeletionEvent(input.leaseId, input.completedAt, input.mediaId);
      failure("Media deletion can no longer be finalized.");
    }
  }

  public async failMediaDeletion(input: {
    readonly failedAt: UnixMilliseconds;
    readonly leaseId: DispatcherLeaseId;
    readonly mediaId: string;
    readonly sanitizedError: string;
    readonly terminal: boolean;
    readonly retryAt?: UnixMilliseconds;
  }): Promise<void> {
    const error = sanitizeDispatchError(input.sanitizedError);
    const event = await this.requireLeasedMediaDeletionEvent(
      input.leaseId,
      input.failedAt,
      input.mediaId,
    );
    const lease = {
      params: [event.id, input.leaseId, input.failedAt - DISPATCHER_LEASE_DURATION_MS],
      sql: "exists (select 1 from outbox_events where id = ? and locked_by = ? and processed_at is null and locked_at > ?)",
    };
    if (!input.terminal) {
      const retried = await this.run(
        `update outbox_events set attempts = attempts + 1, available_at = ?, locked_at = null, locked_by = null, last_error = ? where id = ? and locked_by = ? and processed_at is null and locked_at > ?`,
        input.retryAt ?? input.failedAt,
        error,
        ...lease.params,
      );
      if (retried !== 1) failure("Dispatcher lease is missing or expired.");
      return;
    }
    const batch = this.batch();
    const token = this.guard(batch, input.failedAt, {
      params: [...lease.params, input.mediaId],
      sql: `${lease.sql} and exists (select 1 from media where id = ? and status = 'deleting')`,
    });
    batch.add(
      `update media set status = 'delete_failed', last_error = ?, updated_at = ? where id = ? and ${GUARD_SQL}`,
      error,
      input.failedAt,
      input.mediaId,
      token,
    );
    batch.add(
      `update outbox_events set attempts = attempts + 1, processed_at = ?, locked_at = null, locked_by = null, last_error = ? where id = ? and ${GUARD_SQL}`,
      input.failedAt,
      error,
      event.id,
      token,
    );
    this.releaseGuard(batch, token);
    const results = await this.execute(batch, false);
    if (results[0]!.meta.changes !== 1) {
      await this.requireLeasedMediaDeletionEvent(input.leaseId, input.failedAt, input.mediaId);
      failure("Media deletion can no longer be failed safely.");
    }
  }

  // ---------------------------------------------------------- dispatching

  public async claim(input: ClaimDispatcherEventsInput): Promise<readonly DispatcherLease[]> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > SQL_MAX_PAGE_SIZE) {
      failure("Dispatcher claim limit is invalid.");
    }
    if (input.eventTypes.length === 0 || input.eventTypes.some((type) => type.length === 0)) {
      failure("Dispatcher event types are invalid.");
    }
    const expired = input.now - DISPATCHER_LEASE_DURATION_MS;
    const rows = await this.all<OutboxRow>(
      `select id, type, payload_json, attempts, available_at
         from outbox_events
        where processed_at is null
          and type in (${input.eventTypes.map(() => "?").join(", ")})
          and available_at <= ?
          and (locked_at is null or locked_at <= ?)
        order by available_at asc, id asc
        limit ?`,
      ...input.eventTypes,
      input.now,
      expired,
      Math.min(input.limit, D1_MAX_CLAIMS_PER_CALL),
    );
    if (rows.length === 0) return Object.freeze([]);
    const batch = this.batch();
    const leaseIds = rows.map((row) => {
      const leaseId = dispatcherLeaseId(this.nextId());
      batch.add(
        "update outbox_events set locked_at = ?, locked_by = ? where id = ? and processed_at is null and (locked_at is null or locked_at <= ?)",
        input.now,
        leaseId,
        row.id,
        expired,
      );
      return leaseId;
    });
    const results = await this.execute(batch, false);
    const leases: DispatcherLease[] = [];
    rows.forEach((row, index) => {
      if (results[index]!.meta.changes !== 1) return;
      leases.push(
        Object.freeze({
          event: Object.freeze({
            attempts: assertNonNegativeInteger(row.attempts, "Outbox attempts"),
            availableAt: unixMilliseconds(assertTimestamp(row.available_at, "Outbox availability")),
            id: dispatcherEventId(row.id),
            payload: parseObject(row.payload_json, "Outbox payload"),
            type: row.type,
          }),
          expiresAt: unixMilliseconds(input.now + DISPATCHER_LEASE_DURATION_MS),
          id: leaseIds[index]!,
        }),
      );
    });
    return Object.freeze(leases);
  }

  public async complete(input: CompleteDispatcherLeaseInput): Promise<void> {
    const changed = await this.run(
      "update outbox_events set processed_at = ?, locked_at = null, locked_by = null where locked_by = ? and processed_at is null and locked_at > ?",
      input.completedAt,
      input.leaseId,
      input.completedAt - DISPATCHER_LEASE_DURATION_MS,
    );
    if (changed !== 1) failure("Dispatcher lease is missing or expired.");
  }

  public async retry(input: RetryDispatcherLeaseInput): Promise<void> {
    const changed = await this.run(
      "update outbox_events set attempts = attempts + 1, available_at = ?, locked_at = null, locked_by = null, last_error = ? where locked_by = ? and processed_at is null and locked_at > ?",
      input.retryAt ?? input.failedAt,
      sanitizeDispatchError(input.error),
      input.leaseId,
      input.failedAt - DISPATCHER_LEASE_DURATION_MS,
    );
    if (changed !== 1) failure("Dispatcher lease is missing or expired.");
  }

  public async requestBuild(input: EnqueueSiteBuildInput): Promise<BuildQueueReceipt> {
    const batch = this.batch();
    const token = this.guard(
      batch,
      input.requestedAt,
      input.retryOfBuildId === undefined
        ? { params: [], sql: "1 = 1" }
        : {
            params: [input.retryOfBuildId],
            sql: `exists (select 1 from site_builds where id = ? and status in ${RETRYABLE_SITE_BUILD_STATUS_SQL})`,
          },
    );
    const enqueue = this.addSiteBuildEnqueue(
      batch,
      { params: [token], sql: GUARD_SQL },
      {
        reason: input.retryOfBuildId === undefined ? "manual" : "retry",
        requestedAt: input.requestedAt,
        requestedBy: input.requestedBy.id,
        retryOfBuildId: input.retryOfBuildId ?? null,
        snapshotId: null,
      },
    );
    this.releaseGuard(batch, token);
    const results = await this.execute(batch, false);
    if (results[0]!.meta.changes !== 1) failure(RETRYABLE_SITE_BUILD_REFUSAL);
    return this.queueReceipt(results, enqueue);
  }

  public async claimSiteBuilds(input: {
    readonly limit: number;
    readonly now: UnixMilliseconds;
  }): Promise<readonly SiteBuildWorkLease[]> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100)
      throw new TypeError("Build claim limit is invalid.");
    const expired = input.now - DISPATCHER_LEASE_DURATION_MS;
    const rows = await this.all<OutboxRow>(
      "select id, type, payload_json, attempts, available_at from outbox_events where type = 'site.build.requested' and processed_at is null and available_at <= ? and (locked_at is null or locked_at <= ?) order by available_at asc, id asc limit ?",
      input.now,
      expired,
      Math.min(input.limit, D1_MAX_CLAIMS_PER_CALL),
    );
    if (rows.length === 0) return Object.freeze([]);
    const batch = this.batch();
    const claims = rows.map((row) => {
      const leaseId = dispatcherLeaseId(this.nextId());
      const payload = siteBuildPayload(row.payload_json);
      const index = batch.add(
        "update outbox_events set locked_at = ?, locked_by = ? where id = ? and payload_json = ? and processed_at is null and (locked_at is null or locked_at <= ?)",
        input.now,
        leaseId,
        row.id,
        row.payload_json,
        expired,
      );
      let started: number | undefined;
      if (payload === null) {
        batch.add(
          "update outbox_events set attempts = attempts + 1, processed_at = ?, locked_at = null, locked_by = null, last_error = 'invalid_build_event' where id = ? and locked_by = ?",
          input.now,
          row.id,
          leaseId,
        );
      } else {
        batch.add(
          "insert or ignore into site_builds (id, reason, status, target_version, published_snapshot_id, requested_by, requested_at, started_at) select ?, ?, 'running', ?, (select id from content_snapshots where id = ?), ?, ?, ? where exists (select 1 from outbox_events where id = ? and locked_by = ?)",
          row.id,
          payload.reason,
          payload.targetVersion,
          typeof payload.publishedSnapshotId === "string" ? payload.publishedSnapshotId : null,
          payload.requestedBy,
          payload.requestedAt,
          input.now,
          row.id,
          leaseId,
        );
        // pending → running after a retry, or running → running when an
        // orphaned claim is recovered; the first start time is kept.
        started = batch.add(
          `update site_builds set status = 'running', started_at = coalesce(started_at, ?) where id = ? and status in ${CLAIMABLE_SITE_BUILD_STATUS_SQL} and exists (select 1 from outbox_events where id = ? and locked_by = ?)`,
          input.now,
          row.id,
          row.id,
          leaseId,
        );
        // Defensive: a terminal build never runs again; finish its stray event.
        batch.add(
          `update outbox_events set processed_at = ?, locked_at = null, locked_by = null where id = ? and locked_by = ? and exists (select 1 from site_builds where id = ? and status not in ${CLAIMABLE_SITE_BUILD_STATUS_SQL})`,
          input.now,
          row.id,
          leaseId,
          row.id,
        );
      }
      return { index, leaseId, payload, row, started };
    });
    const results = await this.execute(batch, false);
    const leases: SiteBuildWorkLease[] = [];
    for (const { index, leaseId, payload, row, started } of claims) {
      if (
        payload === null ||
        started === undefined ||
        results[index]!.meta.changes !== 1 ||
        results[started]!.meta.changes !== 1
      )
        continue;
      leases.push(
        Object.freeze({
          buildId: siteBuildId(row.id),
          event: Object.freeze({
            attempts: row.attempts,
            availableAt: unixMilliseconds(row.available_at),
            id: dispatcherEventId(row.id),
            payload,
            type: row.type,
          }),
          expiresAt: unixMilliseconds(input.now + DISPATCHER_LEASE_DURATION_MS),
          id: leaseId,
          targetVersion: Number(payload.targetVersion),
        }),
      );
    }
    return Object.freeze(leases);
  }

  public async renewSiteBuildLease(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
  }): Promise<boolean> {
    return (
      (await this.run(
        "update outbox_events set locked_at = ? where locked_by = ? and type = 'site.build.requested' and processed_at is null and locked_at > ?",
        input.now,
        input.leaseId,
        input.now - DISPATCHER_LEASE_DURATION_MS,
      )) === 1
    );
  }

  public async recordSiteBuildAccepted(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
    readonly providerBuildId?: string;
  }): Promise<void> {
    if (input.providerBuildId !== undefined) assertProviderBuildId(input.providerBuildId);
    await this.finishLeasedSiteBuild(
      input,
      "Build cannot be accepted.",
      "update site_builds set status = 'accepted', provider_build_id = ?, started_at = coalesce(started_at, ?), completed_at = ?, error = null",
      [input.providerBuildId ?? null, input.now, input.now],
    );
  }

  public async recordSiteBuildTracking(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
    readonly providerBuildId: string;
  }): Promise<void> {
    assertProviderBuildId(input.providerBuildId);
    await this.finishLeasedSiteBuild(
      input,
      "Build cannot be tracked.",
      "update site_builds set provider_build_id = ?, provider_check_after = ?, error = null",
      [input.providerBuildId, input.now],
    );
  }

  public async recordSiteBuildSuccess(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
  }): Promise<void> {
    await this.finishLeasedSiteBuild(
      input,
      "Build cannot be completed.",
      "update site_builds set status = 'succeeded', started_at = coalesce(started_at, ?), completed_at = ?, error = null",
      [input.now, input.now],
    );
  }

  /** One guarded batch: the `running` build transition plus event completion. */
  private async finishLeasedSiteBuild(
    input: { readonly leaseId: DispatcherLeaseId; readonly now: UnixMilliseconds },
    refusal: string,
    update: string,
    parameters: readonly (number | string | null)[],
  ): Promise<void> {
    await this.transitionSiteBuild(input, refusal, (batch, id, token) => {
      batch.add(`${update} where id = ? and ${GUARD_SQL}`, ...parameters, id, token);
      batch.add(
        `update outbox_events set processed_at = ?, locked_at = null, locked_by = null where id = ? and ${GUARD_SQL}`,
        input.now,
        id,
        token,
      );
    });
  }

  public async recordSiteBuildFailure(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
    readonly reason: string;
    readonly path?: string;
    readonly retryAt?: UnixMilliseconds;
    readonly terminal: boolean;
  }): Promise<void> {
    const reason = sanitizeBuildReason(input.reason);
    const error = encodeBuildError(input.reason, input.path);
    await this.transitionSiteBuild(
      input,
      input.terminal ? "Build cannot be failed." : "Build cannot be retried.",
      (batch, id, token) => {
        if (input.terminal) {
          batch.add(
            `update site_builds set status = 'failed', started_at = coalesce(started_at, ?), completed_at = ?, error = ? where id = ? and ${GUARD_SQL}`,
            input.now,
            input.now,
            error,
            id,
            token,
          );
        } else {
          batch.add(
            `update site_builds set status = 'pending', error = ? where id = ? and ${GUARD_SQL}`,
            error,
            id,
            token,
          );
        }
        batch.add(
          `update outbox_events set attempts = attempts + 1, available_at = ?, processed_at = ?, locked_at = null, locked_by = null, last_error = ? where id = ? and ${GUARD_SQL}`,
          input.retryAt ?? input.now,
          input.terminal ? input.now : null,
          reason,
          id,
          token,
        );
      },
    );
  }

  public async completeTrackedSiteBuild(input: {
    readonly buildId: SiteBuildId;
    readonly providerBuildId: string;
    readonly now: UnixMilliseconds;
    readonly outcome: TrackedSiteBuildOutcome;
    readonly reason?: string;
    readonly stage?: SiteBuildProviderStage;
  }): Promise<void> {
    const error = trackedOutcomeError(input.outcome, input.reason);
    const [stage, checkedAt] = trackedCompletionStage(input.stage, input.now);
    const assertTransition = async (): Promise<boolean> => {
      const row = await this.first<{
        readonly error: string | null;
        readonly processed_at: number | null;
        readonly provider_build_id: string | null;
        readonly status: string;
      }>(
        "select b.status, b.provider_build_id, b.error, e.processed_at from site_builds b left join outbox_events e on e.id = b.id where b.id = ?",
        input.buildId,
      );
      if (row === undefined || row.provider_build_id !== input.providerBuildId)
        failure("Provider build does not match.");
      if (row.status === input.outcome && row.error === error) return false;
      if (row.status !== "running") failure("Build already has a different terminal outcome.");
      if (row.processed_at === null) failure("Build is still owned by dispatch.");
      return true;
    };
    if (!(await assertTransition())) return;
    const changed = await this.run(
      "update site_builds set status = ?, completed_at = ?, error = ?, provider_check_after = null, provider_stage = coalesce(?, provider_stage), provider_checked_at = coalesce(?, provider_checked_at) where id = ? and status = 'running' and provider_build_id = ? and exists (select 1 from outbox_events where id = site_builds.id and processed_at is not null)",
      input.outcome,
      input.now,
      error,
      stage,
      checkedAt,
      input.buildId,
      input.providerBuildId,
    );
    if (changed !== 1 && (await assertTransition()))
      failure("Build already has a different terminal outcome.");
  }

  /** One select and one guarded lease batch: two D1 queries per call. */
  public async claimTrackedSiteBuildChecks(input: {
    readonly limit: number;
    readonly leaseMs: number;
    readonly now: UnixMilliseconds;
  }): Promise<readonly TrackedSiteBuildCheck[]> {
    assertTrackingClaim(input);
    const rows = await this.all<DueTrackedSiteBuildRow>(
      DUE_TRACKED_SITE_BUILDS_SQL,
      input.now,
      input.limit,
    );
    if (rows.length === 0) return Object.freeze([]);
    const batch = this.batch();
    for (const row of rows)
      batch.add(
        LEASE_TRACKED_SITE_BUILD_SQL,
        input.now + input.leaseMs,
        row.id,
        row.provider_build_id,
        row.provider_check_after,
      );
    const results = await this.execute(batch, false);
    return Object.freeze(
      rows.filter((_row, index) => results[index]!.meta.changes === 1).map(trackedSiteBuildCheck),
    );
  }

  public async recordTrackedSiteBuildCheck(input: {
    readonly buildId: SiteBuildId;
    readonly providerBuildId: string;
    readonly now: UnixMilliseconds;
    readonly checkAfter: UnixMilliseconds;
    readonly stage?: SiteBuildProviderStage;
  }): Promise<boolean> {
    const update = trackedSiteBuildCheckUpdate(input);
    return (await this.run(update.sql, ...update.params)) === 1;
  }

  // -------------------------------------------------------------- helpers

  private batch(): MutationBatch {
    return new MutationBatch(this.database, this.options.beforeMutation);
  }

  /** Inserts the batch-unique guard only when the mutation precondition holds. */
  private guard(batch: MutationBatch, now: number, precondition: Condition): string {
    const token = `guard:${crypto.randomUUID()}`;
    batch.add(
      `insert into mutation_guards (token, created_at) select ?, ? where ${precondition.sql}`,
      token,
      now,
      ...precondition.params,
    );
    return token;
  }

  private releaseGuard(batch: MutationBatch, token: string): void {
    batch.add("delete from mutation_guards where token = ?", token);
  }

  private async execute(batch: MutationBatch, pageCreation: boolean): Promise<D1Result[]> {
    if (batch.statements.length > D1_MAX_BATCH_STATEMENTS) {
      failure("D1 mutation exceeds its statement budget.");
    }
    try {
      return await this.database.batch(batch.statements);
    } catch (error) {
      sqliteWriteError(error, pageCreation, "D1");
    }
  }

  private async all<Row = Record<string, unknown>>(
    sql: string,
    ...params: unknown[]
  ): Promise<Row[]> {
    return (await bind(this.database.prepare(sql), params).all<Row>()).results;
  }

  private async first<Row = Record<string, unknown>>(
    sql: string,
    ...params: unknown[]
  ): Promise<Row | undefined> {
    return (await bind(this.database.prepare(sql), params).first<Row>()) ?? undefined;
  }

  /** Runs one self-guarded statement and returns its affected-row count. */
  private async run(sql: string, ...params: unknown[]): Promise<number> {
    try {
      return (await bind(this.database.prepare(sql), params).run()).meta.changes;
    } catch (error) {
      sqliteWriteError(error, false, "D1");
    }
  }

  private nextId(): string {
    return this.options.nextId?.() ?? crypto.randomUUID();
  }

  private async entryRow(id: string): Promise<EntryRow | undefined> {
    return this.first<EntryRow>(`${ENTRY_COLUMNS_SQL} where id = ?`, id);
  }

  private async loadEntry(id: string): Promise<ContentEntry | null> {
    const row = await this.entryRow(id);
    if (row === undefined) return null;
    return (await this.hydrate([row])).get(row.id) ?? null;
  }

  private async hydrate(rows: readonly EntryRow[]): Promise<Map<string, ContentEntry>> {
    return hydrateEntries(rows, await this.loadSnapshots(snapshotIdsOf(rows)), this.resolveModel);
  }

  private async loadSnapshots(ids: readonly string[]): Promise<Map<string, StoredSnapshot>> {
    if (ids.length === 0) return new Map();
    const snapshotRows: SnapshotRow[] = [];
    const blockRows: BlockRow[] = [];
    for (const group of chunks(ids, D1_MAX_BOUND_PARAMETERS)) {
      const bindings = group.map(() => "?").join(", ");
      snapshotRows.push(
        ...(await this.all<SnapshotRow>(
          `${SNAPSHOT_COLUMNS_SQL} where s.id in (${bindings})`,
          ...group,
        )),
      );
      blockRows.push(
        ...(await this.all<BlockRow>(
          `${BLOCK_COLUMNS_SQL} where snapshot_id in (${bindings}) order by snapshot_id asc, position asc`,
          ...group,
        )),
      );
    }
    return storedSnapshots(snapshotRows, blockRows);
  }

  /** Reads model state once, returning both values and the SQL-rendered guard text. */
  private async readSyncState(): Promise<{
    readonly json: string;
    readonly state: readonly StoredContentModelState[];
  }> {
    const row = await this.first<{ readonly state: string }>(
      `select ${STORED_MODEL_STATE_JSON_SQL} as state`,
    );
    const json = row?.state ?? "[]";
    const tuples = JSON.parse(json) as readonly (readonly [
      string,
      string,
      number,
      string,
      string,
      number,
      number,
      number,
    ])[];
    const rows: StoredModelStateRow[] = tuples.map(
      ([key, kind, version, structure, projection, entries, drafts, published]) => ({
        draft_snapshot_count: drafts,
        entry_count: entries,
        key,
        kind,
        projection_hash: projection,
        published_snapshot_count: published,
        structure_hash: structure,
        version,
      }),
    );
    return { json, state: storedModelStates(rows) };
  }

  private addSnapshotInsert(
    batch: MutationBatch,
    snapshot: DraftSnapshot,
    schemaVersion: number,
    token?: string,
  ): void {
    batch.add(
      `insert into content_snapshots (id, entry_id, revision, slug, title, fields_json, schema_version, created_at, updated_at, updated_by) select ?, ?, ?, ?, ?, ?, ?, ?, ?, ? ${token === undefined ? "" : `where ${GUARD_SQL}`}`,
      snapshot.id,
      snapshot.entryId,
      snapshot.revision,
      snapshot.slug ?? null,
      snapshot.title,
      JSON.stringify(snapshot.fields),
      schemaVersion,
      snapshot.createdAt,
      snapshot.updatedAt,
      snapshot.updatedBy.id,
      ...(token === undefined ? [] : [token]),
    );
  }

  /** Multi-row block inserts; `?1` snapshot, `?2` timestamp, `?3` guard token. */
  private addBlockInserts(
    batch: MutationBatch,
    snapshotId: string,
    timestamp: number,
    blocks: readonly ContentBlock[],
    token?: string,
  ): void {
    const shared = token === undefined ? [snapshotId, timestamp] : [snapshotId, timestamp, token];
    for (const group of chunks(blocks, rowsPerStatement(shared.length, BLOCK_VALUES_PER_ROW))) {
      batch.add(
        `insert into content_blocks (snapshot_id, block_key, block_type, position, schema_version, data_json, created_at, updated_at)
         select ?1, v.column1, v.column2, v.column3, v.column4, v.column5, ?2, ?2
           from (values ${numberedValues(group.length, BLOCK_VALUES_PER_ROW, shared.length)}) v
          ${token === undefined ? "" : "where exists (select 1 from mutation_guards where token = ?3)"}`,
        ...shared,
        ...group.flatMap((block) => [
          block.key,
          block.type,
          block.position,
          block.schemaVersion,
          JSON.stringify(block.data),
        ]),
      );
    }
  }

  /**
   * Multi-row reference inserts. Missing or inactive media yields a NULL
   * `media_id`, whose `NOT NULL` failure rolls back the whole batch.
   */
  private addReferenceInserts(
    batch: MutationBatch,
    snapshotId: string,
    timestamp: number,
    references: readonly {
      readonly fieldPath: string;
      readonly mediaId: string;
      readonly sourceKey: string;
    }[],
    token?: string,
  ): void {
    const shared = token === undefined ? [snapshotId, timestamp] : [snapshotId, timestamp, token];
    for (const group of chunks(
      references,
      rowsPerStatement(shared.length, REFERENCE_VALUES_PER_ROW),
    )) {
      batch.add(
        `insert into content_media_references (snapshot_id, source_key, field_path, media_id, created_at)
         select ?1, v.column1, v.column2,
                (select m.id from media m where m.id = v.column3 and m.status = 'active'), ?2
           from (values ${numberedValues(group.length, REFERENCE_VALUES_PER_ROW, shared.length)}) v
          ${token === undefined ? "" : "where exists (select 1 from mutation_guards where token = ?3)"}`,
        ...shared,
        ...group.flatMap((reference) => [
          reference.sourceKey,
          reference.fieldPath,
          reference.mediaId,
        ]),
      );
    }
  }

  /** Increments the public version and enqueues build work under one condition. */
  private addPublicStateBump(
    batch: MutationBatch,
    condition: Condition,
    input: {
      readonly requestedAt: number;
      readonly requestedBy: string;
      readonly snapshotId: string | null;
    },
  ): number {
    batch.checkpoint("public-state");
    batch.add(
      `insert into published_state (singleton_key, version, updated_at) select 1, 1, ? where ${condition.sql}
       on conflict(singleton_key) do update set version = version + 1, updated_at = excluded.updated_at`,
      input.requestedAt,
      ...condition.params,
    );
    batch.checkpoint("build-outbox");
    return this.addSiteBuildEnqueue(batch, condition, {
      reason: input.requestedBy === "system:content-sync" ? "configuration_sync" : "publication",
      requestedAt: input.requestedAt,
      requestedBy: input.requestedBy,
      retryOfBuildId: null,
      snapshotId: input.snapshotId,
    });
  }

  /**
   * Creates a new pending build event or coalesces into the unclaimed one,
   * returning the index of a trailing `select` reporting the pending event and
   * version.
   */
  private addSiteBuildEnqueue(
    batch: MutationBatch,
    condition: Condition,
    input: {
      readonly reason: string;
      readonly requestedAt: number;
      readonly requestedBy: string;
      readonly retryOfBuildId: string | null;
      readonly snapshotId: string | null;
    },
  ): number {
    const eventId = this.nextId();
    const payload = (retry: string) =>
      `json_patch(json_object('publishedSnapshotId', ?, 'reason', ?, 'requestedAt', ?, 'requestedBy', ?, 'targetVersion', coalesce((select version from published_state where singleton_key = 1), 0)), json_object('retryOfBuildId', ${retry}))`;
    const payloadParams = [input.snapshotId, input.reason, input.requestedAt, input.requestedBy];
    const availableAt = input.requestedAt + SITE_BUILD_DEBOUNCE_MS;
    batch.add(
      `insert or ignore into outbox_events (id, type, payload_json, attempts, available_at, created_at)
       select ?, 'site.build.requested', ${payload("?")}, 0, ?, ? where ${condition.sql}`,
      eventId,
      ...payloadParams,
      input.retryOfBuildId,
      availableAt,
      input.requestedAt,
      ...condition.params,
    );
    batch.add(
      `update outbox_events
          set payload_json = ${payload("coalesce(?, json_extract(payload_json, '$.retryOfBuildId'))")},
              available_at = ?
        where ${PENDING_SITE_BUILD_SQL} and id <> ? and ${condition.sql}`,
      ...payloadParams,
      input.retryOfBuildId,
      availableAt,
      eventId,
      ...condition.params,
    );
    return batch.add(
      `select ? as event_id,
              (select id from outbox_events where ${PENDING_SITE_BUILD_SQL}) as pending_id,
              coalesce((select version from published_state where singleton_key = 1), 0) as version`,
      eventId,
    );
  }

  private queueReceipt(results: readonly D1Result[], index: number): BuildQueueReceipt {
    const row = results[index]!.results[0] as
      | { readonly event_id: string; readonly pending_id: string | null; readonly version: number }
      | undefined;
    if (row?.pending_id == null) failure("Build request could not be queued.");
    return {
      coalesced: row.pending_id !== row.event_id,
      eventId: dispatcherEventId(row.pending_id),
      targetVersion: row.version,
    };
  }

  private stateVersion(results: readonly D1Result[], index: number): number {
    return this.queueReceipt(results, index).targetVersion;
  }

  private publishedEntry(
    entry: ContentEntry,
    input: PublishContentEntryCommand,
    publisherRole: string | undefined,
  ): ContentEntry {
    const draft = entry.draft;
    const source: StoredSnapshot = {
      blocks: draft.blocks,
      createdAt: input.publishedAt,
      entryId: draft.entryId,
      fields: draft.fields,
      id: input.publishedSnapshotId,
      revision: draft.revision,
      ...(draft.slug === undefined ? {} : { slug: draft.slug }),
      title: draft.title,
      updatedAt: input.publishedAt,
      updatedBy: { id: input.publishedBy.id, role: storedRole(publisherRole) },
    };
    return Object.freeze({
      draft,
      id: entry.id,
      model: entry.model,
      published: snapshotValue(source, "published"),
    });
  }

  private async replayPublication(
    scope: string,
    idempotency: NonNullable<PublishContentEntryCommand["idempotency"]>,
  ): Promise<PublishContentEntryResult | null> {
    const prior = await this.first<{
      readonly request_hash: string;
      readonly response_json: string;
    }>(
      "select request_hash, response_json from idempotency_records where scope = ? and key = ?",
      scope,
      idempotency.key,
    );
    if (prior === undefined) return null;
    if (prior.request_hash !== idempotency.fingerprint)
      failure("Publication idempotency key was reused with different input.");
    return {
      entry: JSON.parse(prior.response_json) as ContentEntry,
      outcome: "replayed",
      status: "published",
    };
  }

  private async requestMediaDeletion(
    input: MarkMediaForDeletionInput,
    expectedStatus: "active" | "delete_failed",
    message: string,
  ): Promise<MarkMediaForDeletionResult> {
    const batch = this.batch();
    const token = this.guard(batch, input.requestedAt, {
      params: [input.mediaId, expectedStatus],
      sql: "exists (select 1 from media m where m.id = ? and m.status = ? and not exists (select 1 from content_media_references r where r.media_id = m.id))",
    });
    batch.checkpoint(expectedStatus === "active" ? "media.mark" : "media.retry");
    batch.add(
      `update media set status = 'deleting', ${expectedStatus === "active" ? "" : "last_error = null, "}updated_at = ? where id = ? and ${GUARD_SQL}`,
      input.requestedAt,
      input.mediaId,
      token,
    );
    batch.checkpoint("media.outbox");
    batch.add(
      `insert into outbox_events (id, type, payload_json, attempts, available_at, created_at) select ?, 'media.delete.requested', ?, 0, ?, ? where ${GUARD_SQL}`,
      this.nextId(),
      JSON.stringify({ mediaId: input.mediaId, requestedBy: input.requestedBy.id }),
      input.requestedAt,
      input.requestedAt,
      token,
    );
    this.releaseGuard(batch, token);
    const results = await this.execute(batch, false);
    if (results[0]!.meta.changes !== 1) {
      const row = await this.first<{ readonly referenced: number; readonly status: string }>(
        "select status, exists(select 1 from content_media_references where media_id = ?) as referenced from media where id = ?",
        input.mediaId,
        input.mediaId,
      );
      if (row?.status === expectedStatus && row.referenced === 1) {
        throw new DomainError("MEDIA_IN_USE", "Media is still referenced by content.");
      }
      failure(message);
    }
    const media = await this.loadMedia(input.mediaId);
    if (media === null) failure("Media deletion mark could not be reloaded.");
    return { media, status: "deleting" };
  }

  private async requireLeasedMediaDeletionEvent(
    leaseId: string,
    now: number,
    mediaId: string,
  ): Promise<{ readonly id: string }> {
    const event = await this.first<{ readonly id: string; readonly payload_json: string }>(
      "select id, payload_json from outbox_events where locked_by = ? and type = 'media.delete.requested' and processed_at is null and locked_at > ?",
      leaseId,
      now - DISPATCHER_LEASE_DURATION_MS,
    );
    if (event === undefined) failure("Dispatcher lease is missing or expired.");
    const payload = parseObject(event.payload_json, "Outbox payload");
    if (payload.mediaId !== mediaId) failure("Dispatcher event does not match media.");
    return event;
  }

  /** Applies a lease-guarded pending-build transition and ends the lease atomically. */
  private async transitionSiteBuild(
    input: { readonly leaseId: DispatcherLeaseId; readonly now: UnixMilliseconds },
    refusal: string,
    statements: (batch: MutationBatch, buildId: string, token: string) => void,
  ): Promise<void> {
    const leased = await this.first<{ readonly id: string }>(
      LEASED_SITE_BUILD_SQL,
      input.leaseId,
      input.now - DISPATCHER_LEASE_DURATION_MS,
    );
    if (leased === undefined) failure("Dispatcher lease is missing or expired.");
    const batch = this.batch();
    const token = this.guard(batch, input.now, {
      params: [leased.id, input.leaseId, input.now - DISPATCHER_LEASE_DURATION_MS, leased.id],
      sql: "exists (select 1 from outbox_events where id = ? and locked_by = ? and type = 'site.build.requested' and processed_at is null and locked_at > ?) and exists (select 1 from site_builds where id = ? and status = 'running')",
    });
    statements(batch, leased.id, token);
    this.releaseGuard(batch, token);
    const results = await this.execute(batch, false);
    if (results[0]!.meta.changes !== 1) {
      const current = await this.first(
        LEASED_SITE_BUILD_SQL,
        input.leaseId,
        input.now - DISPATCHER_LEASE_DURATION_MS,
      );
      if (current === undefined) failure("Dispatcher lease is missing or expired.");
      failure(refusal);
    }
  }
}

export function d1ContentRepository(
  database: D1Database,
  resolveModel: ContentModelResolver,
  options?: D1RepositoryOptions,
): D1ContentRepository {
  return new D1ContentRepository(database, resolveModel, options);
}

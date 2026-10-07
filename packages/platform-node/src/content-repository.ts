import {
  actorDisplayName,
  DISPATCHER_LEASE_DURATION_MS,
  SITE_BUILD_DEBOUNCE_MS,
  dispatcherEventId,
  foldAscii,
  ALLOWED_MEDIA_MIME_TYPES,
  MAX_MEDIA_USAGE_ENTRIES,
  dispatcherLeaseId,
  planConfigurationSynchronization,
  renderConfigurationSyncPlanJson,
} from "@lacecms/application";
import type {
  ActorSummary,
  ApplyConfigurationSynchronizationInput,
  ApplyConfigurationSynchronizationResult,
  BuildContentExport,
  ClaimDispatcherEventsInput,
  CompleteDispatcherLeaseInput,
  ContentCommandResult,
  ContentEntryCommandPort,
  ContentEntryListPage,
  ContentEntryReadPort,
  ConfigurationSyncApplyPort,
  ConfigurationSyncStateReadPort,
  CreateContentEntryInput,
  CreateMediaMetadataInput,
  CursorPage,
  DispatcherLease,
  DispatcherLeasePort,
  ListContentEntriesInput,
  ListMediaInput,
  LoadMediaUsageInput,
  MediaCatalogItem,
  MediaCatalogPort,
  ListPublicContentInput,
  LoadContentEntryInput,
  MarkMediaForDeletionInput,
  MarkMediaForDeletionResult,
  MediaCommandPort,
  MediaDeletionDispatchPort,
  MediaListPort,
  MediaReadPort,
  MediaUsageEntry,
  PublishContentEntryCommand,
  PublishContentEntryResult,
  PublicContentEntry,
  PublicContentReadPort,
  SaveCompleteDraftInput,
  RetryDispatcherLeaseInput,
  BuildQueueReceipt,
  EnqueueSiteBuildInput,
  SiteBuildCommandPort,
  SiteBuildReadPort,
  SiteBuildRecord,
  SiteBuildDispatchPort,
  SiteBuildWorkLease,
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
  PUBLICATION_IDEMPOTENCY_TTL_MS,
  PUBLIC_MEDIA_SQL,
  PUBLIC_ROUTE_SQL,
  SNAPSHOT_COLUMNS_SQL,
  STORED_MODEL_STATE_SQL,
  SQL_MAX_PAGE_SIZE,
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
  sameStoredModelStates,
  sanitizeBuildReason,
  encodeBuildError,
  sanitizeDispatchError,
  CLAIMABLE_SITE_BUILD_STATUS_SQL,
  RETRYABLE_SITE_BUILD_REFUSAL,
  assertProviderBuildId,
  assertTrackingClaim,
  DUE_TRACKED_SITE_BUILDS_SQL,
  LEASE_TRACKED_SITE_BUILD_SQL,
  trackedCompletionStage,
  trackedOutcomeError,
  trackedSiteBuildCheck,
  trackedSiteBuildCheckUpdate,
  RETRYABLE_SITE_BUILD_STATUS_SQL,
  siteBuildPayload,
  siteBuildRecord,
  snapshotIdsOf,
  sqliteWriteError,
  storedModelStates,
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
  contentSnapshotId,
  resolveContentPublicPath,
  siteBuildId,
  unixMilliseconds,
} from "@lacecms/domain";
import type {
  ActorId,
  ContentEntry,
  DraftSnapshot,
  MediaMetadata,
  PublishedSnapshot,
} from "@lacecms/domain";
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { NodeDatabase } from "./index.js";

const SQLITE_BIND_CHUNK = 200;

export type { ContentModelResolver } from "@lacecms/db";

export interface NodeRepositoryOptions {
  readonly beforeMutation?: (checkpoint: string) => void;
  readonly nextId?: () => string;
}

/**
 * Node SQLite implementation of bounded content reads plus draft creation and
 * replacement. Guarded publication and deletion intentionally belong to 5C.
 */
export class NodeContentRepository
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
    private readonly connection: Database.Database,
    private readonly resolveModel: ContentModelResolver,
    private readonly options: NodeRepositoryOptions = {},
  ) {}

  public async readConfigurationSyncState(): Promise<readonly StoredContentModelState[]> {
    return this.readConfigurationSyncStateNow();
  }

  public async applyConfigurationSynchronization(
    input: ApplyConfigurationSynchronizationInput,
  ): Promise<ApplyConfigurationSynchronizationResult> {
    try {
      return this.connection.transaction(() => {
        const current = this.readConfigurationSyncStateNow();
        const actualPlan = planConfigurationSynchronization({
          models: input.models,
          storedModels: current,
        });
        if (
          !input.plan.isValid ||
          !sameStoredModelStates(input.expectedStoredModels, current) ||
          renderConfigurationSyncPlanJson(input.plan) !==
            renderConfigurationSyncPlanJson(actualPlan)
        ) {
          failure("Configuration synchronization plan is stale.");
        }
        if (!actualPlan.requiresApply) {
          return Object.freeze({ operations: Object.freeze([]), status: "noop" as const });
        }

        const expectedByKey = new Map(
          input.expectedStoredModels.map((model) => [model.key, model]),
        );
        const configurationByKey = new Map(input.models.map((model) => [model.key, model]));
        const pageEntries = new Map(input.pageEntries.map((page) => [page.modelKey, page]));
        for (const operation of actualPlan.operations) {
          if (operation.action === "create") {
            const configuration = configurationByKey.get(operation.model.key);
            if (configuration === undefined) failure("Synchronization model is unavailable.");
            this.checkpoint("sync.model.create");
            this.connection
              .prepare(
                "insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
              )
              .run(
                operation.model.key,
                operation.model.kind,
                configuration.label ?? configuration.key,
                operation.model.version,
                operation.model.structureHash,
                operation.model.projectionHash,
                input.appliedAt,
                input.appliedAt,
              );
            if (configuration.kind === "page") {
              const page = pageEntries.get(operation.model.key);
              if (page === undefined || page.entry.model.key !== operation.model.key) {
                failure("Page synchronization entry is missing or invalid.");
              }
              this.checkpoint("sync.page.entry");
              this.connection
                .prepare(
                  "insert into content_entries (id, model_key, singleton_key, created_by, created_at, updated_at) values (?, ?, 1, ?, ?, ?)",
                )
                .run(
                  page.entry.id,
                  operation.model.key,
                  page.entry.draft.updatedBy.id,
                  page.entry.draft.createdAt,
                  page.entry.draft.updatedAt,
                );
              this.checkpoint("sync.page.snapshot");
              this.insertSnapshot(page.entry.draft, operation.model.version);
              this.insertBlocks(page.entry.draft);
              this.connection
                .prepare("update content_entries set draft_snapshot_id = ? where id = ?")
                .run(page.entry.draft.id, page.entry.id);
            }
            continue;
          }
          if (operation.action === "remove") {
            const expected = expectedByKey.get(operation.model.key);
            if (expected === undefined) failure("Synchronization removal guard is missing.");
            this.checkpoint("sync.model.remove");
            const removed = this.connection
              .prepare(
                "delete from content_models where key = ? and kind = ? and config_version = ? and structure_hash = ? and projection_hash = ?",
              )
              .run(
                expected.key,
                expected.kind,
                expected.version,
                expected.structureHash,
                expected.projectionHash,
              );
            if (removed.changes !== 1) failure("Configuration synchronization plan is stale.");
            continue;
          }
          if (
            operation.action === "blocked-removal" ||
            operation.action === "incompatible-change"
          ) {
            failure("Configuration synchronization plan contains an unsafe operation.");
          }
          const configuration = configurationByKey.get(operation.model.key);
          if (configuration === undefined) failure("Synchronization model is unavailable.");
          const previousKey =
            operation.action === "rename" ? operation.renamedFrom : operation.model.key;
          const expected = expectedByKey.get(previousKey);
          if (expected === undefined) failure("Synchronization update guard is missing.");
          this.checkpoint(`sync.model.${operation.action}`);
          const updated = this.connection
            .prepare(
              "update content_models set key = ?, kind = ?, label = ?, config_version = ?, structure_hash = ?, projection_hash = ?, updated_at = ? where key = ? and kind = ? and config_version = ? and structure_hash = ? and projection_hash = ?",
            )
            .run(
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
            );
          if (updated.changes !== 1) failure("Configuration synchronization plan is stale.");
        }
        const targetVersion = this.bumpPublicState(input.appliedAt, "system:content-sync", null);
        return Object.freeze({
          operations: actualPlan.operations,
          status: "applied" as const,
          targetVersion,
        });
      })();
    } catch (error) {
      this.throwWriteError(error, true);
    }
  }

  public async create(input: CreateContentEntryInput): Promise<ContentCommandResult> {
    const { draft, id, model } = input.entry;
    assertDraftPersistenceBounds(draft.blocks, input.mediaReferences);
    try {
      this.connection.transaction(() => {
        const version = this.connection
          .prepare("select config_version from content_models where key = ?")
          .get(model.key) as { readonly config_version: number } | undefined;
        if (version === undefined) failure(`Content model ${model.key} does not exist.`);
        this.connection
          .prepare(
            "insert into content_entries (id, model_key, singleton_key, created_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?)",
          )
          .run(
            id,
            model.key,
            model.kind === "page" ? 1 : null,
            draft.updatedBy.id,
            draft.createdAt,
            draft.updatedAt,
          );
        this.insertSnapshot(draft, version.config_version);
        this.insertBlocks(draft);
        this.insertReferences(draft.id, input.mediaReferences, draft.updatedAt);
        this.connection
          .prepare("update content_entries set draft_snapshot_id = ? where id = ?")
          .run(draft.id, id);
      })();
    } catch (error) {
      this.throwWriteError(error, model.kind === "page");
    }
    const entry = this.loadEntry(id);
    if (entry === null) failure("Created content entry could not be reloaded.");
    return { entry, status: "created" };
  }

  public async saveCompleteDraft(input: SaveCompleteDraftInput): Promise<ContentCommandResult> {
    assertDraftPersistenceBounds(input.mutation.blocks, input.mutation.mediaReferences);
    const existing = this.entryRow(input.entryId);
    if (existing === undefined || existing.draft_snapshot_id === null) {
      failure("Content entry does not have a mutable draft.");
    }
    const draftSnapshotId = existing.draft_snapshot_id;
    try {
      this.connection.transaction(() => {
        const changed = this.connection
          .prepare(
            "update content_snapshots set revision = revision + 1, slug = ?, title = ?, fields_json = ?, updated_at = ?, updated_by = ? where id = ? and revision = ?",
          )
          .run(
            input.mutation.slug ?? null,
            input.mutation.title,
            JSON.stringify(input.mutation.fields),
            input.mutation.updatedAt,
            input.mutation.updatedBy.id,
            draftSnapshotId,
            input.mutation.expectedRevision,
          );
        if (changed.changes !== 1) {
          throw new DomainError(
            "CONTENT_REVISION_CONFLICT",
            "The draft revision no longer matches the expected revision.",
          );
        }
        this.connection
          .prepare("delete from content_blocks where snapshot_id = ?")
          .run(draftSnapshotId);
        this.connection
          .prepare("delete from content_media_references where snapshot_id = ?")
          .run(draftSnapshotId);
        this.insertBlocks({ ...input.mutation, id: contentSnapshotId(draftSnapshotId) });
        this.insertReferences(
          draftSnapshotId,
          input.mutation.mediaReferences,
          input.mutation.updatedAt,
        );
        this.connection
          .prepare("update content_entries set updated_at = ? where id = ?")
          .run(input.mutation.updatedAt, input.entryId);
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
    const entry = this.loadEntry(input.entryId);
    if (entry === null) failure("Saved content entry could not be reloaded.");
    return { entry, status: "saved" };
  }

  public async publish(input: PublishContentEntryCommand): Promise<PublishContentEntryResult> {
    const entry = this.loadEntry(input.entryId);
    if (entry === null) failure("Content entry does not exist.");
    const path = resolveContentPublicPath(entry.model, entry.draft.slug);
    const scope =
      input.idempotency === undefined
        ? undefined
        : `publication:${input.entryId}:${input.idempotency.actorId}`;
    try {
      const result = this.connection.transaction(() => {
        if (input.idempotency !== undefined) {
          if (input.idempotency.actorId !== input.publishedBy.id)
            failure("Publication idempotency actor must match publisher.");
          const prior = this.connection
            .prepare(
              "select request_hash, response_json from idempotency_records where scope = ? and key = ?",
            )
            .get(scope, input.idempotency.key) as
            | { request_hash: string; response_json: string }
            | undefined;
          if (prior !== undefined) {
            if (prior.request_hash !== input.idempotency.fingerprint)
              failure("Publication idempotency key was reused with different input.");
            return {
              entry: JSON.parse(prior.response_json) as ContentEntry,
              outcome: "replayed" as const,
              status: "published" as const,
            };
          }
        }
        this.checkpoint("publish.snapshot");
        const copied = this.connection
          .prepare(
            "insert into content_snapshots (id, entry_id, revision, slug, title, fields_json, schema_version, created_at, updated_at, updated_by) select ?, s.entry_id, s.revision, s.slug, s.title, s.fields_json, s.schema_version, ?, ?, ? from content_snapshots s join content_entries e on e.draft_snapshot_id = s.id where e.id = ? and s.revision = ?",
          )
          .run(
            input.publishedSnapshotId,
            input.publishedAt,
            input.publishedAt,
            input.publishedBy.id,
            input.entryId,
            input.expectedRevision,
          );
        if (copied.changes !== 1)
          throw new DomainError(
            "CONTENT_REVISION_CONFLICT",
            "The draft revision no longer matches the expected revision.",
          );
        this.checkpoint("publish.blocks");
        this.connection
          .prepare(
            "insert into content_blocks (snapshot_id, block_key, block_type, position, schema_version, data_json, created_at, updated_at) select ?, block_key, block_type, position, schema_version, data_json, created_at, updated_at from content_blocks where snapshot_id = ?",
          )
          .run(input.publishedSnapshotId, entry.draft.id);
        this.checkpoint("publish.references");
        this.connection
          .prepare(
            "insert into content_media_references (snapshot_id, source_key, field_path, media_id, created_at) select ?, source_key, field_path, media_id, created_at from content_media_references where snapshot_id = ?",
          )
          .run(input.publishedSnapshotId, entry.draft.id);
        this.checkpoint("publish.route");
        this.connection
          .prepare("delete from published_routes where entry_id = ?")
          .run(input.entryId);
        this.connection
          .prepare(
            "insert into published_routes (path, entry_id, snapshot_id, updated_at) values (?, ?, ?, ?)",
          )
          .run(path, input.entryId, input.publishedSnapshotId, input.publishedAt);
        this.connection
          .prepare(
            "update content_entries set published_snapshot_id = ?, updated_at = ? where id = ?",
          )
          .run(input.publishedSnapshotId, input.publishedAt, input.entryId);
        const targetVersion = this.bumpPublicState(
          input.publishedAt,
          input.publishedBy.id,
          input.publishedSnapshotId,
        );
        const committed = this.loadEntry(input.entryId);
        if (committed === null) failure("Published content entry could not be reloaded.");
        if (input.idempotency !== undefined)
          this.connection
            .prepare(
              "insert into idempotency_records (scope, key, request_hash, response_json, created_at, expires_at) values (?, ?, ?, ?, ?, ?)",
            )
            .run(
              scope,
              input.idempotency.key,
              input.idempotency.fingerprint,
              JSON.stringify(committed),
              input.publishedAt,
              input.publishedAt + PUBLICATION_IDEMPOTENCY_TTL_MS,
            );
        if (entry.published !== undefined)
          this.connection
            .prepare("delete from content_snapshots where id = ?")
            .run(entry.published.id);
        return {
          entry: committed,
          outcome: "published" as const,
          status: "published" as const,
          targetVersion,
        };
      })();
      return result;
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  public async delete(
    input: import("@lacecms/application").DeleteContentEntryInput,
  ): Promise<ContentCommandResult> {
    try {
      this.connection.transaction(() => {
        const entry = this.entryRow(input.entryId);
        if (entry === undefined) failure("Content entry does not exist.");
        const expectedPublishedSnapshotId = input.expectedPublishedSnapshotId ?? null;
        if (entry.published_snapshot_id !== expectedPublishedSnapshotId) {
          throw new DomainError(
            "CONTENT_REVISION_CONFLICT",
            "The publication state no longer matches the deletion guard.",
          );
        }
        if (entry.published_snapshot_id !== null) {
          this.checkpoint("delete.route");
          this.connection
            .prepare("delete from published_routes where entry_id = ?")
            .run(input.entryId);
          this.bumpPublicState(input.deletedAt, input.deletedBy.id, entry.published_snapshot_id);
        }
        this.checkpoint("delete.entry");
        const deleted = this.connection
          .prepare(
            "delete from content_entries where id = ? and published_snapshot_id is ? and exists (select 1 from content_snapshots where id = content_entries.draft_snapshot_id and revision = ?)",
          )
          .run(input.entryId, expectedPublishedSnapshotId, input.expectedRevision);
        if (deleted.changes !== 1) {
          throw new DomainError(
            "CONTENT_REVISION_CONFLICT",
            "The draft revision no longer matches the deletion guard.",
          );
        }
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
    return { status: "deleted" };
  }

  public async markForDeletion(
    input: MarkMediaForDeletionInput,
  ): Promise<MarkMediaForDeletionResult> {
    try {
      this.connection.transaction(() => {
        this.checkpoint("media.mark");
        const changed = this.connection
          .prepare(
            "update media set status = 'deleting', updated_at = ? where id = ? and status = 'active' and not exists (select 1 from content_media_references where media_id = ?)",
          )
          .run(input.requestedAt, input.mediaId, input.mediaId);
        if (changed.changes !== 1) {
          this.refuseDeletion(input.mediaId, "active", "Media is not eligible for deletion.");
        }
        this.checkpoint("media.outbox");
        this.connection
          .prepare(
            "insert into outbox_events (id, type, payload_json, attempts, available_at, created_at) values (?, 'media.delete.requested', ?, 0, ?, ?)",
          )
          .run(
            this.nextId(),
            JSON.stringify({ mediaId: input.mediaId, requestedBy: input.requestedBy.id }),
            input.requestedAt,
            input.requestedAt,
          );
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
    const media = await this.loadMedia(input.mediaId);
    if (media === null) failure("Media deletion mark could not be reloaded.");
    return { media, status: "deleting" };
  }

  public async retryDeletion(
    input: MarkMediaForDeletionInput,
  ): Promise<MarkMediaForDeletionResult> {
    try {
      this.connection.transaction(() => {
        this.checkpoint("media.retry");
        const changed = this.connection
          .prepare(
            "update media set status = 'deleting', last_error = null, updated_at = ? where id = ? and status = 'delete_failed' and not exists (select 1 from content_media_references where media_id = ?)",
          )
          .run(input.requestedAt, input.mediaId, input.mediaId);
        if (changed.changes !== 1) {
          this.refuseDeletion(input.mediaId, "delete_failed", "Media deletion cannot be retried.");
        }
        this.checkpoint("media.outbox");
        this.connection
          .prepare(
            "insert into outbox_events (id, type, payload_json, attempts, available_at, created_at) values (?, 'media.delete.requested', ?, 0, ?, ?)",
          )
          .run(
            this.nextId(),
            JSON.stringify({ mediaId: input.mediaId, requestedBy: input.requestedBy.id }),
            input.requestedAt,
            input.requestedAt,
          );
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
    const media = await this.loadMedia(input.mediaId);
    if (media === null) failure("Media deletion retry could not be reloaded.");
    return { media, status: "deleting" };
  }

  public async claim(input: ClaimDispatcherEventsInput): Promise<readonly DispatcherLease[]> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > SQL_MAX_PAGE_SIZE) {
      failure("Dispatcher claim limit is invalid.");
    }
    if (input.eventTypes.length === 0 || input.eventTypes.some((type) => type.length === 0)) {
      failure("Dispatcher event types are invalid.");
    }
    const placeholders = input.eventTypes.map(() => "?").join(", ");
    const leases: DispatcherLease[] = [];
    try {
      this.connection.transaction(() => {
        const rows = this.connection
          .prepare(
            `select id, type, payload_json, attempts, available_at
               from outbox_events
              where processed_at is null
                and type in (${placeholders})
                and available_at <= ?
                and (locked_at is null or locked_at <= ?)
              order by available_at asc, id asc
              limit ?`,
          )
          .all(
            ...input.eventTypes,
            input.now,
            input.now - DISPATCHER_LEASE_DURATION_MS,
            input.limit,
          ) as readonly OutboxRow[];
        const claim = this.connection.prepare(
          "update outbox_events set locked_at = ?, locked_by = ? where id = ? and processed_at is null and (locked_at is null or locked_at <= ?)",
        );
        for (const row of rows) {
          const leaseId = dispatcherLeaseId(this.nextId());
          const claimed = claim.run(
            input.now,
            leaseId,
            row.id,
            input.now - DISPATCHER_LEASE_DURATION_MS,
          );
          if (claimed.changes !== 1) continue;
          leases.push(
            Object.freeze({
              event: Object.freeze({
                attempts: assertNonNegativeInteger(row.attempts, "Outbox attempts"),
                availableAt: unixMilliseconds(
                  assertTimestamp(row.available_at, "Outbox availability"),
                ),
                id: dispatcherEventId(row.id),
                payload: parseObject(row.payload_json, "Outbox payload"),
                type: row.type,
              }),
              expiresAt: unixMilliseconds(input.now + DISPATCHER_LEASE_DURATION_MS),
              id: leaseId,
            }),
          );
        }
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
    return Object.freeze(leases);
  }

  public async complete(input: CompleteDispatcherLeaseInput): Promise<void> {
    try {
      const changed = this.connection
        .prepare(
          "update outbox_events set processed_at = ?, locked_at = null, locked_by = null where locked_by = ? and processed_at is null and locked_at > ?",
        )
        .run(input.completedAt, input.leaseId, input.completedAt - DISPATCHER_LEASE_DURATION_MS);
      if (changed.changes !== 1) failure("Dispatcher lease is missing or expired.");
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  public async retry(input: RetryDispatcherLeaseInput): Promise<void> {
    try {
      const changed = this.connection
        .prepare(
          "update outbox_events set attempts = attempts + 1, available_at = ?, locked_at = null, locked_by = null, last_error = ? where locked_by = ? and processed_at is null and locked_at > ?",
        )
        .run(
          input.retryAt ?? input.failedAt,
          sanitizeDispatchError(input.error),
          input.leaseId,
          input.failedAt - DISPATCHER_LEASE_DURATION_MS,
        );
      if (changed.changes !== 1) failure("Dispatcher lease is missing or expired.");
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  public async loadDeletingMedia(id: string): Promise<MediaMetadata | null> {
    const media = await this.loadMedia(id);
    return media?.status === "deleting" ? media : null;
  }

  public async completeMediaDeletion(input: {
    readonly completedAt: number;
    readonly leaseId: string;
    readonly mediaId: string;
  }): Promise<void> {
    try {
      this.connection.transaction(() => {
        const event = this.requireLeasedMediaDeletionEvent(
          input.leaseId,
          input.completedAt,
          input.mediaId,
        );
        const deleted = this.connection
          .prepare(
            "delete from media where id = ? and status = 'deleting' and not exists (select 1 from content_media_references where media_id = ?)",
          )
          .run(input.mediaId, input.mediaId);
        if (deleted.changes !== 1) failure("Media deletion can no longer be finalized.");
        const completed = this.connection
          .prepare(
            "update outbox_events set processed_at = ?, locked_at = null, locked_by = null where id = ? and locked_by = ?",
          )
          .run(input.completedAt, event.id, input.leaseId);
        if (completed.changes !== 1) failure("Dispatcher lease is missing or expired.");
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  public async failMediaDeletion(input: {
    readonly failedAt: number;
    readonly leaseId: string;
    readonly mediaId: string;
    readonly sanitizedError: string;
    readonly terminal: boolean;
    readonly retryAt?: number;
  }): Promise<void> {
    const error = sanitizeDispatchError(input.sanitizedError);
    try {
      this.connection.transaction(() => {
        const event = this.requireLeasedMediaDeletionEvent(
          input.leaseId,
          input.failedAt,
          input.mediaId,
        );
        if (input.terminal) {
          const failed = this.connection
            .prepare(
              "update media set status = 'delete_failed', last_error = ?, updated_at = ? where id = ? and status = 'deleting'",
            )
            .run(error, input.failedAt, input.mediaId);
          if (failed.changes !== 1) failure("Media deletion can no longer be failed safely.");
          const completed = this.connection
            .prepare(
              "update outbox_events set attempts = attempts + 1, processed_at = ?, locked_at = null, locked_by = null, last_error = ? where id = ? and locked_by = ?",
            )
            .run(input.failedAt, error, event.id, input.leaseId);
          if (completed.changes !== 1) failure("Dispatcher lease is missing or expired.");
          return;
        }
        const retried = this.connection
          .prepare(
            "update outbox_events set attempts = attempts + 1, available_at = ?, locked_at = null, locked_by = null, last_error = ? where id = ? and locked_by = ?",
          )
          .run(input.retryAt ?? input.failedAt, error, event.id, input.leaseId);
        if (retried.changes !== 1) failure("Dispatcher lease is missing or expired.");
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  public async createMedia(input: CreateMediaMetadataInput): Promise<MediaMetadata> {
    try {
      this.connection
        .prepare(
          "insert into media (id, storage_key, filename, mime_type, size, width, height, metadata_json, status, created_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, '{}', 'active', ?, ?, ?)",
        )
        .run(
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
        );
    } catch (error) {
      this.throwWriteError(error, false);
    }
    const media = await this.loadMedia(input.id);
    if (media === null) failure("Created media could not be reloaded.");
    return media;
  }

  public async load(input: LoadContentEntryInput): Promise<ContentEntry | null> {
    return this.loadEntry(input.entryId);
  }

  public async loadDraft(input: LoadContentEntryInput): Promise<DraftSnapshot | null> {
    return this.loadEntry(input.entryId)?.draft ?? null;
  }

  public async loadPublished(input: LoadContentEntryInput): Promise<PublishedSnapshot | null> {
    return this.loadEntry(input.entryId)?.published ?? null;
  }

  public async describeActors(ids: readonly ActorId[]): Promise<readonly ActorSummary[]> {
    const names = new Map<string, string>();
    for (const group of chunks([...new Set(ids)], SQLITE_BIND_CHUNK)) {
      const rows = this.connection
        .prepare(`select id, name from user where id in (${group.map(() => "?").join(", ")})`)
        .all(...group) as readonly { readonly id: string; readonly name: string }[];
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
    const searchBindings = term === undefined ? [] : [term, term];
    const searchClause = term === undefined ? "" : `and ${ENTRY_SEARCH_SQL}`;
    const comparison = descending ? "<" : ">";
    const direction = descending ? "desc" : "asc";
    const rows = this.connection
      .prepare(
        `select e.id, e.model_key, e.published_snapshot_id, e.updated_at,
                d.revision as draft_revision, d.title, d.slug, d.fields_json, d.updated_by,
                u.name as updated_by_name, p.created_at as published_at,
                ${ENTRY_STATUS_SQL} as status, ${sort.value} as sort_value
           from ${ENTRY_SOURCE_SQL}
           left join user u on u.id = d.updated_by
          where e.model_key = ? ${searchClause}
            ${input.status === undefined ? "" : `and ${ENTRY_STATUS_SQL} = ?`}
            ${
              after === undefined
                ? ""
                : `and (${sort.order} ${comparison} ? or (${sort.order} = ? and e.id ${comparison} ?))`
            }
          order by ${sort.order} ${direction}, e.id ${direction} limit ?`,
      )
      .all(
        input.modelKey,
        ...searchBindings,
        ...(input.status === undefined ? [] : [input.status]),
        ...(after === undefined ? [] : [after.value, after.value, after.id]),
        limit + 1,
      ) as readonly SummaryRow[];
    const pageRows = rows.slice(0, limit);
    const items = pageRows.map((row) => entrySummary(row, input.listFields));
    const last = pageRows.at(-1);
    return Object.freeze({
      items: Object.freeze(items),
      ...(rows.length > limit && last !== undefined
        ? { nextCursor: encodeSortCursor(kind, last.sort_value, last.id) }
        : {}),
      totals: this.entryTotals(input.modelKey, term),
    });
  }

  private entryTotals(modelKey: string, term: string | undefined) {
    return entryTotals(
      this.connection
        .prepare(entryTotalsSql(term !== undefined))
        .get(modelKey, ...(term === undefined ? [] : [term, term])) as TotalsRow,
    );
  }

  public async listPublic(input: ListPublicContentInput): Promise<CursorPage<PublicContentEntry>> {
    const limit = assertPageSize(input.limit);
    const cursorKind = `public:${input.modelKey}`;
    const after = input.after === undefined ? undefined : decodeCursor(input.after, cursorKind);
    const rows = this.connection
      .prepare(
        `${PUBLIC_ROUTE_SQL}
          where e.model_key = ?
            ${after === undefined ? "" : "and (s.created_at < ? or (s.created_at = ? and e.id < ?))"}
          order by s.created_at desc, e.id desc limit ?`,
      )
      .all(
        ...(after === undefined
          ? [input.modelKey, limit + 1]
          : [input.modelKey, after.timestamp, after.timestamp, after.id, limit + 1]),
      ) as readonly PublicRow[];
    const pageRows = rows.slice(0, limit);
    const entries = this.hydrate(pageRows);
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
    const row = this.connection
      .prepare("select version from published_state where singleton_key = 1")
      .get() as { readonly version: number } | undefined;
    return row?.version ?? 0;
  }

  public async loadPublic(path: string): Promise<PublicContentEntry | null> {
    const row = this.connection
      .prepare(`${PUBLIC_ROUTE_SQL} where r.path = ? limit 1`)
      .get(path) as PublicRow | undefined;
    if (row === undefined) return null;
    const entry = this.hydrate([row]).get(row.id);
    return entry === undefined
      ? null
      : Object.freeze({ entry: publicEntry(entry), path: row.path });
  }

  public async loadPublicMedia(id: string): Promise<MediaMetadata | null> {
    const row = this.connection.prepare(PUBLIC_MEDIA_SQL).get(id) as
      | Record<string, unknown>
      | undefined;
    return row === undefined ? null : mediaMetadata(row);
  }

  public async loadMediaMany(ids: readonly string[]): Promise<readonly MediaMetadata[]> {
    const result: MediaMetadata[] = [];
    for (const group of chunks([...new Set(ids)], SQLITE_BIND_CHUNK)) {
      const sql = `select * from media where id in (${group.map(() => "?").join(", ")})`;
      const rows = this.connection.prepare(sql).all(...group) as Record<string, unknown>[];
      result.push(...rows.map(mediaMetadata));
    }
    return result;
  }

  public async loadMedia(id: string): Promise<MediaMetadata | null> {
    const row = this.connection.prepare(MEDIA_BY_ID_SQL).get(id) as
      | Record<string, unknown>
      | undefined;
    return row === undefined ? null : mediaMetadata(row);
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
    const rows = this.connection
      .prepare(
        `${MEDIA_CATALOG_SQL}, ${sort.value} as sort_value
           from media m
           left join user u on u.id = m.created_by
          ${conditions.length === 0 ? "" : `where ${conditions.join(" and ")}`}
          order by ${sort.order} ${direction}, m.id ${direction} limit ?`,
      )
      .all(...bindings, limit + 1) as readonly Record<string, unknown>[];
    const pageRows = rows.slice(0, limit);
    const items = pageRows.map((row) => mediaCatalogItem(row));
    const last = pageRows.at(-1);
    return Object.freeze({
      items: Object.freeze(items),
      ...(rows.length > limit && last !== undefined
        ? {
            nextCursor: encodeSortCursor(kind, last.sort_value as number | string, String(last.id)),
          }
        : {}),
    });
  }

  public async loadMediaCatalogItem(id: string): Promise<MediaCatalogItem | null> {
    const row = this.connection
      .prepare(
        `${MEDIA_CATALOG_SQL}
           from media m
           left join user u on u.id = m.created_by
          where m.id = ? limit 1`,
      )
      .get(id) as Record<string, unknown> | undefined;
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
    const rows = this.connection
      .prepare(MEDIA_USAGE_SQL)
      .all(input.mediaId, input.limit, input.mediaId) as readonly MediaUsageRow[];
    return mediaUsageEntries(rows);
  }

  public async exportBuildContent(): Promise<BuildContentExport> {
    const rows = this.connection
      .prepare(`${PUBLIC_ROUTE_SQL} order by r.path asc`)
      .all() as readonly PublicRow[];
    const entries = this.hydrate(rows);
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

  private entryRow(id: string): EntryRow | undefined {
    return this.connection.prepare(`${ENTRY_COLUMNS_SQL} where id = ?`).get(id) as
      | EntryRow
      | undefined;
  }

  private readConfigurationSyncStateNow(): readonly StoredContentModelState[] {
    return storedModelStates(
      this.connection.prepare(STORED_MODEL_STATE_SQL).all() as readonly StoredModelStateRow[],
    );
  }

  private loadEntry(id: string): ContentEntry | null {
    const row = this.entryRow(id);
    if (row === undefined) return null;
    return this.hydrate([row]).get(row.id) ?? null;
  }

  private hydrate(rows: readonly EntryRow[]): Map<string, ContentEntry> {
    return hydrateEntries(rows, this.loadSnapshots(snapshotIdsOf(rows)), this.resolveModel);
  }

  private loadSnapshots(ids: readonly string[]): Map<string, StoredSnapshot> {
    if (ids.length === 0) return new Map();
    const snapshotRows: SnapshotRow[] = [];
    const blockRows: BlockRow[] = [];
    for (const group of chunks(ids, SQLITE_BIND_CHUNK)) {
      const bindings = group.map(() => "?").join(", ");
      snapshotRows.push(
        ...(this.connection
          .prepare(`${SNAPSHOT_COLUMNS_SQL} where s.id in (${bindings})`)
          .all(...group) as readonly SnapshotRow[]),
      );
      blockRows.push(
        ...(this.connection
          .prepare(
            `${BLOCK_COLUMNS_SQL} where snapshot_id in (${bindings}) order by snapshot_id asc, position asc`,
          )
          .all(...group) as readonly BlockRow[]),
      );
    }
    return storedSnapshots(snapshotRows, blockRows);
  }

  private insertSnapshot(snapshot: DraftSnapshot, schemaVersion: number): void {
    this.connection
      .prepare(
        "insert into content_snapshots (id, entry_id, revision, slug, title, fields_json, schema_version, created_at, updated_at, updated_by) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
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
      );
  }

  private insertBlocks(snapshot: Pick<DraftSnapshot, "blocks" | "id" | "updatedAt">): void {
    const statement = this.connection.prepare(
      "insert into content_blocks (snapshot_id, block_key, block_type, position, schema_version, data_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const block of snapshot.blocks) {
      statement.run(
        snapshot.id,
        block.key,
        block.type,
        block.position,
        block.schemaVersion,
        JSON.stringify(block.data),
        snapshot.updatedAt,
        snapshot.updatedAt,
      );
    }
  }

  private insertReferences(
    snapshotId: string,
    references: readonly {
      readonly fieldPath: string;
      readonly mediaId: string;
      readonly sourceKey: string;
    }[],
    createdAt: number,
  ): void {
    const statement = this.connection.prepare(
      "insert into content_media_references (snapshot_id, source_key, field_path, media_id, created_at) select ?, ?, ?, id, ? from media where id = ? and status = 'active'",
    );
    for (const reference of references) {
      const inserted = statement.run(
        snapshotId,
        reference.sourceKey,
        reference.fieldPath,
        createdAt,
        reference.mediaId,
      );
      if (inserted.changes !== 1) failure("Media is unavailable for reference.");
    }
  }

  private requireLeasedMediaDeletionEvent(
    leaseId: string,
    now: number,
    mediaId: string,
  ): { readonly id: string } {
    const event = this.connection
      .prepare(
        "select id, payload_json from outbox_events where locked_by = ? and type = 'media.delete.requested' and processed_at is null and locked_at > ?",
      )
      .get(leaseId, now - DISPATCHER_LEASE_DURATION_MS) as
      | { readonly id: string; readonly payload_json: string }
      | undefined;
    if (event === undefined) failure("Dispatcher lease is missing or expired.");
    const payload = parseObject(event.payload_json, "Outbox payload");
    if (payload.mediaId !== mediaId) failure("Dispatcher event does not match media.");
    return event;
  }

  private checkpoint(name: string): void {
    this.options.beforeMutation?.(name);
  }

  private nextId(): string {
    if (this.options.nextId !== undefined) return this.options.nextId();
    return randomUUID();
  }

  private bumpPublicState(
    timestamp: number,
    requestedBy: string,
    snapshotId: string | null,
  ): number {
    this.checkpoint("public-state");
    this.connection
      .prepare(
        "insert into published_state (singleton_key, version, updated_at) values (1, 1, ?) on conflict(singleton_key) do update set version = version + 1, updated_at = excluded.updated_at",
      )
      .run(timestamp);
    const state = this.connection
      .prepare("select version from published_state where singleton_key = 1")
      .get() as { readonly version: number };
    this.checkpoint("build-outbox");
    this.enqueueSiteBuild({
      reason: requestedBy === "system:content-sync" ? "configuration_sync" : "publication",
      requestedAt: timestamp,
      requestedBy,
      snapshotId,
      targetVersion: state.version,
    });
    return state.version;
  }

  public async listSiteBuilds(limit: number): Promise<readonly SiteBuildRecord[]> {
    const bounded = Math.max(1, Math.min(100, Math.trunc(limit)));
    const rows = this.connection
      .prepare("select * from site_builds order by requested_at desc, id desc limit ?")
      .all(bounded) as SiteBuildRow[];
    return rows.map(siteBuildRecord);
  }

  public async getSiteBuild(
    buildId: import("@lacecms/domain").SiteBuildId,
  ): Promise<SiteBuildRecord | null> {
    const row = this.connection.prepare("select * from site_builds where id = ?").get(buildId) as
      | SiteBuildRow
      | undefined;
    return row === undefined ? null : siteBuildRecord(row);
  }

  public async requestBuild(input: EnqueueSiteBuildInput): Promise<BuildQueueReceipt> {
    try {
      return this.connection.transaction(() => {
        if (input.retryOfBuildId !== undefined) {
          const prior = this.connection
            .prepare(
              `select 1 as retryable from site_builds where id = ? and status in ${RETRYABLE_SITE_BUILD_STATUS_SQL}`,
            )
            .get(input.retryOfBuildId) as { retryable: number } | undefined;
          if (prior === undefined) failure(RETRYABLE_SITE_BUILD_REFUSAL);
        }
        const state = this.connection
          .prepare("select version from published_state where singleton_key = 1")
          .get() as { version: number } | undefined;
        return this.enqueueSiteBuild({
          reason: input.retryOfBuildId === undefined ? "manual" : "retry",
          requestedAt: input.requestedAt,
          requestedBy: input.requestedBy.id,
          ...(input.retryOfBuildId === undefined ? {} : { retryOfBuildId: input.retryOfBuildId }),
          snapshotId: null,
          targetVersion: state?.version ?? 0,
        });
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  public async claimSiteBuilds(input: {
    readonly limit: number;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
  }): Promise<readonly SiteBuildWorkLease[]> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100)
      throw new TypeError("Build claim limit is invalid.");
    try {
      return this.connection.transaction(() => {
        const rows = this.connection
          .prepare(
            "select id, type, payload_json, attempts, available_at from outbox_events where type = 'site.build.requested' and processed_at is null and available_at <= ? and (locked_at is null or locked_at <= ?) order by available_at asc, id asc limit ?",
          )
          .all(
            input.now,
            input.now - DISPATCHER_LEASE_DURATION_MS,
            input.limit,
          ) as readonly OutboxRow[];
        const leases: SiteBuildWorkLease[] = [];
        for (const row of rows) {
          const leaseId = dispatcherLeaseId(this.nextId());
          const claimed = this.connection
            .prepare(
              "update outbox_events set locked_at = ?, locked_by = ? where id = ? and processed_at is null and (locked_at is null or locked_at <= ?)",
            )
            .run(input.now, leaseId, row.id, input.now - DISPATCHER_LEASE_DURATION_MS);
          if (claimed.changes !== 1) continue;
          const payload = siteBuildPayload(row.payload_json);
          if (payload === null) {
            this.connection
              .prepare(
                "update outbox_events set attempts = attempts + 1, processed_at = ?, locked_at = null, locked_by = null, last_error = 'invalid_build_event' where id = ? and locked_by = ?",
              )
              .run(input.now, row.id, leaseId);
            continue;
          }
          const snapshotId =
            typeof payload.publishedSnapshotId === "string" ? payload.publishedSnapshotId : null;
          this.connection
            .prepare(
              "insert or ignore into site_builds (id, reason, status, target_version, published_snapshot_id, requested_by, requested_at, started_at) values (?, ?, 'running', ?, (select id from content_snapshots where id = ?), ?, ?, ?)",
            )
            .run(
              row.id,
              payload.reason,
              payload.targetVersion,
              snapshotId,
              payload.requestedBy,
              payload.requestedAt,
              input.now,
            );
          // pending → running after a retry, or running → running when an
          // orphaned claim is recovered; the first start time is kept.
          const started = this.connection
            .prepare(
              `update site_builds set status = 'running', started_at = coalesce(started_at, ?) where id = ? and status in ${CLAIMABLE_SITE_BUILD_STATUS_SQL}`,
            )
            .run(input.now, row.id);
          if (started.changes !== 1) {
            // Defensive: a terminal build never runs again; finish its stray event.
            this.connection
              .prepare(
                "update outbox_events set processed_at = ?, locked_at = null, locked_by = null where id = ? and locked_by = ?",
              )
              .run(input.now, row.id, leaseId);
            continue;
          }
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
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  public async renewSiteBuildLease(input: {
    readonly leaseId: import("@lacecms/application").DispatcherLeaseId;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
  }): Promise<boolean> {
    try {
      const renewed = this.connection
        .prepare(
          "update outbox_events set locked_at = ? where locked_by = ? and type = 'site.build.requested' and processed_at is null and locked_at > ?",
        )
        .run(input.now, input.leaseId, input.now - DISPATCHER_LEASE_DURATION_MS);
      return renewed.changes === 1;
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  private requireLeasedSiteBuild(leaseId: string, now: number): string {
    const row = this.connection
      .prepare(
        "select id from outbox_events where locked_by = ? and type = 'site.build.requested' and processed_at is null and locked_at > ?",
      )
      .get(leaseId, now - DISPATCHER_LEASE_DURATION_MS) as { id: string } | undefined;
    if (row === undefined) failure("Dispatcher lease is missing or expired.");
    return row.id;
  }

  public async recordSiteBuildAccepted(input: {
    readonly leaseId: import("@lacecms/application").DispatcherLeaseId;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
    readonly providerBuildId?: string;
  }): Promise<void> {
    if (input.providerBuildId !== undefined) assertProviderBuildId(input.providerBuildId);
    this.finishLeasedSiteBuild(
      input,
      "Build cannot be accepted.",
      "update site_builds set status = 'accepted', provider_build_id = ?, started_at = coalesce(started_at, ?), completed_at = ?, error = null where id = ? and status = 'running'",
      [input.providerBuildId ?? null, input.now, input.now],
    );
  }

  public async recordSiteBuildTracking(input: {
    readonly leaseId: import("@lacecms/application").DispatcherLeaseId;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
    readonly providerBuildId: string;
  }): Promise<void> {
    assertProviderBuildId(input.providerBuildId);
    this.finishLeasedSiteBuild(
      input,
      "Build cannot be tracked.",
      "update site_builds set provider_build_id = ?, provider_check_after = ?, error = null where id = ? and status = 'running'",
      [input.providerBuildId, input.now],
    );
  }

  /** Applies a lease-guarded `running` transition and completes its event atomically. */
  private finishLeasedSiteBuild(
    input: {
      readonly leaseId: import("@lacecms/application").DispatcherLeaseId;
      readonly now: import("@lacecms/domain").UnixMilliseconds;
    },
    refusal: string,
    update: string,
    parameters: readonly (number | string | null)[],
  ): void {
    try {
      this.connection.transaction(() => {
        const id = this.requireLeasedSiteBuild(input.leaseId, input.now);
        const updated = this.connection.prepare(update).run(...parameters, id);
        if (updated.changes !== 1) failure(refusal);
        this.connection
          .prepare(
            "update outbox_events set processed_at = ?, locked_at = null, locked_by = null where id = ? and locked_by = ?",
          )
          .run(input.now, id, input.leaseId);
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  public async recordSiteBuildSuccess(input: {
    readonly leaseId: import("@lacecms/application").DispatcherLeaseId;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
  }): Promise<void> {
    this.finishLeasedSiteBuild(
      input,
      "Build cannot be completed.",
      "update site_builds set status = 'succeeded', started_at = coalesce(started_at, ?), completed_at = ?, error = null where id = ? and status = 'running'",
      [input.now, input.now],
    );
  }

  public async recordSiteBuildFailure(input: {
    readonly leaseId: import("@lacecms/application").DispatcherLeaseId;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
    readonly reason: string;
    readonly path?: string;
    readonly retryAt?: import("@lacecms/domain").UnixMilliseconds;
    readonly terminal: boolean;
  }): Promise<void> {
    const reason = sanitizeBuildReason(input.reason);
    const error = encodeBuildError(input.reason, input.path);
    try {
      this.connection.transaction(() => {
        const id = this.requireLeasedSiteBuild(input.leaseId, input.now);
        if (input.terminal) {
          const updated = this.connection
            .prepare(
              "update site_builds set status = 'failed', started_at = coalesce(started_at, ?), completed_at = ?, error = ? where id = ? and status = 'running'",
            )
            .run(input.now, input.now, error, id);
          if (updated.changes !== 1) failure("Build cannot be failed.");
        } else {
          const updated = this.connection
            .prepare(
              "update site_builds set status = 'pending', error = ? where id = ? and status = 'running'",
            )
            .run(error, id);
          if (updated.changes !== 1) failure("Build cannot be retried.");
        }
        this.connection
          .prepare(
            "update outbox_events set attempts = attempts + 1, available_at = ?, processed_at = ?, locked_at = null, locked_by = null, last_error = ? where id = ? and locked_by = ?",
          )
          .run(
            input.retryAt ?? input.now,
            input.terminal ? input.now : null,
            reason,
            id,
            input.leaseId,
          );
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  public async completeTrackedSiteBuild(input: {
    readonly buildId: import("@lacecms/domain").SiteBuildId;
    readonly providerBuildId: string;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
    readonly outcome: import("@lacecms/domain").TrackedSiteBuildOutcome;
    readonly reason?: string;
    readonly stage?: import("@lacecms/domain").SiteBuildProviderStage;
  }): Promise<void> {
    const error = trackedOutcomeError(input.outcome, input.reason);
    const [stage, checkedAt] = trackedCompletionStage(input.stage, input.now);
    try {
      this.connection.transaction(() => {
        const row = this.connection
          .prepare(
            "select b.status, b.provider_build_id, b.error, e.processed_at from site_builds b left join outbox_events e on e.id = b.id where b.id = ?",
          )
          .get(input.buildId) as
          | {
              status: string;
              provider_build_id: string | null;
              error: string | null;
              processed_at: number | null;
            }
          | undefined;
        if (row === undefined || row.provider_build_id !== input.providerBuildId)
          failure("Provider build does not match.");
        if (row.status === input.outcome && row.error === error) return;
        if (row.status !== "running") failure("Build already has a different terminal outcome.");
        if (row.processed_at === null) failure("Build is still owned by dispatch.");
        this.connection
          .prepare(
            "update site_builds set status = ?, completed_at = ?, error = ?, provider_check_after = null, provider_stage = coalesce(?, provider_stage), provider_checked_at = coalesce(?, provider_checked_at) where id = ? and status = 'running' and provider_build_id = ?",
          )
          .run(
            input.outcome,
            input.now,
            error,
            stage,
            checkedAt,
            input.buildId,
            input.providerBuildId,
          );
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  public async claimTrackedSiteBuildChecks(input: {
    readonly limit: number;
    readonly leaseMs: number;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
  }): Promise<readonly import("@lacecms/application").TrackedSiteBuildCheck[]> {
    assertTrackingClaim(input);
    try {
      return this.connection.transaction(() => {
        const rows = this.connection
          .prepare(DUE_TRACKED_SITE_BUILDS_SQL)
          .all(input.now, input.limit) as DueTrackedSiteBuildRow[];
        const lease = this.connection.prepare(LEASE_TRACKED_SITE_BUILD_SQL);
        return Object.freeze(
          rows
            .filter(
              (row) =>
                lease.run(
                  input.now + input.leaseMs,
                  row.id,
                  row.provider_build_id,
                  row.provider_check_after,
                ).changes === 1,
            )
            .map(trackedSiteBuildCheck),
        );
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  public async recordTrackedSiteBuildCheck(input: {
    readonly buildId: import("@lacecms/domain").SiteBuildId;
    readonly providerBuildId: string;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
    readonly checkAfter: import("@lacecms/domain").UnixMilliseconds;
    readonly stage?: import("@lacecms/domain").SiteBuildProviderStage;
  }): Promise<boolean> {
    const update = trackedSiteBuildCheckUpdate(input);
    try {
      return this.connection.prepare(update.sql).run(...update.params).changes === 1;
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  private enqueueSiteBuild(input: {
    readonly reason: string;
    readonly requestedAt: number;
    readonly requestedBy: string;
    readonly retryOfBuildId?: string;
    readonly snapshotId: string | null;
    readonly targetVersion: number;
  }): BuildQueueReceipt {
    const pending = this.connection
      .prepare(
        "select id, payload_json from outbox_events where type = 'site.build.requested' and processed_at is null and locked_at is null",
      )
      .get() as { id: string; payload_json: string } | undefined;
    const oldPayload =
      pending === undefined ? {} : parseObject(pending.payload_json, "Outbox payload");
    const retryOfBuildId =
      input.retryOfBuildId ??
      (typeof oldPayload.retryOfBuildId === "string" ? oldPayload.retryOfBuildId : undefined);
    const payload = JSON.stringify({
      publishedSnapshotId: input.snapshotId,
      reason: input.reason,
      requestedAt: input.requestedAt,
      requestedBy: input.requestedBy,
      ...(retryOfBuildId === undefined ? {} : { retryOfBuildId }),
      targetVersion: input.targetVersion,
    });
    const eventId = this.nextId();
    const inserted = this.connection
      .prepare(
        "insert or ignore into outbox_events (id, type, payload_json, attempts, available_at, created_at) values (?, 'site.build.requested', ?, 0, ?, ?)",
      )
      .run(eventId, payload, input.requestedAt + SITE_BUILD_DEBOUNCE_MS, input.requestedAt);
    if (inserted.changes === 1)
      return {
        coalesced: false,
        eventId: dispatcherEventId(eventId),
        targetVersion: input.targetVersion,
      };
    this.connection
      .prepare(
        "update outbox_events set payload_json = ?, available_at = ? where type = 'site.build.requested' and processed_at is null and locked_at is null",
      )
      .run(payload, input.requestedAt + SITE_BUILD_DEBOUNCE_MS);
    const existing = this.connection
      .prepare(
        "select id from outbox_events where type = 'site.build.requested' and processed_at is null and locked_at is null",
      )
      .get() as { id: string } | undefined;
    if (existing === undefined) failure("Build request could not be queued.");
    return {
      coalesced: true,
      eventId: dispatcherEventId(existing.id),
      targetVersion: input.targetVersion,
    };
  }

  /** Classifies a refused deletion inside the same write transaction as its guard. */
  private refuseDeletion(
    mediaId: string,
    expectedStatus: MediaMetadata["status"],
    message: string,
  ): never {
    const row = this.connection
      .prepare(
        "select status, exists(select 1 from content_media_references where media_id = ?) as referenced from media where id = ?",
      )
      .get(mediaId, mediaId) as
      | { readonly referenced: number; readonly status: string }
      | undefined;
    if (row?.status === expectedStatus && row.referenced === 1) {
      throw new DomainError("MEDIA_IN_USE", "Media is still referenced by content.");
    }
    failure(message);
  }

  private throwWriteError(error: unknown, pageCreation: boolean): never {
    sqliteWriteError(error, pageCreation, "SQLite");
  }
}

export function nodeContentRepository(
  database: NodeDatabase,
  resolveModel: ContentModelResolver,
  options?: NodeRepositoryOptions,
): NodeContentRepository {
  return new NodeContentRepository(database.connection, resolveModel, options);
}

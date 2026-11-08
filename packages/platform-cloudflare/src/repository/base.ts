import { dispatcherEventId, SITE_BUILD_DEBOUNCE_MS } from "@lacecms/application";
import type { BuildQueueReceipt } from "@lacecms/application";
import {
  LINK_IMPACT_EVIDENCE_SQL,
  linkRemovalCondition,
  SqlContentReader,
  replaceInternalLinkStatements,
  ENTRY_COLUMNS_SQL,
  PENDING_SITE_BUILD_SQL,
  chunks,
  failure,
  seoJson,
  sqliteWriteError,
} from "@lacecms/db";
import type { ContentModelResolver, EntryRow } from "@lacecms/db";
import type { ContentBlock, DraftSnapshot, MediaMetadata } from "@lacecms/domain";
import { D1_MAX_BATCH_STATEMENTS, type D1Database, type D1Result } from "../d1/database.js";
import { bind } from "./sql.js";
import { GUARD_SQL, MutationBatch, numberedValues, rowsPerStatement } from "./batch.js";
import type { Condition } from "./batch.js";

declare const crypto: { randomUUID(): string };

// Key, type, position, version, data and one envelope JSON value per block row.
const BLOCK_VALUES_PER_ROW = 6;

const REFERENCE_VALUES_PER_ROW = 3;

export interface D1RepositoryOptions {
  /** Test hook: a throw at a named checkpoint injects a failing statement at that batch position. */
  readonly beforeMutation?: (checkpoint: string) => void;
  readonly nextId?: () => string;
}

/**
 * Database, model resolver, guarded-batch construction and write helpers
 * shared by the D1 repository areas.
 */
export abstract class D1RepositoryBase {
  public constructor(
    protected readonly database: D1Database,
    protected readonly resolveModel: ContentModelResolver,
    protected readonly options: D1RepositoryOptions,
    protected readonly reader: SqlContentReader,
  ) {}

  protected loadMedia(id: string): Promise<MediaMetadata | null> {
    return this.reader.loadMedia(id);
  }

  protected batch(): MutationBatch {
    return new MutationBatch(this.database, this.options.beforeMutation);
  }

  /** Inserts the batch-unique guard only when the mutation precondition holds. */
  protected async checkLinkRemoval(
    targetId: string,
    action: import("@lacecms/application").LinkImpactAction,
    actorId: string,
    acknowledgment: import("@lacecms/application").LinkImpactAcknowledgment | undefined,
  ): Promise<Condition> {
    const row = await this.first<import("@lacecms/db").ImpactEvidenceRow>(
      LINK_IMPACT_EVIDENCE_SQL,
      targetId,
      targetId,
      action,
      targetId,
    );
    return linkRemovalCondition(row, targetId, action, actorId, acknowledgment);
  }

  protected addInternalLinkDiff(
    batch: MutationBatch,
    snapshotId: string,
    references: readonly import("@lacecms/content").InternalLinkReference[],
    token?: string,
  ): void {
    batch.checkpoint("draft.internal-links");
    for (const statement of replaceInternalLinkStatements(
      snapshotId,
      references,
      token === undefined ? "1" : GUARD_SQL,
    ))
      batch.add(statement.sql, ...statement.params, ...(token === undefined ? [] : [token]));
    batch.checkpoint("draft.internal-links.complete");
  }

  protected guard(batch: MutationBatch, now: number, precondition: Condition): string {
    const token = `guard:${crypto.randomUUID()}`;
    batch.add(
      `insert into mutation_guards (token, created_at) select ?, ? where ${precondition.sql}`,
      token,
      now,
      ...precondition.params,
    );
    return token;
  }

  protected releaseGuard(batch: MutationBatch, token: string): void {
    batch.add("delete from mutation_guards where token = ?", token);
  }

  protected async execute(batch: MutationBatch, pageCreation: boolean): Promise<D1Result[]> {
    if (batch.statements.length > D1_MAX_BATCH_STATEMENTS) {
      failure("D1 mutation exceeds its statement budget.");
    }
    try {
      return await this.database.batch(batch.statements);
    } catch (error) {
      sqliteWriteError(error, pageCreation, "D1");
    }
  }

  protected async all<Row = Record<string, unknown>>(
    sql: string,
    ...params: unknown[]
  ): Promise<Row[]> {
    return (await bind(this.database.prepare(sql), params).all<Row>()).results;
  }

  protected async first<Row = Record<string, unknown>>(
    sql: string,
    ...params: unknown[]
  ): Promise<Row | undefined> {
    return (await bind(this.database.prepare(sql), params).first<Row>()) ?? undefined;
  }

  /** Runs one self-guarded statement and returns its affected-row count. */
  protected async run(sql: string, ...params: unknown[]): Promise<number> {
    try {
      return (await bind(this.database.prepare(sql), params).run()).meta.changes;
    } catch (error) {
      sqliteWriteError(error, false, "D1");
    }
  }

  protected nextId(): string {
    return this.options.nextId?.() ?? crypto.randomUUID();
  }

  protected async entryRow(id: string): Promise<EntryRow | undefined> {
    return this.first<EntryRow>(`${ENTRY_COLUMNS_SQL} where id = ?`, id);
  }

  protected addSnapshotInsert(
    batch: MutationBatch,
    snapshot: DraftSnapshot,
    schemaVersion: number,
    token?: string,
  ): void {
    batch.add(
      `insert into content_snapshots (id, entry_id, revision, slug, title, fields_json, seo_json, schema_version, created_at, updated_at, updated_by) select ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? ${token === undefined ? "" : `where ${GUARD_SQL}`}`,
      snapshot.id,
      snapshot.entryId,
      snapshot.revision,
      snapshot.slug ?? null,
      snapshot.title,
      JSON.stringify(snapshot.fields),
      seoJson(snapshot.seo),
      schemaVersion,
      snapshot.createdAt,
      snapshot.updatedAt,
      snapshot.updatedBy.id,
      ...(token === undefined ? [] : [token]),
    );
  }

  /** Multi-row block inserts; `?1` snapshot, `?2` timestamp, `?3` guard token. */
  protected addBlockInserts(
    batch: MutationBatch,
    snapshotId: string,
    timestamp: number,
    blocks: readonly ContentBlock[],
    token?: string,
  ): void {
    const shared = token === undefined ? [snapshotId, timestamp] : [snapshotId, timestamp, token];
    for (const group of chunks(blocks, rowsPerStatement(shared.length, BLOCK_VALUES_PER_ROW))) {
      batch.add(
        `insert into content_blocks (snapshot_id, block_key, block_type, position, schema_version, data_json,
                                     anchor, class_name, hidden, settings_json, created_at, updated_at)
         select ?1, v.column1, v.column2, v.column3, v.column4, v.column5,
                v.column6 ->> '$.anchor', v.column6 ->> '$.className',
                coalesce(v.column6 ->> '$.hidden', 0), coalesce(v.column6 -> '$.settings', '{}'), ?2, ?2
           from (values ${numberedValues(group.length, BLOCK_VALUES_PER_ROW, shared.length)}) v
          ${token === undefined ? "" : "where exists (select 1 from mutation_guards where token = ?3)"}`,
        ...shared,
        ...group.flatMap((block) => [
          block.key,
          block.type,
          block.position,
          block.schemaVersion,
          JSON.stringify(block.data),
          // One bound envelope keeps a 200-block save within the D1 statement budget.
          JSON.stringify({
            ...(block.anchor === undefined ? {} : { anchor: block.anchor }),
            ...(block.className === undefined ? {} : { className: block.className }),
            hidden: block.hidden ? 1 : 0,
            settings: block.settings,
          }),
        ]),
      );
    }
  }

  /**
   * Multi-row reference inserts. Missing or inactive media yields a NULL
   * `media_id`, whose `NOT NULL` failure rolls back the whole batch.
   */
  protected addReferenceInserts(
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
  protected addPublicStateBump(
    batch: MutationBatch,
    condition: Condition,
    input: {
      readonly reason: "configuration_sync" | "media_metadata" | "publication";
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
      reason: input.reason,
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
  protected addSiteBuildEnqueue(
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

  protected queueReceipt(results: readonly D1Result[], index: number): BuildQueueReceipt {
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

  protected stateVersion(results: readonly D1Result[], index: number): number {
    return this.queueReceipt(results, index).targetVersion;
  }
}

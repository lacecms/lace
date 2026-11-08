import { SITE_BUILD_DEBOUNCE_MS, dispatcherEventId } from "@lacecms/application";
import type { BuildQueueReceipt } from "@lacecms/application";
import {
  LINK_IMPACT_EVIDENCE_SQL,
  linkRemovalCondition,
  SqlContentReader,
  replaceInternalLinkStatements,
  BUMP_INTERNAL_LINK_GRAPH_SQL,
  BLOCK_COLUMNS_SQL,
  seoJson,
  ENTRY_COLUMNS_SQL,
  SNAPSHOT_COLUMNS_SQL,
  chunks,
  failure,
  hydrateEntries,
  parseObject,
  snapshotIdsOf,
  sqliteWriteError,
  storedSnapshots,
} from "@lacecms/db";
import type {
  BlockRow,
  ContentModelResolver,
  EntryRow,
  SnapshotRow,
  StoredSnapshot,
} from "@lacecms/db";
import type { ContentEntry, DraftSnapshot, MediaMetadata } from "@lacecms/domain";
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { SQLITE_BIND_CHUNK } from "./sql.js";

export interface NodeRepositoryOptions {
  readonly beforeMutation?: (checkpoint: string) => void;
  readonly nextId?: () => string;
}

/**
 * Connection, model resolver and write helpers shared by the Node repository
 * areas. The synchronous entry loader serves reloads inside better-sqlite3
 * transactions, which cannot await the shared reader.
 */
export abstract class NodeRepositoryBase {
  public constructor(
    protected readonly connection: Database.Database,
    protected readonly resolveModel: ContentModelResolver,
    protected readonly options: NodeRepositoryOptions,
    protected readonly reader: SqlContentReader,
  ) {}

  protected loadMedia(id: string): Promise<MediaMetadata | null> {
    return this.reader.loadMedia(id);
  }

  protected entryRow(id: string): EntryRow | undefined {
    return this.connection.prepare(`${ENTRY_COLUMNS_SQL} where id = ?`).get(id) as
      | EntryRow
      | undefined;
  }

  protected loadEntry(id: string): ContentEntry | null {
    const row = this.entryRow(id);
    if (row === undefined) return null;
    return this.hydrate([row]).get(row.id) ?? null;
  }

  protected hydrate(rows: readonly EntryRow[]): Map<string, ContentEntry> {
    return hydrateEntries(rows, this.loadSnapshots(snapshotIdsOf(rows)), this.resolveModel);
  }

  protected loadSnapshots(ids: readonly string[]): Map<string, StoredSnapshot> {
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

  protected insertSnapshot(snapshot: DraftSnapshot, schemaVersion: number): void {
    this.connection
      .prepare(
        "insert into content_snapshots (id, entry_id, revision, slug, title, fields_json, seo_json, schema_version, created_at, updated_at, updated_by) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
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
      );
  }

  protected insertBlocks(snapshot: Pick<DraftSnapshot, "blocks" | "id" | "updatedAt">): void {
    const statement = this.connection.prepare(
      "insert into content_blocks (snapshot_id, block_key, block_type, position, schema_version, data_json, anchor, class_name, hidden, settings_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const block of snapshot.blocks) {
      statement.run(
        snapshot.id,
        block.key,
        block.type,
        block.position,
        block.schemaVersion,
        JSON.stringify(block.data),
        block.anchor ?? null,
        block.className ?? null,
        block.hidden ? 1 : 0,
        JSON.stringify(block.settings),
        snapshot.updatedAt,
        snapshot.updatedAt,
      );
    }
  }

  protected checkLinkRemoval(
    targetId: string,
    action: import("@lacecms/application").LinkImpactAction,
    actorId: string,
    acknowledgment: import("@lacecms/application").LinkImpactAcknowledgment | undefined,
  ): void {
    const row = this.connection
      .prepare(LINK_IMPACT_EVIDENCE_SQL)
      .get(targetId, targetId, action, targetId) as
      | import("@lacecms/db").ImpactEvidenceRow
      | undefined;
    linkRemovalCondition(row, targetId, action, actorId, acknowledgment);
  }

  protected replaceInternalLinks(
    snapshotId: string,
    references: readonly import("@lacecms/content").InternalLinkReference[],
  ): void {
    this.checkpoint("draft.internal-links");
    for (const statement of replaceInternalLinkStatements(snapshotId, references))
      this.connection.prepare(statement.sql).run(...statement.params);
    this.checkpoint("draft.internal-links.complete");
  }

  protected bumpLinkGraph(snapshotIds: readonly string[]): void {
    this.connection.prepare(BUMP_INTERNAL_LINK_GRAPH_SQL).run(JSON.stringify(snapshotIds));
  }

  protected insertReferences(
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

  protected checkpoint(name: string): void {
    this.options.beforeMutation?.(name);
  }

  protected nextId(): string {
    if (this.options.nextId !== undefined) return this.options.nextId();
    return randomUUID();
  }

  protected bumpPublicState(
    timestamp: number,
    requestedBy: string,
    snapshotId: string | null,
    reason: "configuration_sync" | "media_metadata" | "publication",
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
      reason,
      requestedAt: timestamp,
      requestedBy,
      snapshotId,
      targetVersion: state.version,
    });
    return state.version;
  }

  protected enqueueSiteBuild(input: {
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

  protected throwWriteError(error: unknown, pageCreation: boolean): never {
    sqliteWriteError(error, pageCreation, "SQLite");
  }
}

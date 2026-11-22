import { linkRemovalCondition } from "../links/reader.js";
import { LINK_IMPACT_EVIDENCE_SQL, type ImpactEvidenceRow } from "../links/impact-evidence.js";
import { SqlContentReader } from "../reads/content-reader.js";
import {
  replaceInternalLinkStatements,
  BUMP_INTERNAL_LINK_GRAPH_SQL,
} from "../links/statements.js";
import { BLOCK_COLUMNS_SQL } from "../content/blocks.js";
import { ENTRY_COLUMNS_SQL } from "../content/entries.js";
import {
  SNAPSHOT_COLUMNS_SQL,
  hydrateEntries,
  snapshotIdsOf,
  storedSnapshots,
} from "../content/snapshots.js";
import { chunks } from "../shared/values.js";
import { failure } from "../shared/failures.js";
import { sqliteWriteError } from "../shared/write-errors.js";
import type { BlockRow } from "../content/blocks.js";
import type { ContentModelResolver, EntryRow } from "../content/entries.js";
import type { SnapshotRow, StoredSnapshot } from "../content/snapshots.js";
import type { ContentEntry, MediaMetadata } from "@lacecms/domain";
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

  protected checkLinkRemoval(
    targetId: string,
    action: import("@lacecms/application").LinkImpactAction,
    actorId: string,
    acknowledgment: import("@lacecms/application").LinkImpactAcknowledgment | undefined,
  ): void {
    const row = this.connection
      .prepare(LINK_IMPACT_EVIDENCE_SQL)
      .get(targetId, targetId, action, targetId) as ImpactEvidenceRow | undefined;
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

  protected throwWriteError(error: unknown, pageCreation: boolean): never {
    sqliteWriteError(error, pageCreation, "SQLite");
  }
}

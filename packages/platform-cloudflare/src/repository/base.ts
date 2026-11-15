import {
  LINK_IMPACT_EVIDENCE_SQL,
  linkRemovalCondition,
  SqlContentReader,
  replaceInternalLinkStatements,
  ENTRY_COLUMNS_SQL,
  chunks,
  failure,
  sqliteWriteError,
} from "@lacecms/db";
import type { ContentModelResolver, EntryRow } from "@lacecms/db";
import type { MediaMetadata } from "@lacecms/domain";
import { D1_MAX_BATCH_STATEMENTS, type D1Database, type D1Result } from "../d1/database.js";
import { bind } from "./sql.js";
import { GUARD_SQL, MutationBatch, numberedValues, rowsPerStatement } from "./batch.js";
import type { Condition } from "./batch.js";

declare const crypto: { randomUUID(): string };

const REFERENCE_VALUES_PER_ROW = 3;

export interface D1RepositoryOptions {
  /** Test hook: a throw at a named checkpoint injects a failing statement at that batch position. */
  readonly beforeMutation?: (checkpoint: string) => void;
  readonly nextId?: () => string;
  /** Called once after a committed batch in which an outbox statement changed a row. */
  readonly onOutboxWork?: () => void;
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
    let results: D1Result[];
    try {
      results = await this.database.batch(batch.statements);
    } catch (error) {
      sqliteWriteError(error, pageCreation, "D1");
    }
    return results;
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
}

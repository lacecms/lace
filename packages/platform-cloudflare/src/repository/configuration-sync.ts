import type {
  ApplyConfigurationSynchronizationInput,
  ApplyConfigurationSynchronizationResult,
  ApplyConfigurationSyncBlockMigrationsInput,
  ConfigurationSyncApplyPort,
  ConfigurationSyncSnapshotRewrite,
  ConfigurationSyncMigrationCounts,
  ConfigurationSyncMigrationPage,
  ConfigurationSyncMigrationScanInput,
  ConfigurationSyncSnapshotPage,
  ConfigurationSyncSnapshotScanInput,
  ConfigurationSyncStateReadPort,
  StoredContentModelState,
} from "@lacecms/application";
import {
  configurationSyncApplyResult,
  configurationSyncRecursiveScans,
  configurationSyncWritePlan,
  prepareConfigurationSync,
  COMMIT_SYNC_LINK_GRAPH_SQL,
  STORED_MODEL_BASELINES_SQL,
  STORED_MODEL_STATE_JSON_SQL,
  SYNC_BLOCKS_SQL,
  SYNC_MIGRATION_BLOCKS_SQL,
  SYNC_MIGRATION_ENTRIES_SQL,
  SYNC_MIGRATION_REFERENCES_SQL,
  SYNC_MIGRATION_SNAPSHOTS_SQL,
  SYNC_SNAPSHOTS_SQL,
  assertMigrationPageSize,
  configurationSyncMigrationStatements,
  SYNC_FIELD_REWRITE_ROWS_SQL,
  staleBlockMigration,
  failedSynchronizationGuard,
  syncMigrationPage,
  syncMigrationSnapshotIds,
  syncMigrationTargetsJson,
  syncSnapshotPage,
  assertPageSize,
  chunks,
  failure,
  sqliteWriteError,
  storedModelStates,
} from "@lacecms/db";
import type {
  SyncBlockRow,
  SyncFieldRewriteRow,
  SyncMigrationBlockRow,
  SyncMigrationEntryRow,
  SyncMigrationReferenceRow,
  SyncMigrationSnapshotRow,
  SyncSnapshotRow,
  StoredModelStateRow,
} from "@lacecms/db";
import { D1_MAX_BATCH_STATEMENTS, D1_MAX_BOUND_PARAMETERS } from "../d1/database.js";
import { D1RepositoryBase } from "./base.js";
import { D1WritePlanBudgetError, executeWritePlan } from "./write-plan.js";

declare const crypto: { randomUUID(): string };

/** D1 configuration-sync scans and guarded synchronization batches. */
export class D1ConfigurationSync
  extends D1RepositoryBase
  implements ConfigurationSyncStateReadPort, ConfigurationSyncApplyPort
{
  public async readConfigurationSyncState(): Promise<readonly StoredContentModelState[]> {
    return (await this.readSyncState()).state;
  }

  public async readConfigurationSyncSnapshots(
    input: ConfigurationSyncSnapshotScanInput,
  ): Promise<ConfigurationSyncSnapshotPage> {
    const limit = assertPageSize(input.limit);
    const rows = await this.all<SyncSnapshotRow>(
      SYNC_SNAPSHOTS_SQL,
      input.modelKey,
      input.after ?? "",
      limit,
    );
    const blockRows: SyncBlockRow[] = [];
    for (const group of chunks(
      rows.map((row) => row.id),
      D1_MAX_BOUND_PARAMETERS,
    )) {
      blockRows.push(
        ...(await this.all<SyncBlockRow>(
          `${SYNC_BLOCKS_SQL} (${group.map(() => "?").join(", ")}) order by snapshot_id, position`,
          ...group,
        )),
      );
    }
    return syncSnapshotPage(rows, blockRows, limit);
  }

  public async readConfigurationSyncMigrationEntries(
    input: ConfigurationSyncMigrationScanInput,
  ): Promise<ConfigurationSyncMigrationPage> {
    const limit = assertMigrationPageSize(input.limit);
    const rows = await this.all<SyncMigrationEntryRow>(
      SYNC_MIGRATION_ENTRIES_SQL,
      input.modelKey,
      syncMigrationTargetsJson(input.targets),
      input.after ?? "",
      limit,
    );
    const types = JSON.stringify(input.targets.map((target) => target.type));
    const snapshotRows: SyncMigrationSnapshotRow[] = [];
    const blockRows: SyncMigrationBlockRow[] = [];
    const referenceRows: SyncMigrationReferenceRow[] = [];
    // One bound value is reserved for the target types of the block query.
    for (const group of chunks(syncMigrationSnapshotIds(rows), D1_MAX_BOUND_PARAMETERS - 1)) {
      const bindings = `(${group.map(() => "?").join(", ")})`;
      snapshotRows.push(
        ...(await this.all<SyncMigrationSnapshotRow>(
          `${SYNC_MIGRATION_SNAPSHOTS_SQL} ${bindings}`,
          ...group,
        )),
      );
      blockRows.push(
        ...(await this.all<SyncMigrationBlockRow>(
          `${SYNC_MIGRATION_BLOCKS_SQL} ${bindings}`,
          types,
          ...group,
        )),
      );
      referenceRows.push(
        ...(await this.all<SyncMigrationReferenceRow>(
          `${SYNC_MIGRATION_REFERENCES_SQL} ${bindings}`,
          ...group,
        )),
      );
    }
    return syncMigrationPage(rows, snapshotRows, blockRows, referenceRows, limit);
  }

  /**
   * Packs whole entry units into guarded batches within the statement budget.
   * Every write requires all of its batch's guards, so one stale unit leaves
   * the batch unchanged and stops later batches. A unit too large for one
   * batch is split into its published snapshot, then its draft.
   */
  public async applyConfigurationSyncBlockMigrations(
    input: ApplyConfigurationSyncBlockMigrationsInput,
  ): Promise<ConfigurationSyncMigrationCounts> {
    const linkDirtyToken = crypto.randomUUID();
    const linkGraphCost = input.units.some((unit) =>
      unit.snapshots.some((snapshot) => snapshot.internalLinks !== undefined),
    )
      ? 2
      : 0;
    const statementBudget = D1_MAX_BATCH_STATEMENTS - linkGraphCost;
    type Part = {
      readonly state: "draft" | "published";
      readonly statements: ReturnType<typeof configurationSyncMigrationStatements>;
    };
    // Guard insert and release surround each part's writes.
    const cost = (part: Part): number => part.statements.writes.length + 2;
    const batches: Part[][] = [];
    let current: Part[] = [];
    let size = 0;
    const flush = (): void => {
      if (current.length > 0) batches.push(current);
      current = [];
      size = 0;
    };
    for (const unit of input.units) {
      const parts = unit.snapshots.map((migration) => ({
        state: migration.state,
        // One bound value is reserved for the batch guard tokens.
        statements: configurationSyncMigrationStatements(
          migration,
          input.migratedAt,
          D1_MAX_BOUND_PARAMETERS - 1,
          linkDirtyToken,
        ),
      }));
      const unitCost = parts.reduce((sum, part) => sum + cost(part), 0);
      if (unitCost <= statementBudget) {
        if (size + unitCost > statementBudget) flush();
        current.push(...parts);
        size += unitCost;
        continue;
      }
      flush();
      for (const part of parts) {
        if (size + cost(part) > statementBudget) flush();
        current.push(part);
        size += cost(part);
      }
      flush();
    }
    flush();

    for (const parts of batches) {
      const batch = this.batch();
      const tokens = parts.map((part) =>
        this.guard(batch, input.migratedAt, part.statements.guard),
      );
      const guarded = `(select count(*) from mutation_guards where token in (select value from json_each(?))) = ${tokens.length}`;
      const tokenJson = JSON.stringify(tokens);
      for (const part of parts) {
        batch.checkpoint(`sync.migration.${part.state}`);
        for (const write of part.statements.writes) {
          batch.add(`${write.sql} and ${guarded}`, ...write.params, tokenJson);
        }
      }
      if (linkGraphCost) {
        batch.add(`${COMMIT_SYNC_LINK_GRAPH_SQL} and ${guarded}`, linkDirtyToken, tokenJson);
        this.releaseGuard(batch, linkDirtyToken);
      }
      for (const token of tokens) this.releaseGuard(batch, token);
      const results = await this.execute(batch, false);
      if (tokens.some((_, index) => results[index]!.meta.changes !== 1)) staleBlockMigration();
    }
    let blocks = 0;
    let drafts = 0;
    let published = 0;
    for (const unit of input.units) {
      for (const migration of unit.snapshots) {
        blocks += migration.blocks.length;
        if (migration.state === "draft") drafts += 1;
        else published += 1;
      }
    }
    return Object.freeze({ blocks, drafts, published });
  }

  public async applyConfigurationSynchronization(
    input: ApplyConfigurationSynchronizationInput,
  ): Promise<ApplyConfigurationSynchronizationResult> {
    const { json, state } = await this.readSyncState();
    const report = prepareConfigurationSync(input, state);
    if (!report.requiresApply) return configurationSyncApplyResult(report);
    const rewrites = new Map<string, ConfigurationSyncSnapshotRewrite[]>();
    for (const scan of configurationSyncRecursiveScans(input.models, report)) {
      const replacements: ConfigurationSyncSnapshotRewrite[] = [];
      let after = "";
      while (true) {
        const rows = await this.all<SyncFieldRewriteRow>(
          SYNC_FIELD_REWRITE_ROWS_SQL,
          scan.readKey,
          after,
        );
        replacements.push(...scan.rewritePage(rows));
        if (rows.length < 100) break;
        after = rows.at(-1)!.id;
      }
      rewrites.set(scan.writeKey, replacements);
    }
    const plan = configurationSyncWritePlan(input, report, {
      storedStateJson: json,
      linkDirtyToken: crypto.randomUUID(),
      nextEventId: () => this.nextId(),
      rewrites,
    });
    const receipt = await executeWritePlan(
      this.database,
      plan,
      input.appliedAt,
      this.options.beforeMutation,
    ).catch((error: unknown) => {
      if (error instanceof D1WritePlanBudgetError && error.limit === "statements")
        failure("D1 mutation exceeds its statement budget.");
      sqliteWriteError(error, true, "D1");
    });
    if (receipt.kind === "rejected")
      return failedSynchronizationGuard({ valid: plan.linkChecks, first: this.first.bind(this) });
    const result = configurationSyncApplyResult(report, receipt);
    if (receipt.committedOutboxWork) this.options.onOutboxWork?.();
    return result;
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
      number,
      string,
      string | null,
      string | null,
    ])[];
    const baselines = new Map(
      (
        await this.all<{ readonly key: string; readonly structure_json: string | null }>(
          STORED_MODEL_BASELINES_SQL,
        )
      ).map((row) => [row.key, row.structure_json]),
    );
    const rows: StoredModelStateRow[] = tuples.map(
      ([
        key,
        kind,
        version,
        structure,
        projection,
        entries,
        drafts,
        published,
        hasBaseline,
        fingerprint,
        publicProjection,
        publicSource,
      ]) => ({
        draft_snapshot_count: drafts,
        entry_count: entries,
        key,
        kind,
        projection_hash: projection,
        public_projection_hash: publicProjection,
        public_projection_source_hash: publicSource,
        published_snapshot_count: published,
        snapshot_fingerprint: fingerprint,
        structure_json: hasBaseline === 1 ? (baselines.get(key) ?? null) : null,
        structure_hash: structure,
        version,
      }),
    );
    return { json, state: storedModelStates(rows) };
  }
}

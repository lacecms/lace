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
  STORED_MODEL_STATE_SQL,
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
  syncMigrationPage,
  syncMigrationSnapshotIds,
  syncMigrationTargetsJson,
  syncSnapshotPage,
  assertPageSize,
  chunks,
  failure,
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
import { randomUUID } from "node:crypto";
import { SQLITE_BIND_CHUNK } from "./sql.js";
import { NodeRepositoryBase } from "./base.js";
import { executeWritePlan } from "./write-plan.js";

/** Bound values per block-migration write; well below SQLite's compiled limit. */
const SQLITE_MIGRATION_PARAMETERS = 999;

/** Node configuration-sync scans and guarded synchronization writes. */
export class NodeConfigurationSync
  extends NodeRepositoryBase
  implements ConfigurationSyncStateReadPort, ConfigurationSyncApplyPort
{
  public async readConfigurationSyncState(): Promise<readonly StoredContentModelState[]> {
    return this.readConfigurationSyncStateNow();
  }

  public async readConfigurationSyncSnapshots(
    input: ConfigurationSyncSnapshotScanInput,
  ): Promise<ConfigurationSyncSnapshotPage> {
    const limit = assertPageSize(input.limit);
    const rows = this.connection
      .prepare(SYNC_SNAPSHOTS_SQL)
      .all(input.modelKey, input.after ?? "", limit) as readonly SyncSnapshotRow[];
    const blockRows: SyncBlockRow[] = [];
    for (const group of chunks(
      rows.map((row) => row.id),
      SQLITE_BIND_CHUNK,
    )) {
      blockRows.push(
        ...(this.connection
          .prepare(
            `${SYNC_BLOCKS_SQL} (${group.map(() => "?").join(", ")}) order by snapshot_id, position`,
          )
          .all(...group) as readonly SyncBlockRow[]),
      );
    }
    return syncSnapshotPage(rows, blockRows, limit);
  }

  public async readConfigurationSyncMigrationEntries(
    input: ConfigurationSyncMigrationScanInput,
  ): Promise<ConfigurationSyncMigrationPage> {
    const limit = assertMigrationPageSize(input.limit);
    const rows = this.connection
      .prepare(SYNC_MIGRATION_ENTRIES_SQL)
      .all(
        input.modelKey,
        syncMigrationTargetsJson(input.targets),
        input.after ?? "",
        limit,
      ) as readonly SyncMigrationEntryRow[];
    const types = JSON.stringify(input.targets.map((target) => target.type));
    const snapshotRows: SyncMigrationSnapshotRow[] = [];
    const blockRows: SyncMigrationBlockRow[] = [];
    const referenceRows: SyncMigrationReferenceRow[] = [];
    for (const group of chunks(syncMigrationSnapshotIds(rows), SQLITE_BIND_CHUNK)) {
      const bindings = `(${group.map(() => "?").join(", ")})`;
      snapshotRows.push(
        ...(this.connection
          .prepare(`${SYNC_MIGRATION_SNAPSHOTS_SQL} ${bindings}`)
          .all(...group) as readonly SyncMigrationSnapshotRow[]),
      );
      blockRows.push(
        ...(this.connection
          .prepare(`${SYNC_MIGRATION_BLOCKS_SQL} ${bindings}`)
          .all(types, ...group) as readonly SyncMigrationBlockRow[]),
      );
      referenceRows.push(
        ...(this.connection
          .prepare(`${SYNC_MIGRATION_REFERENCES_SQL} ${bindings}`)
          .all(...group) as readonly SyncMigrationReferenceRow[]),
      );
    }
    return syncMigrationPage(rows, snapshotRows, blockRows, referenceRows, limit);
  }

  /** One transaction per entry unit; a failed guard rolls back that unit and stops. */
  public async applyConfigurationSyncBlockMigrations(
    input: ApplyConfigurationSyncBlockMigrationsInput,
  ): Promise<ConfigurationSyncMigrationCounts> {
    let blocks = 0;
    let drafts = 0;
    let published = 0;
    for (const unit of input.units) {
      try {
        this.connection.transaction(() => {
          const linkDirtyToken = randomUUID();
          for (const migration of unit.snapshots) {
            this.checkpoint(`sync.migration.${migration.state}`);
            const statements = configurationSyncMigrationStatements(
              migration,
              input.migratedAt,
              SQLITE_MIGRATION_PARAMETERS,
              linkDirtyToken,
            );
            const guard = this.connection
              .prepare(`select ${statements.guard.sql} as ok`)
              .get(...statements.guard.params) as { readonly ok: number };
            if (guard.ok !== 1) staleBlockMigration();
            for (const write of statements.writes) {
              this.connection.prepare(write.sql).run(...write.params);
            }
          }
          this.connection.prepare(COMMIT_SYNC_LINK_GRAPH_SQL).run(linkDirtyToken);
          // In-transaction dirty token of the shared sync link statements (§16 runtime deltas).
          this.connection.prepare("delete from mutation_guards where token=?").run(linkDirtyToken);
        })();
      } catch (error) {
        this.throwWriteError(error, false);
      }
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
    try {
      let report = input.plan;
      const receipt = executeWritePlan(
        this.connection,
        () => {
          report = prepareConfigurationSync(input, this.readConfigurationSyncStateNow());
          const rewrites = new Map<string, ConfigurationSyncSnapshotRewrite[]>();
          for (const scan of configurationSyncRecursiveScans(input.models, report)) {
            const readPage = this.connection.prepare(SYNC_FIELD_REWRITE_ROWS_SQL);
            const replacements: ConfigurationSyncSnapshotRewrite[] = [];
            let after = "";
            while (true) {
              const rows = readPage.all(scan.readKey, after) as SyncFieldRewriteRow[];
              replacements.push(...scan.rewritePage(rows));
              if (rows.length < 100) break;
              after = rows.at(-1)!.id;
            }
            rewrites.set(scan.writeKey, replacements);
          }
          return configurationSyncWritePlan(input, report, {
            rewrites,
            linkDirtyToken: randomUUID(),
            nextEventId: () => this.nextId(),
          });
        },
        (name) => this.checkpoint(name),
      );
      if (receipt.kind === "rejected")
        failure("Schema synchronization would introduce an unavailable internal link.");
      return configurationSyncApplyResult(report, receipt);
    } catch (error) {
      this.throwWriteError(error, true);
    }
  }

  private readConfigurationSyncStateNow(): readonly StoredContentModelState[] {
    return storedModelStates(
      this.connection.prepare(STORED_MODEL_STATE_SQL).all() as readonly StoredModelStateRow[],
    );
  }
}

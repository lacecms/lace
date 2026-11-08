import type { FieldVisibility } from "@lacecms/content";
import {
  configurationSyncSnapshotRewrites,
  configurationSyncAdvancesPublicState,
  configurationSyncContentWrites,
  configurationSyncBaseline,
  planConfigurationSynchronization,
  renderConfigurationSyncPlanJson,
} from "@lacecms/application";
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
  syncInternalLinkStatements,
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
  configurationSyncWriteStatements,
  configurationSyncSnapshotRewriteStatements,
  SYNC_FIELD_REWRITE_ROWS_SQL,
  staleBlockMigration,
  staleSynchronizationPlan,
  syncMigrationPage,
  syncMigrationSnapshotIds,
  syncMigrationTargetsJson,
  syncSnapshotPage,
  assertPageSize,
  chunks,
  failure,
  parseObject,
  sameStoredModelStates,
  storedModelStates,
} from "@lacecms/db";
import type {
  SyncBlockRow,
  SyncMigrationBlockRow,
  SyncMigrationEntryRow,
  SyncMigrationReferenceRow,
  SyncMigrationSnapshotRow,
  SyncSnapshotRow,
  StoredModelStateRow,
} from "@lacecms/db";
import { isSingletonKind } from "@lacecms/domain";
import { randomUUID } from "node:crypto";
import { SQLITE_BIND_CHUNK } from "./sql.js";
import { NodeRepositoryBase } from "./base.js";

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
      return this.connection.transaction(() => {
        const current = this.readConfigurationSyncStateNow();
        const actualPlan = planConfigurationSynchronization({
          evidence: input.evidence,
          models: input.models,
          storedModels: current,
        });
        if (
          !input.plan.isValid ||
          !sameStoredModelStates(input.expectedStoredModels, current) ||
          renderConfigurationSyncPlanJson(input.plan) !==
            renderConfigurationSyncPlanJson(actualPlan)
        )
          staleSynchronizationPlan();
        if (!actualPlan.requiresApply) {
          return Object.freeze({ operations: Object.freeze([]), status: "noop" as const });
        }

        const expectedByKey = new Map(
          input.expectedStoredModels.map((model) => [model.key, model]),
        );
        const configurationByKey = new Map(input.models.map((model) => [model.key, model]));
        const singletonEntries = new Map(
          input.singletonEntries.map((page) => [page.modelKey, page]),
        );
        const linkDirtyToken = randomUUID();
        const linkStatements = syncInternalLinkStatements(input.linkRewrites ?? [], linkDirtyToken);
        for (const valid of linkStatements.valid) {
          const row = this.connection.prepare(`select ${valid.sql} as ok`).get(...valid.params) as {
            readonly ok: number;
          };
          if (row.ok !== 1)
            failure("Schema synchronization would introduce an unavailable internal link.");
        }
        for (const operation of actualPlan.operations) {
          if (operation.action === "create") {
            const configuration = configurationByKey.get(operation.model.key);
            if (configuration === undefined) failure("Synchronization model is unavailable.");
            this.checkpoint("sync.model.create");
            const baseline = configurationSyncBaseline(configuration);
            this.connection
              .prepare(
                "insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, public_projection_hash, public_projection_source_hash, structure_json, structure_json_hash, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              )
              .run(
                operation.model.key,
                operation.model.kind,
                configuration.label ?? configuration.key,
                operation.model.version,
                operation.model.structureHash,
                operation.model.projectionHash,
                configuration.publicProjectionHash ?? null,
                operation.model.projectionHash,
                baseline.json,
                baseline.hash,
                input.appliedAt,
                input.appliedAt,
              );
            if (isSingletonKind(configuration.kind)) {
              const page = singletonEntries.get(operation.model.key);
              if (page === undefined || page.entry.model.key !== operation.model.key) {
                failure("Singleton synchronization entry is missing or invalid.");
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
            if (removed.changes !== 1) staleSynchronizationPlan();
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
          const baseline = configurationSyncBaseline(configuration);
          const updated = this.connection
            .prepare(
              "update content_models set key = ?, kind = ?, label = ?, config_version = ?, structure_hash = ?, projection_hash = ?, public_projection_hash = ?, public_projection_source_hash = ?, structure_json = ?, structure_json_hash = ?, updated_at = ? where key = ? and kind = ? and config_version = ? and structure_hash = ? and projection_hash = ?",
            )
            .run(
              operation.model.key,
              operation.model.kind,
              configuration.label ?? configuration.key,
              operation.model.version,
              operation.model.structureHash,
              operation.model.projectionHash,
              configuration.publicProjectionHash ?? null,
              operation.model.projectionHash,
              baseline.json,
              baseline.hash,
              input.appliedAt,
              expected.key,
              expected.kind,
              expected.version,
              expected.structureHash,
              expected.projectionHash,
            );
          if (updated.changes !== 1) staleSynchronizationPlan();
          if (
            (operation.action === "version-update" || operation.action === "rename") &&
            operation.evolution?.recursiveFields
          ) {
            const replacements: ConfigurationSyncSnapshotRewrite[] = [];
            let after = "";
            while (true) {
              const rows = this.connection
                .prepare(SYNC_FIELD_REWRITE_ROWS_SQL)
                .all(
                  operation.model.key,
                  after,
                ) as readonly import("@lacecms/db").SyncFieldRewriteRow[];
              replacements.push(
                ...configurationSyncSnapshotRewrites(
                  configuration.fields,
                  operation.evolution.changes,
                  rows.map((row) => ({
                    id: row.id,
                    fields: parseObject(row.fields_json, "Snapshot fields"),
                    state: row.state,
                  })),
                  configuration.visibility as FieldVisibility | undefined,
                ),
              );
              if (rows.length < 100) break;
              after = rows.at(-1)!.id;
            }
            const statements = configurationSyncSnapshotRewriteStatements(
              replacements,
              operation.model.key,
            );
            for (const [index, statement] of statements.entries()) {
              this.checkpoint(`sync.model.rewrite-fields.${index}`);
              this.connection.prepare(statement.sql).run(...statement.params);
            }
          }
          for (const write of configurationSyncContentWrites(operation, configuration)) {
            this.checkpoint(`sync.model.${write.action}`);
            for (const statement of configurationSyncWriteStatements(write, operation.model.key)) {
              this.connection.prepare(statement.sql).run(...statement.params);
            }
          }
        }
        for (const write of linkStatements.writes)
          this.connection.prepare(write.sql).run(...write.params);
        if (linkStatements.writes.length) {
          this.connection.prepare(COMMIT_SYNC_LINK_GRAPH_SQL).run(linkDirtyToken);
          // In-transaction dirty token of the shared sync link statements (§16 runtime deltas).
          this.connection.prepare("delete from mutation_guards where token=?").run(linkDirtyToken);
        }
        if (!configurationSyncAdvancesPublicState(actualPlan)) {
          return Object.freeze({ operations: actualPlan.operations, status: "applied" as const });
        }
        const targetVersion = this.bumpPublicState(
          input.appliedAt,
          "system:content-sync",
          null,
          "configuration_sync",
        );
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

  private readConfigurationSyncStateNow(): readonly StoredContentModelState[] {
    return storedModelStates(
      this.connection.prepare(STORED_MODEL_STATE_SQL).all() as readonly StoredModelStateRow[],
    );
  }
}

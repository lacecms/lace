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
  configurationSyncWriteStatements,
  configurationSyncSnapshotRewriteStatements,
  SYNC_FIELD_REWRITE_ROWS_SQL,
  staleBlockMigration,
  failedSynchronizationGuard,
  syncMigrationPage,
  syncMigrationSnapshotIds,
  syncMigrationTargetsJson,
  syncSnapshotPage,
  assertDraftPersistenceBounds,
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
import { D1_MAX_BATCH_STATEMENTS, D1_MAX_BOUND_PARAMETERS } from "../d1/database.js";
import { GUARD_SQL } from "./batch.js";

declare const crypto: { randomUUID(): string };
import { D1RepositoryBase } from "./base.js";

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
    const actualPlan = planConfigurationSynchronization({
      evidence: input.evidence,
      models: input.models,
      storedModels: state,
    });
    if (
      !input.plan.isValid ||
      !sameStoredModelStates(input.expectedStoredModels, state) ||
      renderConfigurationSyncPlanJson(input.plan) !== renderConfigurationSyncPlanJson(actualPlan)
    )
      await failedSynchronizationGuard();
    if (!actualPlan.requiresApply)
      return Object.freeze({ operations: Object.freeze([]), status: "noop" as const });
    const expectedByKey = new Map(input.expectedStoredModels.map((model) => [model.key, model]));
    const configurationByKey = new Map(input.models.map((model) => [model.key, model]));
    const singletonEntries = new Map(input.singletonEntries.map((page) => [page.modelKey, page]));
    const batch = this.batch();
    const linkDirtyToken = crypto.randomUUID();
    const linkStatements = syncInternalLinkStatements(input.linkRewrites ?? [], linkDirtyToken);
    const links = { valid: linkStatements.valid, first: this.first.bind(this) };
    const token = this.guard(batch, input.appliedAt, {
      params: [json, ...linkStatements.valid.flatMap((valid) => valid.params)],
      sql: `${STORED_MODEL_STATE_JSON_SQL} = ?${linkStatements.valid.map((valid) => ` and (${valid.sql})`).join("")}`,
    });
    for (const operation of actualPlan.operations) {
      if (operation.action === "create") {
        const configuration = configurationByKey.get(operation.model.key);
        if (configuration === undefined) failure("Synchronization model is unavailable.");
        batch.checkpoint("sync.model.create");
        const baseline = configurationSyncBaseline(configuration);
        batch.add(
          `insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, public_projection_hash, public_projection_source_hash, structure_json, structure_json_hash, created_at, updated_at) select ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? where ${GUARD_SQL}`,
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
          token,
        );
        if (isSingletonKind(configuration.kind)) {
          const page = singletonEntries.get(operation.model.key);
          if (page === undefined || page.entry.model.key !== operation.model.key) {
            failure("Singleton synchronization entry is missing or invalid.");
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
      const baseline = configurationSyncBaseline(configuration);
      batch.add(
        `update content_models set key = ?, kind = ?, label = ?, config_version = ?, structure_hash = ?, projection_hash = ?, public_projection_hash = ?, public_projection_source_hash = ?, structure_json = ?, structure_json_hash = ?, updated_at = ? where key = ? and kind = ? and config_version = ? and structure_hash = ? and projection_hash = ? and ${GUARD_SQL}`,
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
        token,
      );
      if (
        (operation.action === "version-update" || operation.action === "rename") &&
        operation.evolution?.recursiveFields
      ) {
        const replacements: ConfigurationSyncSnapshotRewrite[] = [];
        let after = "";
        while (true) {
          const rows = await this.all<import("@lacecms/db").SyncFieldRewriteRow>(
            SYNC_FIELD_REWRITE_ROWS_SQL,
            previousKey,
            after,
          );
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
          batch.checkpoint(`sync.model.rewrite-fields.${index}`);
          batch.add(`${statement.sql} and ${GUARD_SQL}`, ...statement.params, token);
        }
      }
      for (const write of configurationSyncContentWrites(operation, configuration)) {
        batch.checkpoint(`sync.model.${write.action}`);
        for (const statement of configurationSyncWriteStatements(write, operation.model.key)) {
          batch.add(`${statement.sql} and ${GUARD_SQL}`, ...statement.params, token);
        }
      }
    }
    for (const write of linkStatements.writes)
      batch.add(`${write.sql} and ${GUARD_SQL}`, ...write.params, token);
    if (linkStatements.writes.length) {
      batch.add(`${COMMIT_SYNC_LINK_GRAPH_SQL} and ${GUARD_SQL}`, linkDirtyToken, token);
      this.releaseGuard(batch, linkDirtyToken);
    }
    if (!configurationSyncAdvancesPublicState(actualPlan)) {
      this.releaseGuard(batch, token);
      const results = await this.execute(batch, true);
      if (results[0]!.meta.changes !== 1) await failedSynchronizationGuard(links);
      return Object.freeze({ operations: actualPlan.operations, status: "applied" as const });
    }
    const stateStatements = this.addPublicStateBump(
      batch,
      { params: [token], sql: GUARD_SQL },
      {
        reason: "configuration_sync",
        requestedAt: input.appliedAt,
        requestedBy: "system:content-sync",
        snapshotId: null,
      },
    );
    this.releaseGuard(batch, token);
    const results = await this.execute(batch, true);
    if (results[0]!.meta.changes !== 1) await failedSynchronizationGuard(links);
    return Object.freeze({
      operations: actualPlan.operations,
      status: "applied" as const,
      targetVersion: this.stateVersion(results, stateStatements),
    });
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

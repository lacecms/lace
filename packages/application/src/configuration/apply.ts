import type {
  ConfigurationSyncSnapshot,
  ModelSnapshotEvidence,
  ConfigurationSyncScanRequest,
  ConfigurationSyncMigrationTarget,
  ConfigurationSyncEntryMigration,
  ConfigurationSyncOperation,
  ConfigurationSyncPlan,
  ConfigurationSyncStateReadPort,
  ConfigurationSyncSingletonEntry,
  ConfigurationSyncMigrationCounts,
  ApplyConfigurationSynchronizationResult,
  ConfigurationSyncApplyPort,
  PreparedConfigurationSynchronization,
} from "./types.js";
import {
  CONFIGURATION_SYNC_SCAN_PAGE_SIZE,
  CONFIGURATION_SYNC_MIGRATION_PAGE_SIZE,
} from "./limits.js";
import type { NormalizedContentModel } from "@lacecms/config";
import { configurationSyncLinkRewrites } from "./links.js";
import { validateModelFields } from "@lacecms/content";
import type { BlockDefinition, BlockRegistry, JsonObject } from "@lacecms/content";
import {
  DomainError,
  StaleSynchronizationError,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  isSingletonKind,
} from "@lacecms/domain";
import type {
  ContentEntryId,
  ContentModelKey,
  ContentModelRoute,
  ContentSnapshotId,
  UnixMilliseconds,
} from "@lacecms/domain";
import { createSnapshotEvidenceAccumulator } from "./evidence.js";
import { createMigrationEvidenceAccumulator, planEntryMigration } from "./migration.js";
import type { Clock, IdGenerator } from "../ports/infrastructure.js";

import { contentSyncActor, copyStoredModel } from "./model-state.js";
import { compareByKey } from "./diagnostics.js";
import { planConfigurationSynchronization, planConfigurationSyncScans } from "./plan.js";
import { renderConfigurationSyncPlanJson, reportConfigurationSynchronization } from "./report.js";
function registryError(message: string): never {
  throw new DomainError("CONTENT_INVALID_STATE", message);
}

/** Executable definitions of the migrated block types, checked against their configured versions. */
function migrationDefinitions(
  blocks: BlockRegistry | undefined,
  targets: readonly ConfigurationSyncMigrationTarget[],
): ReadonlyMap<string, BlockDefinition> {
  if (blocks === undefined) {
    registryError("The block registry is required to migrate stored blocks.");
  }
  const definitions = new Map<string, BlockDefinition>();
  for (const target of targets) {
    const definition = blocks.get(target.type);
    if (definition?.version !== target.version) {
      registryError(
        `The block registry does not define block type ${target.type} at version ${target.version}.`,
      );
    }
    definitions.set(target.type, definition);
  }
  return definitions;
}

/** Scans one model's snapshots, and its stale blocks when migrations apply, through the read port. */
async function scanModel(
  state: ConfigurationSyncStateReadPort,
  request: ConfigurationSyncScanRequest,
  blocks: BlockRegistry | undefined,
): Promise<ModelSnapshotEvidence> {
  const accumulator = createSnapshotEvidenceAccumulator(request);
  let after: string | undefined;
  do {
    const page = await state.readConfigurationSyncSnapshots({
      ...(after === undefined ? {} : { after }),
      limit: CONFIGURATION_SYNC_SCAN_PAGE_SIZE,
      modelKey: contentModelKey(request.modelKey),
    });
    accumulator.add(
      page.items.map((snapshot): ConfigurationSyncSnapshot => {
        if (request.migrations === undefined || blocks === undefined) return snapshot;
        const definitions = migrationDefinitions(blocks, request.migrations);
        const migrationSnapshot = {
          blocks: snapshot.blocks.map((block, position) => ({
            ...block,
            position,
            data: block.data ?? {},
            hidden: block.hidden ?? false,
          })),
          fields: snapshot.fields,
          references: snapshot.references ?? [],
          revision: snapshot.revision,
          snapshotId: snapshot.snapshotId,
          state: snapshot.state,
          title: snapshot.title,
        };
        const planned = planEntryMigration(
          { entryId: snapshot.entryId, [snapshot.state]: migrationSnapshot },
          definitions,
          contentSyncActor.id,
          {
            fields: request.storedFields ?? request.fields,
            blocks: new Map(blocks.blocks.map((block) => [block.type, block])),
          },
        );
        const rewrite = planned.unit?.snapshots[0];
        if (rewrite === undefined) return snapshot;
        const rewritten = new Map(rewrite.blocks.map((block) => [block.key, block.data]));
        return {
          ...snapshot,
          blocks: snapshot.blocks.map((block) => ({
            ...block,
            data: rewritten.get(block.key) ?? block.data ?? {},
          })),
          references: [
            ...(snapshot.references ?? []).filter(
              (reference) => !rewritten.has(reference.sourceKey),
            ),
            ...rewrite.references,
          ],
        };
      }),
    );
    after = page.next;
  } while (after !== undefined);
  const evidence = accumulator.result();
  if (request.migrations === undefined) return evidence;

  const migrations = createMigrationEvidenceAccumulator(
    migrationDefinitions(blocks, request.migrations),
    contentSyncActor.id,
    {
      fields: request.storedFields ?? request.fields,
      blocks: new Map(blocks!.blocks.map((block) => [block.type, block])),
    },
  );
  do {
    const page = await state.readConfigurationSyncMigrationEntries({
      ...(after === undefined ? {} : { after }),
      limit: CONFIGURATION_SYNC_MIGRATION_PAGE_SIZE,
      modelKey: contentModelKey(request.modelKey),
      targets: request.migrations,
    });
    migrations.add(page.items);
    after = page.next;
  } while (after !== undefined);
  return Object.freeze({ ...evidence, migrations: migrations.result() });
}

function assertRegistryCoversModels(
  models: readonly NormalizedContentModel[],
  blocks: BlockRegistry,
): void {
  for (const model of models) {
    for (const type of model.blocks) {
      if (blocks.get(type) === undefined) {
        registryError(`Model ${model.key} allows block type ${type}, which the registry lacks.`);
      }
    }
  }
}

/**
 * Reads persistence once, scans data-dependent models, executes needed block
 * migrations in memory, and produces the non-mutating decision.
 */
export async function prepareConfigurationSynchronization(input: {
  /** Executable block registry; required when stored blocks need migrations. */
  readonly blocks?: BlockRegistry;
  readonly models: readonly NormalizedContentModel[];
  readonly state: ConfigurationSyncStateReadPort;
}): Promise<PreparedConfigurationSynchronization> {
  if (input.blocks !== undefined) assertRegistryCoversModels(input.models, input.blocks);
  const storedModels = Object.freeze(
    (await input.state.readConfigurationSyncState()).map(copyStoredModel).sort(compareByKey),
  );
  const evidence: Record<string, ModelSnapshotEvidence> = {};
  for (const request of planConfigurationSyncScans({ models: input.models, storedModels })) {
    evidence[request.modelKey] = await scanModel(input.state, request, input.blocks);
  }
  const frozenEvidence = Object.freeze(evidence);
  const plan = planConfigurationSynchronization({
    evidence: frozenEvidence,
    models: input.models,
    storedModels,
  });
  return Object.freeze({
    evidence: frozenEvidence,
    plan,
    report: reportConfigurationSynchronization(plan),
    storedModels,
  });
}

/** Creates the one incomplete draft that a newly synchronized page or global must own. */
export function createConfigurationSyncSingletonEntry(input: {
  readonly appliedAt: UnixMilliseconds;
  readonly entryId: ContentEntryId | string;
  readonly model: NormalizedContentModel;
  readonly snapshotId: ContentSnapshotId | string;
}): ConfigurationSyncSingletonEntry {
  if (input.model.kind === "collection") {
    throw new DomainError(
      "CONTENT_INVALID_STATE",
      "Only page and global models receive synchronized entries.",
    );
  }
  const entryId = contentEntryId(input.entryId);
  const snapshotId = contentSnapshotId(input.snapshotId);
  const key = contentModelKey(input.model.key);
  const model: ContentModelRoute = Object.freeze(
    input.model.kind === "page"
      ? { key, kind: "page" as const, path: input.model.path }
      : { key, kind: "global" as const },
  );
  const entry = createContentEntry({
    id: entryId,
    model,
    draft: {
      blocks: [],
      createdAt: input.appliedAt,
      entryId,
      fields: validateModelFields(input.model.fields, {}, "draft") as JsonObject,
      id: snapshotId,
      revision: 1,
      state: "draft",
      title: input.model.label ?? input.model.key,
      updatedAt: input.appliedAt,
      updatedBy: contentSyncActor,
    },
  });
  return Object.freeze({ entry, modelKey: model.key });
}

/** Applies a freshly prepared valid plan and allocates identities only for singleton creates. */
/** One operator line describing the stored blocks an apply migrated. */
export function configurationSyncMigrationSummary(
  counts: ConfigurationSyncMigrationCounts,
): string {
  return `Migrated blocks: ${counts.blocks} (drafts=${counts.drafts}, published=${counts.published}).`;
}

/** Plan JSON without planned block migrations, which the migration phase consumes. */
function planJsonWithoutMigrations(plan: ConfigurationSyncPlan): string {
  return renderConfigurationSyncPlanJson({
    ...plan,
    operations: plan.operations.map((operation) => {
      if (!("evolution" in operation) || operation.evolution === undefined) return operation;
      const { migrations: _migrations, ...evolution } = operation.evolution;
      return {
        ...operation,
        evolution: {
          ...evolution,
          changes: evolution.changes.map(({ migration: _migration, ...change }) => change),
        },
      } as ConfigurationSyncOperation;
    }),
  });
}

/** Stored model keys and targets of every planned block migration. */
function plannedMigrations(plan: ConfigurationSyncPlan): readonly {
  readonly modelKey: ContentModelKey;
  readonly targets: readonly ConfigurationSyncMigrationTarget[];
}[] {
  const planned = [];
  for (const operation of plan.operations) {
    if (operation.action !== "version-update" && operation.action !== "rename") continue;
    const migrations = operation.evolution?.migrations;
    if (migrations === undefined) continue;
    planned.push({
      modelKey: operation.action === "rename" ? operation.renamedFrom : operation.model.key,
      targets: migrations.map((migration) => ({
        type: migration.blockType,
        version: migration.toVersion,
      })),
    });
  }
  return planned;
}

function staleSynchronization(message: string): never {
  throw new StaleSynchronizationError(message);
}

/** Rewrites every stale block of the planned migrations in guarded per-entry units. */
async function migrateStoredBlocks(
  input: {
    readonly blocks: BlockRegistry | undefined;
    readonly clock: Clock;
    readonly target: ConfigurationSyncApplyPort & ConfigurationSyncStateReadPort;
    readonly models: readonly NormalizedContentModel[];
  },
  planned: ReturnType<typeof plannedMigrations>,
): Promise<ConfigurationSyncMigrationCounts> {
  const storedModels = await input.target.readConfigurationSyncState();
  let blocks = 0;
  let drafts = 0;
  let published = 0;
  for (const { modelKey, targets } of planned) {
    const definitions = migrationDefinitions(input.blocks, targets);
    let after: string | undefined;
    do {
      const page = await input.target.readConfigurationSyncMigrationEntries({
        ...(after === undefined ? {} : { after }),
        limit: CONFIGURATION_SYNC_MIGRATION_PAGE_SIZE,
        modelKey,
        targets,
      });
      const units: ConfigurationSyncEntryMigration[] = [];
      for (const entry of page.items) {
        const model = input.models.find(
          (model) => model.key === modelKey || model.renamedFrom === modelKey,
        );
        const migration = planEntryMigration(entry, definitions, contentSyncActor.id, {
          fields:
            (storedModels.find((stored) => stored.key === modelKey)?.structure
              ?.fields as unknown as NonNullable<typeof model>["fields"]) ??
            model?.fields ??
            {},
          blocks: new Map(input.blocks!.blocks.map((block) => [block.type, block])),
        });
        if (migration.findings.length > 0) {
          staleSynchronization(
            "Block migration results changed since planning; the synchronization plan is stale.",
          );
        }
        if (migration.unit !== undefined) units.push(migration.unit);
      }
      if (units.length > 0) {
        const written = await input.target.applyConfigurationSyncBlockMigrations({
          migratedAt: input.clock.now(),
          modelKey,
          units,
        });
        blocks += written.blocks;
        drafts += written.drafts;
        published += written.published;
      }
      after = page.next;
    } while (after !== undefined);
  }
  return Object.freeze({ blocks, drafts, published });
}

/**
 * Applies a reviewed plan. Planned block migrations are first written in
 * guarded per-entry units; the plan is then prepared again from current state
 * and must match the reviewed plan apart from its migrations before the final
 * guarded mutation runs. A stale error leaves committed units in place, and a
 * rerun completes the remaining work.
 */
export async function applyPreparedConfigurationSynchronization(input: {
  /** Executable block registry; required when the plan migrates stored blocks. */
  readonly blocks?: BlockRegistry;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly models: readonly NormalizedContentModel[];
  readonly prepared: PreparedConfigurationSynchronization;
  readonly target: ConfigurationSyncApplyPort & ConfigurationSyncStateReadPort;
}): Promise<ApplyConfigurationSynchronizationResult> {
  if (!input.prepared.plan.isValid) {
    throw new DomainError(
      "CONTENT_INVALID_STATE",
      "Configuration synchronization plan is invalid.",
    );
  }
  let prepared = input.prepared;
  let migrated: ConfigurationSyncMigrationCounts | undefined;
  const planned = plannedMigrations(prepared.plan);
  if (planned.length > 0) {
    migrated = await migrateStoredBlocks(
      { blocks: input.blocks, clock: input.clock, target: input.target, models: input.models },
      planned,
    );
    prepared = await prepareConfigurationSynchronization({
      ...(input.blocks === undefined ? {} : { blocks: input.blocks }),
      models: input.models,
      state: input.target,
    });
    if (
      !prepared.plan.isValid ||
      plannedMigrations(prepared.plan).length > 0 ||
      planJsonWithoutMigrations(prepared.plan) !== planJsonWithoutMigrations(input.prepared.plan)
    ) {
      staleSynchronization("Configuration synchronization plan is stale after block migration.");
    }
  }
  const result = await applyFinalMutation(input, prepared);
  return migrated === undefined ? result : Object.freeze({ ...result, migrated });
}

async function applyFinalMutation(
  input: {
    readonly ids: IdGenerator;
    readonly clock: Clock;
    readonly models: readonly NormalizedContentModel[];
    readonly target: ConfigurationSyncApplyPort & ConfigurationSyncStateReadPort;
  },
  prepared: PreparedConfigurationSynchronization,
): Promise<ApplyConfigurationSynchronizationResult> {
  const models = new Map(input.models.map((model) => [model.key, model]));
  const appliedAt = input.clock.now();
  const singletonEntries: ConfigurationSyncSingletonEntry[] = [];
  for (const operation of prepared.plan.operations) {
    if (operation.action !== "create") continue;
    const model = models.get(operation.model.key);
    if (model === undefined || !isSingletonKind(model.kind)) continue;
    singletonEntries.push(
      createConfigurationSyncSingletonEntry({
        appliedAt,
        entryId: input.ids.next(),
        model,
        snapshotId: input.ids.next(),
      }),
    );
  }
  return input.target.applyConfigurationSynchronization({
    linkRewrites: await configurationSyncLinkRewrites({
      models: input.models,
      plan: prepared.plan,
      state: input.target,
      singletons: singletonEntries,
    }),
    appliedAt,
    evidence: prepared.evidence,
    expectedStoredModels: prepared.storedModels,
    models: input.models,
    singletonEntries,
    plan: prepared.plan,
  });
}

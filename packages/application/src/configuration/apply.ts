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
  ConfigurationSyncSnapshotMigration,
  ConfigurationSyncReferenceRenames,
} from "./types.js";
import {
  CONFIGURATION_SYNC_SCAN_PAGE_SIZE,
  CONFIGURATION_SYNC_MIGRATION_PAGE_SIZE,
} from "./limits.js";
import type { NormalizedContentModel } from "@lacecms/config";
import {
  ConfigurationReferenceProjectionError,
  configurationReferenceRenames,
  configurationSyncLinkRewrites,
} from "./links.js";
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
  unixMilliseconds,
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
import { compareByKey, compareDiagnostics, diagnostic } from "./diagnostics.js";
import {
  configurationSyncAdvancesPublicState,
  planConfigurationSynchronization,
  planConfigurationSyncScans,
} from "./plan.js";
import { siteBuildEvent } from "../ports/outbox.js";
import { renderConfigurationSyncPlanJson, reportConfigurationSynchronization } from "./report.js";
import { declaresSyncReferences, referenceBlockDescriptors } from "./reference-occurrences.js";
import { reviewSyncReferences } from "./reference-review.js";
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
          ...(snapshot.internalLinks === undefined
            ? {}
            : { internalLinks: snapshot.internalLinks }),
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
  const referenceWork =
    input.models.some((model) => declaresSyncReferences(model.structure)) ||
    storedModels.some((model) => declaresSyncReferences(model.structure));
  const referenceRevision = referenceWork
    ? await input.state.readConfigurationSyncReferenceRevision?.()
    : undefined;
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
  const checked =
    plan.isValid && plan.requiresApply && referenceWork
      ? await checkPlannedReferences(input, storedModels, plan)
      : plan;
  if (
    referenceRevision !== undefined &&
    referenceRevision !== (await input.state.readConfigurationSyncReferenceRevision?.())
  )
    staleSynchronization(
      "Entry references changed while planning synchronization. Retry the check.",
    );
  return Object.freeze({
    evidence: frozenEvidence,
    ...(referenceRevision === undefined ? {} : { referenceRevision }),
    plan: checked,
    report: reportConfigurationSynchronization(checked),
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

interface MigrationInputs {
  readonly blocks: BlockRegistry | undefined;
  readonly state: ConfigurationSyncStateReadPort;
  readonly models: readonly NormalizedContentModel[];
}

/** Planning and apply visit exactly the same whole-entry units in the same order. */
async function* migrationPages(
  input: MigrationInputs,
  storedModels: readonly import("./types.js").StoredContentModelState[],
  plan: ConfigurationSyncPlan,
) {
  const renames = configurationReferenceRenames(plan);
  for (const { modelKey, targets } of plannedMigrations(plan)) {
    const definitions = migrationDefinitions(input.blocks, targets);
    const model = input.models.find(
      (item) => item.key === modelKey || item.renamedFrom === modelKey,
    );
    const stored = storedModels.find((item) => item.key === modelKey);
    const context = {
      fields:
        (stored?.structure?.fields as NonNullable<typeof model>["fields"] | undefined) ??
        model?.fields ??
        {},
      blocks: new Map(input.blocks!.blocks.map((block) => [block.type, block])),
      referenceModel: {
        key: contentModelKey(model?.key ?? modelKey),
        blocks: referenceBlockDescriptors(stored?.structure),
        renames,
      },
    };
    let after: string | undefined;
    do {
      const page = await input.state.readConfigurationSyncMigrationEntries({
        ...(after === undefined ? {} : { after }),
        limit: CONFIGURATION_SYNC_MIGRATION_PAGE_SIZE,
        modelKey,
        targets,
      });
      const units: ConfigurationSyncEntryMigration[] = [];
      for (const entry of page.items) {
        const migration = planEntryMigration(entry, definitions, contentSyncActor.id, context);
        if (migration.findings.length > 0)
          staleSynchronization(
            "Block migration results changed since planning; the synchronization plan is stale.",
          );
        if (migration.unit !== undefined) units.push(migration.unit);
      }
      if (units.length > 0) yield { modelKey, units, structureHash: stored?.structureHash };
      after = page.next;
    } while (after !== undefined);
  }
}

async function checkPlannedReferences(
  input: Omit<MigrationInputs, "blocks"> & { readonly blocks?: BlockRegistry },
  storedModels: readonly import("./types.js").StoredContentModelState[],
  plan: ConfigurationSyncPlan,
): Promise<ConfigurationSyncPlan> {
  const migrated = new Map<string, ConfigurationSyncSnapshotMigration>();
  for await (const page of migrationPages({ ...input, blocks: input.blocks }, storedModels, plan))
    for (const unit of page.units)
      for (const snapshot of unit.snapshots) migrated.set(snapshot.snapshotId, snapshot);
  const singletonEntries = plan.operations.flatMap((operation) => {
    if (operation.action !== "create") return [];
    const model = input.models.find((candidate) => candidate.key === operation.model.key)!;
    if (!isSingletonKind(model.kind)) return [];
    return [
      createConfigurationSyncSingletonEntry({
        model,
        appliedAt: unixMilliseconds(0),
        entryId: `check:\u0000${model.key}`,
        snapshotId: `check:\u0000${model.key}`,
      }),
    ];
  });
  let rewrites: Awaited<ReturnType<typeof configurationSyncLinkRewrites>>;
  try {
    rewrites = await configurationSyncLinkRewrites({
      ...input,
      plan,
      storedModels,
      migrated,
      singletons: singletonEntries,
    });
  } catch (error) {
    if (!(error instanceof ConfigurationReferenceProjectionError)) throw error;
    return invalidReferencePlan(plan, [
      diagnostic("REFERENCE_SYNC_INVALID", error.modelKey, error.message, {
        snapshots: [error.snapshot],
      }),
    ]);
  }
  const renames = configurationReferenceRenames(plan);
  const final = await reviewSyncReferences(input.state, {
    checks: rewrites.flatMap((row) => (row.referenceCheck ? [row.referenceCheck] : [])),
    renames,
  });
  const intermediate =
    final.length > 0
      ? []
      : await reviewSyncReferences(input.state, {
          checks: [...migrated.values()].flatMap((row) =>
            row.referenceCheck ? [row.referenceCheck] : [],
          ),
          renames,
          sequence: true,
        });
  const diagnostics = [...final, ...intermediate];
  return diagnostics.length === 0 ? plan : invalidReferencePlan(plan, diagnostics);
}

function invalidReferencePlan(
  plan: ConfigurationSyncPlan,
  diagnostics: ConfigurationSyncPlan["diagnostics"],
): ConfigurationSyncPlan {
  return Object.freeze({
    ...plan,
    isValid: false,
    requiresApply: false,
    diagnostics: Object.freeze([...plan.diagnostics, ...diagnostics].sort(compareDiagnostics)),
  });
}

/** Re-read and apply each migration page, preserving already committed units on failure. */
async function migrateStoredBlocks(
  input: MigrationInputs & {
    readonly clock: Clock;
    readonly state: ConfigurationSyncApplyPort & ConfigurationSyncStateReadPort;
  },
  prepared: PreparedConfigurationSynchronization,
): Promise<ConfigurationSyncMigrationCounts> {
  let blocks = 0;
  let drafts = 0;
  let published = 0;
  const referenceRenames: ConfigurationSyncReferenceRenames = configurationReferenceRenames(
    prepared.plan,
  );
  for await (const { modelKey, units, structureHash } of migrationPages(
    input,
    prepared.storedModels,
    prepared.plan,
  )) {
    const written = await input.state.applyConfigurationSyncBlockMigrations({
      migratedAt: input.clock.now(),
      modelKey,
      units,
      referenceRenames,
      ...(structureHash === undefined ? {} : { expectedStructureHash: structureHash }),
    });
    blocks += written.blocks;
    drafts += written.drafts;
    published += written.published;
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
  if (
    input.prepared.referenceRevision !== undefined &&
    input.prepared.referenceRevision !==
      (await input.target.readConfigurationSyncReferenceRevision?.())
  )
    staleSynchronization(
      "Entry references changed since planning synchronization. Retry the check.",
    );
  let prepared = input.prepared;
  let migrated: ConfigurationSyncMigrationCounts | undefined;
  const planned = plannedMigrations(prepared.plan);
  if (planned.length > 0) {
    migrated = await migrateStoredBlocks(
      { blocks: input.blocks, clock: input.clock, state: input.target, models: input.models },
      prepared,
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
    readonly blocks?: BlockRegistry;
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
    events: configurationSyncAdvancesPublicState(prepared.plan)
      ? [
          siteBuildEvent({
            reason: "configuration_sync",
            requestedAt: appliedAt,
            requestedBy: "system:content-sync",
            publishedSnapshotId: null,
          }),
        ]
      : [],
    ...(prepared.referenceRevision === undefined
      ? {}
      : { expectedReferenceRevision: prepared.referenceRevision }),
    linkRewrites: await configurationSyncLinkRewrites({
      ...(input.blocks === undefined ? {} : { blocks: input.blocks }),
      storedModels: prepared.storedModels,
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

import type { ContentModelStructure, NormalizedContentModel } from "@lacecms/config";
import { canonicalizeJson, validateModelFields } from "@lacecms/content";
import type { JsonObject, JsonValue } from "@lacecms/content";
import {
  DomainError,
  actorId,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
} from "@lacecms/domain";
import type {
  Actor,
  ContentEntry,
  ContentEntryId,
  ContentModelKey,
  ContentModelRoute,
  ContentSnapshotId,
  UnixMilliseconds,
} from "@lacecms/domain";
import {
  CONFIGURATION_SYNC_SCAN_PAGE_SIZE,
  changeNeedsEvidence,
  createSnapshotEvidenceAccumulator,
  diffContentModelStructures,
  validateStructureHints,
} from "./configuration-evolution.js";
import type {
  ConfigurationSyncEvidence,
  ConfigurationSyncScanRequest,
  ConfigurationSyncSnapshotPage,
  ConfigurationSyncSnapshotReference,
  ModelSnapshotEvidence,
  SnapshotHolders,
  SnapshotStateCounts,
  StructuralChange,
  StructuralChangeClass,
  StructuralChangeKind,
} from "./configuration-evolution.js";
import type { Clock, IdGenerator } from "./index.js";

export * from "./configuration-evolution.js";

export interface StoredContentModelState {
  readonly draftSnapshotCount: number;
  readonly entryCount: number;
  readonly key: ContentModelKey;
  readonly kind: ContentModelRoute["kind"];
  readonly projectionHash: string;
  readonly publishedSnapshotCount: number;
  /**
   * Snapshot count, revision sum, update-time sum, and latest update time of
   * the model's snapshots; any content write changes it.
   */
  readonly snapshotFingerprint?: string;
  /** Valid structure baseline of the last successful sync, when one exists. */
  readonly structure?: ContentModelStructure;
  readonly structureHash: string;
  readonly version: number;
}

export interface ConfigurationSyncPlanInput {
  /** Snapshot scan results for models whose changes depend on stored data. */
  readonly evidence?: ConfigurationSyncEvidence;
  readonly models: readonly NormalizedContentModel[];
  readonly storedModels: readonly StoredContentModelState[];
}

export interface ConfigurationSyncModel {
  readonly key: ContentModelKey;
  readonly kind: ContentModelRoute["kind"];
  readonly projectionHash: string;
  readonly structureHash: string;
  readonly version: number;
}

/** One structural change as decided for a populated or empty model. */
export interface ConfigurationSyncChange {
  /** Snapshots holding the removed field, removed block type, or changed block. */
  readonly affected?: SnapshotStateCounts;
  /** Snapshots that receive the configured default. */
  readonly backfill?: SnapshotStateCounts;
  readonly class: StructuralChangeClass;
  /** Former field key of a renamed field. */
  readonly from?: string;
  /** Whether a destructive removal is declared by a hint. */
  readonly hinted?: true;
  readonly kind: StructuralChangeKind;
  readonly properties?: readonly string[];
  readonly scope: StructuralChange["scope"];
  readonly target: string;
  /** Stored values that do not satisfy a validated change. */
  readonly violations?: number;
}

/** Classified structural changes and planned content writes for one model. */
export interface ConfigurationSyncEvolution {
  /** Field keys whose configured defaults are written into snapshots lacking them. */
  readonly backfills: readonly string[];
  /** Hinted block types whose stored blocks are dropped; present when non-empty. */
  readonly blockRemovals?: readonly string[];
  readonly changes: readonly ConfigurationSyncChange[];
  /** Hinted field keys whose stored values are pruned; present when non-empty. */
  readonly fieldRemovals?: readonly string[];
  /** Hinted field renames whose stored values are moved; present when non-empty. */
  readonly renames?: readonly ConfigurationSyncFieldRename[];
  readonly snapshots: SnapshotStateCounts;
}

/** One field whose stored values move from a former key to the configured key. */
export interface ConfigurationSyncFieldRename {
  readonly from: string;
  readonly to: string;
}

/** One ordered content write of an applied evolution. */
export type ConfigurationSyncContentWrite =
  | { readonly action: "backfill-field"; readonly fieldKey: string; readonly json: string }
  | { readonly action: "remove-block-type"; readonly blockType: string }
  | { readonly action: "remove-field"; readonly fieldKey: string }
  | { readonly action: "rename-field"; readonly from: string; readonly to: string };

interface ConfigurationSyncModelOperation {
  readonly model: ConfigurationSyncModel;
}

export type ConfigurationSyncOperation =
  | (ConfigurationSyncModelOperation & { readonly action: "create" })
  | (ConfigurationSyncModelOperation & { readonly action: "label-update" })
  | (ConfigurationSyncModelOperation & { readonly action: "record-baseline" })
  | (ConfigurationSyncModelOperation & {
      readonly action: "version-update";
      readonly evolution?: ConfigurationSyncEvolution;
    })
  | (ConfigurationSyncModelOperation & { readonly action: "remove" })
  | (ConfigurationSyncModelOperation & {
      readonly action: "rename";
      readonly evolution?: ConfigurationSyncEvolution;
      readonly renamedFrom: ContentModelKey;
    })
  | (ConfigurationSyncModelOperation & {
      readonly action: "blocked-removal";
      readonly stored: StoredContentModelState;
    })
  | (ConfigurationSyncModelOperation & {
      readonly action: "incompatible-change";
      readonly evolution?: ConfigurationSyncEvolution;
      readonly stored: StoredContentModelState;
    });

export type ConfigurationSyncDiagnosticCode =
  | "BACKFILL_EXCEEDS_LIMIT"
  | "BLOCK_DEFINITION_CHANGE_HAS_BLOCKS"
  | "BLOCK_TYPE_REMOVAL_HAS_BLOCKS"
  | "CONSTRAINT_VIOLATED"
  | "DUPLICATE_CURRENT_MODEL"
  | "DUPLICATE_STORED_MODEL"
  | "FIELD_CHANGE_UNSUPPORTED"
  | "FIELD_REMOVAL_HAS_DATA"
  | "FIELD_RENAME_SOURCE_MISSING"
  | "FIELD_RENAME_TARGET_EXISTS"
  | "FIELD_RENAME_TARGET_HAS_DATA"
  | "FIELD_TYPE_CHANGED"
  | "MEDIA_DEFAULT_BACKFILL_UNSUPPORTED"
  | "MODEL_KIND_CHANGED"
  | "RENAME_KIND_CHANGED"
  | "RENAME_SOURCE_MISSING"
  | "RENAME_SOURCE_STILL_CONFIGURED"
  | "REMOVAL_HAS_ENTRIES"
  | "ROUTE_CHANGE_HAS_PUBLISHED"
  | "SNAPSHOT_EVIDENCE_STALE"
  | "STRUCTURE_BASELINE_MISSING"
  | "STRUCTURE_CHANGE_HAS_SNAPSHOTS"
  | "STRUCTURE_CHANGE_NEEDS_VERSION_BUMP"
  | "VERSION_REGRESSION";

export interface ConfigurationSyncDiagnostic {
  readonly affectedCount?: number;
  readonly blockType?: string;
  readonly changeClass?: StructuralChangeClass;
  readonly code: ConfigurationSyncDiagnosticCode;
  readonly fieldKey?: string;
  readonly message: string;
  readonly modelKey: ContentModelKey;
  readonly relatedModelKey?: ContentModelKey;
  /** Up to 20 affected snapshots, named by entry, state, and title. */
  readonly snapshots?: readonly ConfigurationSyncSnapshotReference[];
}

export interface ConfigurationSyncPlan {
  readonly diagnostics: readonly ConfigurationSyncDiagnostic[];
  readonly isValid: boolean;
  readonly operations: readonly ConfigurationSyncOperation[];
  readonly requiresApply: boolean;
}

export interface ConfigurationSyncCheckResult {
  readonly exitCode: 0 | 1;
  readonly plan: ConfigurationSyncPlan;
}

export interface ConfigurationSyncReport {
  readonly check: ConfigurationSyncCheckResult;
  readonly json: string;
  readonly text: string;
}

/** Bounded scan of one model's current draft and published snapshots. */
export interface ConfigurationSyncSnapshotScanInput {
  /** Continuation cursor returned by the previous page. */
  readonly after?: string;
  readonly limit: number;
  readonly modelKey: ContentModelKey;
}

/** Read-only persistence boundary used by dry-run and guarded apply coordination. */
export interface ConfigurationSyncStateReadPort {
  readConfigurationSyncSnapshots(
    input: ConfigurationSyncSnapshotScanInput,
  ): Promise<ConfigurationSyncSnapshotPage>;
  readConfigurationSyncState(): Promise<readonly StoredContentModelState[]>;
}

/** One pre-materialized singleton draft required by a page-model create operation. */
export interface ConfigurationSyncPageEntry {
  readonly entry: ContentEntry;
  readonly modelKey: ContentModelKey;
}

/** Complete guarded input for one atomic synchronization mutation. */
export interface ApplyConfigurationSynchronizationInput {
  readonly appliedAt: UnixMilliseconds;
  /** The scan evidence the plan was derived from; repositories re-plan with it. */
  readonly evidence: ConfigurationSyncEvidence;
  readonly expectedStoredModels: readonly StoredContentModelState[];
  readonly models: readonly NormalizedContentModel[];
  readonly pageEntries: readonly ConfigurationSyncPageEntry[];
  readonly plan: ConfigurationSyncPlan;
}

/** Portable result that distinguishes a committed apply from an unchanged no-op. */
export interface ApplyConfigurationSynchronizationResult {
  readonly operations: readonly ConfigurationSyncOperation[];
  readonly status: "applied" | "noop";
  readonly targetVersion?: number;
}

/** Specialized mutation boundary; it intentionally does not expose a transaction callback. */
export interface ConfigurationSyncApplyPort {
  applyConfigurationSynchronization(
    input: ApplyConfigurationSynchronizationInput,
  ): Promise<ApplyConfigurationSynchronizationResult>;
}

/** A dry-run result that preserves the exact persisted snapshot later guarded by apply. */
export interface PreparedConfigurationSynchronization {
  readonly evidence: ConfigurationSyncEvidence;
  readonly plan: ConfigurationSyncPlan;
  readonly report: ConfigurationSyncReport;
  readonly storedModels: readonly StoredContentModelState[];
}

export const contentSyncActor: Actor = Object.freeze({
  id: actorId("system:content-sync"),
  role: "admin",
});

function copyModel(model: NormalizedContentModel): ConfigurationSyncModel {
  return Object.freeze({
    key: contentModelKey(model.key),
    kind: model.kind,
    projectionHash: model.projectionHash,
    structureHash: model.structureHash,
    version: model.version,
  });
}

function copyStoredModel(model: StoredContentModelState): StoredContentModelState {
  return Object.freeze({
    draftSnapshotCount: model.draftSnapshotCount,
    entryCount: model.entryCount,
    key: contentModelKey(model.key),
    kind: model.kind,
    projectionHash: model.projectionHash,
    publishedSnapshotCount: model.publishedSnapshotCount,
    ...(model.snapshotFingerprint === undefined
      ? {}
      : { snapshotFingerprint: model.snapshotFingerprint }),
    ...(model.structure === undefined ? {} : { structure: model.structure }),
    structureHash: model.structureHash,
    version: model.version,
  });
}

/** JSON-safe stored state for reports; the baseline itself is reduced to its presence. */
function reportedStoredModel(model: StoredContentModelState): JsonObject {
  const { structure, ...rest } = model;
  return { ...rest, hasBaseline: structure !== undefined } as unknown as JsonObject;
}

interface DiagnosticDetails {
  readonly affectedCount?: number | undefined;
  readonly blockType?: string | undefined;
  readonly changeClass?: StructuralChangeClass | undefined;
  readonly fieldKey?: string | undefined;
  readonly relatedModelKey?: string | undefined;
  readonly snapshots?: readonly ConfigurationSyncSnapshotReference[] | undefined;
}

function diagnostic(
  code: ConfigurationSyncDiagnosticCode,
  modelKey: string,
  message: string,
  details: DiagnosticDetails | string = {},
): ConfigurationSyncDiagnostic {
  const values = typeof details === "string" ? { relatedModelKey: details } : details;
  return Object.freeze({
    ...(values.affectedCount === undefined ? {} : { affectedCount: values.affectedCount }),
    ...(values.blockType === undefined ? {} : { blockType: values.blockType }),
    ...(values.changeClass === undefined ? {} : { changeClass: values.changeClass }),
    code,
    ...(values.fieldKey === undefined ? {} : { fieldKey: values.fieldKey }),
    message,
    modelKey: contentModelKey(modelKey),
    ...(values.relatedModelKey === undefined
      ? {}
      : { relatedModelKey: contentModelKey(values.relatedModelKey) }),
    ...(values.snapshots === undefined ? {} : { snapshots: Object.freeze([...values.snapshots]) }),
  });
}

function compareByKey<Value extends { readonly key: string }>(left: Value, right: Value): number {
  return left.key.localeCompare(right.key);
}

function compareDiagnostics(
  left: ConfigurationSyncDiagnostic,
  right: ConfigurationSyncDiagnostic,
): number {
  return (
    left.modelKey.localeCompare(right.modelKey) ||
    left.code.localeCompare(right.code) ||
    (left.relatedModelKey ?? "").localeCompare(right.relatedModelKey ?? "") ||
    (left.fieldKey ?? "").localeCompare(right.fieldKey ?? "") ||
    (left.blockType ?? "").localeCompare(right.blockType ?? "")
  );
}

function hasSnapshots(model: StoredContentModelState): boolean {
  return model.draftSnapshotCount > 0 || model.publishedSnapshotCount > 0;
}

function snapshotDescription(model: StoredContentModelState): string {
  const states: string[] = [];
  if (model.draftSnapshotCount > 0) states.push(`draft=${model.draftSnapshotCount}`);
  if (model.publishedSnapshotCount > 0) states.push(`published=${model.publishedSnapshotCount}`);
  return states.join(", ");
}

function countsDescription(counts: SnapshotStateCounts): string {
  return `draft=${counts.draft}, published=${counts.published}`;
}

function total(counts: SnapshotStateCounts | undefined): number {
  return counts === undefined ? 0 : counts.draft + counts.published;
}

/** Draft and published counts of holder evidence, without the named snapshots. */
function holderCounts(holders: SnapshotHolders | undefined): SnapshotStateCounts | undefined {
  return holders === undefined
    ? undefined
    : Object.freeze({ draft: holders.draft, published: holders.published });
}

function incompatible(
  model: ConfigurationSyncModel,
  stored: StoredContentModelState,
  evolution?: ConfigurationSyncEvolution,
): ConfigurationSyncOperation {
  return Object.freeze({
    action: "incompatible-change",
    ...(evolution === undefined ? {} : { evolution }),
    model,
    stored,
  });
}

function undecidedChange(change: StructuralChange): ConfigurationSyncChange {
  return Object.freeze({
    class: change.class,
    ...(change.from === undefined ? {} : { from: change.from }),
    ...(change.hinted === undefined ? {} : { hinted: change.hinted }),
    kind: change.kind,
    ...(change.properties === undefined ? {} : { properties: change.properties }),
    scope: change.scope,
    target: change.target,
  });
}

/** Mutable planning context shared by the planner and the scan-request collector. */
interface PlanningContext {
  readonly diagnostics: ConfigurationSyncDiagnostic[];
  readonly evidence: ConfigurationSyncEvidence | undefined;
  readonly scanRequests: ConfigurationSyncScanRequest[];
}

interface DecidedEvolution {
  readonly evolution: ConfigurationSyncEvolution;
  readonly refused: boolean;
}

/**
 * Decides every structural change of a populated model from its stored
 * evidence, records refusals as diagnostics, and lists the planned backfills.
 */
function decideEvolution(
  current: NormalizedContentModel,
  stored: StoredContentModelState,
  changes: readonly StructuralChange[],
  context: PlanningContext,
): DecidedEvolution {
  const modelKey = current.key;
  const populated = hasSnapshots(stored);
  const storedCounts = Object.freeze({
    draft: stored.draftSnapshotCount,
    published: stored.publishedSnapshotCount,
  });
  if (!populated) {
    return {
      evolution: Object.freeze({
        backfills: Object.freeze([]),
        changes: Object.freeze(changes.map(undecidedChange)),
        snapshots: storedCounts,
      }),
      refused: false,
    };
  }

  let evidence: ModelSnapshotEvidence | undefined;
  if (changes.some(changeNeedsEvidence)) {
    const fingerprint = stored.snapshotFingerprint ?? "";
    context.scanRequests.push(
      Object.freeze({ changes, fields: current.fields, fingerprint, modelKey: stored.key }),
    );
    const candidate = context.evidence?.[stored.key];
    if (candidate === undefined || candidate.fingerprint !== fingerprint) {
      context.diagnostics.push(
        diagnostic(
          "SNAPSHOT_EVIDENCE_STALE",
          modelKey,
          `Model ${modelKey} needs a fresh scan of its stored snapshots; rerun synchronization.`,
        ),
      );
      return {
        evolution: Object.freeze({
          backfills: Object.freeze([]),
          changes: Object.freeze(changes.map(undecidedChange)),
          snapshots: storedCounts,
        }),
        refused: true,
      };
    }
    evidence = candidate;
  }

  let refused = false;
  const refuse = (
    code: ConfigurationSyncDiagnosticCode,
    message: string,
    details: DiagnosticDetails,
  ): void => {
    refused = true;
    context.diagnostics.push(diagnostic(code, modelKey, message, details));
  };
  const decided: ConfigurationSyncChange[] = [];
  const backfills: string[] = [];
  const renames: ConfigurationSyncFieldRename[] = [];
  const fieldRemovals: string[] = [];
  const blockRemovals: string[] = [];
  for (const change of changes) {
    const fieldKey = change.scope === "field" ? change.target : undefined;
    const blockType = change.scope === "block" ? change.target : undefined;
    let affected: SnapshotStateCounts | undefined;
    let backfill: SnapshotStateCounts | undefined;
    let violations: number | undefined;

    if (change.kind === "field-type-changed") {
      refuse(
        "FIELD_TYPE_CHANGED",
        `Model ${modelKey} changes the type of field ${change.target} while snapshots exist (${snapshotDescription(stored)}).`,
        { changeClass: change.class, fieldKey },
      );
    } else if (change.class === "breaking" && change.kind === "route-changed") {
      if (stored.publishedSnapshotCount > 0) {
        refuse(
          "ROUTE_CHANGE_HAS_PUBLISHED",
          `Model ${modelKey} changes its ${change.target} while ${stored.publishedSnapshotCount} entries are published.`,
          { affectedCount: stored.publishedSnapshotCount, changeClass: change.class },
        );
      }
    } else if (change.class === "breaking") {
      refuse(
        "FIELD_CHANGE_UNSUPPORTED",
        `Model ${modelKey} changes ${change.scope} ${change.target}${
          change.properties === undefined ? "" : ` (${change.properties.join(", ")})`
        } in a way synchronization cannot apply while snapshots exist.`,
        { changeClass: change.class, ...(fieldKey === undefined ? {} : { fieldKey }) },
      );
    } else if (change.kind === "field-renamed") {
      const occupied = evidence?.fieldHolders[change.target];
      affected = holderCounts(evidence?.fieldHolders[change.from ?? ""]);
      if (occupied !== undefined && total(occupied) > 0) {
        refuse(
          "FIELD_RENAME_TARGET_HAS_DATA",
          `Model ${modelKey} renames field ${change.from} to ${change.target}, but ${total(occupied)} snapshots already hold ${change.target} (${countsDescription(occupied)}).`,
          {
            affectedCount: total(occupied),
            changeClass: change.class,
            fieldKey,
            snapshots: occupied.snapshots,
          },
        );
      } else if (total(affected) > 0) {
        renames.push(Object.freeze({ from: change.from!, to: change.target }));
      }
    } else if (change.kind === "field-removed") {
      const holders = evidence?.fieldHolders[change.target];
      affected = holderCounts(holders);
      if (holders !== undefined && total(holders) > 0) {
        if (change.hinted === true) {
          fieldRemovals.push(change.target);
        } else {
          refuse(
            "FIELD_REMOVAL_HAS_DATA",
            `Model ${modelKey} removes field ${change.target}, which holds data in ${total(holders)} snapshots (${countsDescription(holders)}). Declare removedFields: ["${change.target}"] to prune it, or renamedFrom: "${change.target}" on the field that replaces it.`,
            {
              affectedCount: total(holders),
              changeClass: change.class,
              fieldKey,
              snapshots: holders.snapshots,
            },
          );
        }
      }
    } else if (change.kind === "block-type-removed" || change.kind === "block-definition-changed") {
      const holders = evidence?.blockHolders[change.target];
      affected = holderCounts(holders);
      if (holders !== undefined && total(holders) > 0) {
        const removal = change.kind === "block-type-removed";
        if (removal && change.hinted === true) {
          blockRemovals.push(change.target);
        } else {
          refuse(
            removal ? "BLOCK_TYPE_REMOVAL_HAS_BLOCKS" : "BLOCK_DEFINITION_CHANGE_HAS_BLOCKS",
            removal
              ? `Model ${modelKey} disallows block type ${change.target}, which ${total(holders)} snapshots use (${countsDescription(holders)}). Declare removedBlocks: ["${change.target}"] to drop those blocks.`
              : `Block type ${change.target} changes its definition while ${total(holders)} snapshots of model ${modelKey} hold such blocks (${countsDescription(holders)}); a block migration is required.`,
            {
              affectedCount: total(holders),
              blockType,
              changeClass: change.class,
              snapshots: holders.snapshots,
            },
          );
        }
      }
    } else if (change.class === "validated") {
      const findings = evidence?.violations[change.target];
      violations = findings?.count ?? 0;
      if (findings !== undefined && findings.count > 0) {
        refuse(
          "CONSTRAINT_VIOLATED",
          `Model ${modelKey} tightens field ${change.target} (${(change.properties ?? []).join(", ")}), but ${findings.count} stored snapshots do not satisfy it.`,
          {
            affectedCount: findings.count,
            changeClass: change.class,
            fieldKey,
            snapshots: findings.snapshots,
          },
        );
      }
    }

    if (change.backfill === true) {
      backfill = evidence?.backfills[change.target] ?? Object.freeze({ draft: 0, published: 0 });
      if (total(backfill) > 0) {
        if (current.fields[change.target]?.type === "media") {
          refuse(
            "MEDIA_DEFAULT_BACKFILL_UNSUPPORTED",
            `Model ${modelKey} declares a default for media field ${change.target}, which cannot be backfilled into ${total(backfill)} snapshots; remove the default or add the field without one.`,
            { affectedCount: total(backfill), changeClass: change.class, fieldKey },
          );
        } else {
          backfills.push(change.target);
        }
      }
    }
    decided.push(
      Object.freeze({
        ...(affected === undefined ? {} : { affected }),
        ...(backfill === undefined ? {} : { backfill }),
        class: change.class,
        ...(change.from === undefined ? {} : { from: change.from }),
        ...(change.hinted === undefined ? {} : { hinted: change.hinted }),
        kind: change.kind,
        ...(change.properties === undefined ? {} : { properties: change.properties }),
        scope: change.scope,
        target: change.target,
        ...(violations === undefined ? {} : { violations }),
      }),
    );
  }
  if (evidence !== undefined && evidence.oversized.count > 0) {
    refuse(
      "BACKFILL_EXCEEDS_LIMIT",
      `Model ${modelKey} field rewrites would push ${evidence.oversized.count} snapshots above the content size limit.`,
      { affectedCount: evidence.oversized.count, snapshots: evidence.oversized.snapshots },
    );
  }
  return {
    evolution: Object.freeze({
      backfills: Object.freeze(backfills.sort()),
      ...(blockRemovals.length === 0 ? {} : { blockRemovals: Object.freeze(blockRemovals.sort()) }),
      changes: Object.freeze(decided),
      ...(fieldRemovals.length === 0 ? {} : { fieldRemovals: Object.freeze(fieldRemovals.sort()) }),
      ...(renames.length === 0
        ? {}
        : {
            renames: Object.freeze(renames.sort((left, right) => left.to.localeCompare(right.to))),
          }),
      snapshots: evidence?.snapshots ?? storedCounts,
    }),
    refused,
  };
}

function classifyMatchedModel(
  current: NormalizedContentModel,
  stored: StoredContentModelState,
  context: PlanningContext,
): ConfigurationSyncOperation | undefined {
  const { diagnostics } = context;
  const model = copyModel(current);
  if (model.kind !== stored.kind) {
    diagnostics.push(
      diagnostic(
        "MODEL_KIND_CHANGED",
        model.key,
        `Model ${model.key} changes kind from ${stored.kind} to ${model.kind}.`,
      ),
    );
    return incompatible(model, stored);
  }
  if (model.version < stored.version) {
    diagnostics.push(
      diagnostic(
        "VERSION_REGRESSION",
        model.key,
        `Model ${model.key} regresses version from ${stored.version} to ${model.version}.`,
      ),
    );
    return incompatible(model, stored);
  }

  const hasBaseline = stored.structure !== undefined;
  const legacyMatch =
    !hasBaseline &&
    current.legacyStructureHash !== undefined &&
    current.legacyStructureHash === stored.structureHash;
  const structureChanged = model.structureHash !== stored.structureHash && !legacyMatch;
  if (structureChanged && model.version === stored.version) {
    diagnostics.push(
      diagnostic(
        "STRUCTURE_CHANGE_NEEDS_VERSION_BUMP",
        model.key,
        `Model ${model.key} changes structure without increasing version ${model.version}.`,
      ),
    );
    return incompatible(model, stored);
  }

  let evolution: ConfigurationSyncEvolution | undefined;
  if (structureChanged && hasBaseline && current.structure !== undefined) {
    const hints = {
      ...(current.removedBlocks === undefined ? {} : { removedBlocks: current.removedBlocks }),
      ...(current.removedFields === undefined ? {} : { removedFields: current.removedFields }),
      ...(current.renamedFields === undefined ? {} : { renamedFields: current.renamedFields }),
    };
    const issues = validateStructureHints(stored.structure!, hints);
    for (const issue of issues) {
      diagnostics.push(
        issue.kind === "target-exists"
          ? diagnostic(
              "FIELD_RENAME_TARGET_EXISTS",
              model.key,
              `Model ${model.key} renames field ${issue.from} to ${issue.target}, but the stored structure already has both fields.`,
              { fieldKey: issue.target },
            )
          : diagnostic(
              "FIELD_RENAME_SOURCE_MISSING",
              model.key,
              `Model ${model.key} renames field ${issue.from} to ${issue.target}, but the stored structure has neither field.`,
              { fieldKey: issue.target },
            ),
      );
    }
    if (issues.length > 0) return incompatible(model, stored);
    const decided = decideEvolution(
      current,
      stored,
      diffContentModelStructures(stored.structure!, current.structure, hints),
      context,
    );
    if (decided.refused) return incompatible(model, stored, decided.evolution);
    evolution = decided.evolution;
  } else if (structureChanged && hasSnapshots(stored)) {
    if (current.structure === undefined) {
      diagnostics.push(
        diagnostic(
          "STRUCTURE_CHANGE_HAS_SNAPSHOTS",
          model.key,
          `Model ${model.key} changes structure while snapshots exist (${snapshotDescription(stored)}).`,
        ),
      );
    } else {
      diagnostics.push(
        diagnostic(
          "STRUCTURE_BASELINE_MISSING",
          model.key,
          `Model ${model.key} changes structure while snapshots exist (${snapshotDescription(stored)}) and no structure baseline is stored. Restore the previous definition, run content sync once to record a baseline, then apply the change.`,
        ),
      );
    }
    return incompatible(model, stored);
  }

  if (structureChanged || model.version > stored.version) {
    return Object.freeze({
      action: "version-update",
      ...(evolution === undefined ? {} : { evolution }),
      model,
    });
  }
  if (model.projectionHash !== stored.projectionHash) {
    return Object.freeze({ action: "label-update", model });
  }
  if ((!hasBaseline || legacyMatch) && current.structure !== undefined) {
    return Object.freeze({ action: "record-baseline", model });
  }
  return undefined;
}

function modelForStoredState(stored: StoredContentModelState): ConfigurationSyncModel {
  return Object.freeze({
    key: stored.key,
    kind: stored.kind,
    projectionHash: stored.projectionHash,
    structureHash: stored.structureHash,
    version: stored.version,
  });
}

function operationKey(operation: ConfigurationSyncOperation): string {
  return operation.model.key;
}

function planWithContext(
  input: ConfigurationSyncPlanInput,
  context: PlanningContext,
): ConfigurationSyncPlan {
  const { diagnostics } = context;
  const operations: ConfigurationSyncOperation[] = [];
  const currentModels = [...input.models].sort(compareByKey);
  const storedModels = [...input.storedModels].map(copyStoredModel).sort(compareByKey);
  const currentKeys = new Set<string>();
  const duplicateCurrentKeys = new Set<string>();
  const storedByKey = new Map<string, StoredContentModelState>();
  const duplicateStoredKeys = new Set<string>();

  for (const model of currentModels) {
    if (currentKeys.has(model.key)) {
      duplicateCurrentKeys.add(model.key);
      diagnostics.push(
        diagnostic("DUPLICATE_CURRENT_MODEL", model.key, `Model ${model.key} is configured twice.`),
      );
    }
    currentKeys.add(model.key);
  }
  for (const stored of storedModels) {
    if (storedByKey.has(stored.key)) {
      duplicateStoredKeys.add(stored.key);
      diagnostics.push(
        diagnostic(
          "DUPLICATE_STORED_MODEL",
          stored.key,
          `Stored model ${stored.key} appears twice.`,
        ),
      );
      continue;
    }
    storedByKey.set(stored.key, stored);
  }

  const consumedStoredKeys = new Set<string>();
  for (const current of currentModels) {
    if (duplicateCurrentKeys.has(current.key)) continue;
    const model = copyModel(current);
    const stored = storedByKey.get(model.key);
    if (stored !== undefined && !duplicateStoredKeys.has(model.key)) {
      consumedStoredKeys.add(stored.key);
      const operation = classifyMatchedModel(current, stored, context);
      if (operation !== undefined) operations.push(operation);
      continue;
    }

    if (current.renamedFrom === undefined) {
      operations.push(Object.freeze({ action: "create", model }));
      continue;
    }

    const former = storedByKey.get(current.renamedFrom);
    if (former === undefined || duplicateStoredKeys.has(current.renamedFrom)) {
      diagnostics.push(
        diagnostic(
          "RENAME_SOURCE_MISSING",
          model.key,
          `Model ${model.key} names missing former model ${current.renamedFrom}.`,
          current.renamedFrom,
        ),
      );
      continue;
    }
    consumedStoredKeys.add(former.key);
    if (currentKeys.has(former.key)) {
      diagnostics.push(
        diagnostic(
          "RENAME_SOURCE_STILL_CONFIGURED",
          model.key,
          `Model ${model.key} names still-configured model ${former.key} as renamedFrom.`,
          former.key,
        ),
      );
      operations.push(incompatible(model, former));
      continue;
    }
    if (model.kind !== former.kind) {
      diagnostics.push(
        diagnostic(
          "RENAME_KIND_CHANGED",
          model.key,
          `Model ${model.key} changes renamed model ${former.key} from ${former.kind} to ${model.kind}.`,
          former.key,
        ),
      );
      operations.push(incompatible(model, former));
      continue;
    }
    const transition = classifyMatchedModel(current, former, context);
    if (transition?.action === "incompatible-change") {
      operations.push(transition);
      continue;
    }
    const evolution = transition?.action === "version-update" ? transition.evolution : undefined;
    operations.push(
      Object.freeze({
        action: "rename",
        ...(evolution === undefined ? {} : { evolution }),
        model,
        renamedFrom: former.key,
      }),
    );
  }

  for (const stored of storedModels) {
    if (consumedStoredKeys.has(stored.key) || duplicateStoredKeys.has(stored.key)) continue;
    const model = modelForStoredState(stored);
    if (stored.entryCount === 0) {
      operations.push(Object.freeze({ action: "remove", model }));
      continue;
    }
    diagnostics.push(
      diagnostic(
        "REMOVAL_HAS_ENTRIES",
        stored.key,
        `Model ${stored.key} cannot be removed while it has ${stored.entryCount} entries.`,
      ),
    );
    operations.push(Object.freeze({ action: "blocked-removal", model, stored }));
  }

  operations.sort((left, right) => operationKey(left).localeCompare(operationKey(right)));
  diagnostics.sort(compareDiagnostics);
  const frozenOperations = Object.freeze(operations.map((operation) => Object.freeze(operation)));
  const frozenDiagnostics = Object.freeze(diagnostics.map((value) => Object.freeze(value)));
  const isValid = frozenDiagnostics.length === 0;
  return Object.freeze({
    diagnostics: frozenDiagnostics,
    isValid,
    operations: frozenOperations,
    requiresApply: isValid && frozenOperations.length > 0,
  });
}

/** Plans configuration identity reconciliation without reading or mutating a runtime adapter. */
export function planConfigurationSynchronization(
  input: ConfigurationSyncPlanInput,
): ConfigurationSyncPlan {
  return planWithContext(input, { diagnostics: [], evidence: input.evidence, scanRequests: [] });
}

/** Lists the populated models whose structural changes must be decided from stored snapshots. */
export function planConfigurationSyncScans(
  input: Omit<ConfigurationSyncPlanInput, "evidence">,
): readonly ConfigurationSyncScanRequest[] {
  const context: PlanningContext = { diagnostics: [], evidence: undefined, scanRequests: [] };
  planWithContext(input, context);
  return Object.freeze(
    [...context.scanRequests].sort((left, right) => left.modelKey.localeCompare(right.modelKey)),
  );
}

/** Field defaults an applied operation writes into snapshots lacking the field. */
export function configurationSyncBackfills(
  operation: ConfigurationSyncOperation,
  model: NormalizedContentModel,
): readonly { readonly fieldKey: string; readonly json: string }[] {
  if (operation.action !== "version-update" && operation.action !== "rename") return [];
  return (operation.evolution?.backfills ?? []).map((fieldKey) => {
    const definition = model.fields[fieldKey];
    if (definition?.defaultValue === undefined) {
      throw new DomainError(
        "CONTENT_INVALID_STATE",
        `Backfill field ${fieldKey} has no configured default.`,
      );
    }
    return Object.freeze({
      fieldKey,
      json: canonicalizeJson(definition.defaultValue as JsonValue),
    });
  });
}

/**
 * Ordered content writes of an applied operation: field renames, field
 * removals, block-type removals, then default backfills.
 */
export function configurationSyncContentWrites(
  operation: ConfigurationSyncOperation,
  model: NormalizedContentModel,
): readonly ConfigurationSyncContentWrite[] {
  if (operation.action !== "version-update" && operation.action !== "rename") return [];
  const evolution = operation.evolution;
  if (evolution === undefined) return [];
  return Object.freeze([
    ...(evolution.renames ?? []).map((rename) =>
      Object.freeze({ action: "rename-field" as const, from: rename.from, to: rename.to }),
    ),
    ...(evolution.fieldRemovals ?? []).map((fieldKey) =>
      Object.freeze({ action: "remove-field" as const, fieldKey }),
    ),
    ...(evolution.blockRemovals ?? []).map((blockType) =>
      Object.freeze({ action: "remove-block-type" as const, blockType }),
    ),
    ...configurationSyncBackfills(operation, model).map((backfill) =>
      Object.freeze({ action: "backfill-field" as const, ...backfill }),
    ),
  ]);
}

/** Canonical baseline JSON an applied model write stores, or null without a structure. */
export function configurationSyncBaseline(model: NormalizedContentModel): {
  readonly hash: string | null;
  readonly json: string | null;
} {
  return model.structure === undefined
    ? { hash: null, json: null }
    : { hash: model.structureHash, json: canonicalizeJson(model.structure) };
}

/** Whether applying a plan changes public projections or published content. */
export function configurationSyncAdvancesPublicState(plan: ConfigurationSyncPlan): boolean {
  return plan.operations.some((operation) => operation.action !== "record-baseline");
}

export function checkConfigurationSynchronization(
  plan: ConfigurationSyncPlan,
): ConfigurationSyncCheckResult {
  return Object.freeze({ exitCode: plan.isValid && !plan.requiresApply ? 0 : 1, plan });
}

function reportedOperation(operation: ConfigurationSyncOperation): JsonObject {
  if (operation.action !== "incompatible-change" && operation.action !== "blocked-removal") {
    return operation as unknown as JsonObject;
  }
  return { ...operation, stored: reportedStoredModel(operation.stored) } as unknown as JsonObject;
}

export function renderConfigurationSyncPlanJson(plan: ConfigurationSyncPlan): string {
  return JSON.stringify({ ...plan, operations: plan.operations.map(reportedOperation) });
}

function changeLine(change: ConfigurationSyncChange): string {
  const details: string[] = [];
  if (change.from !== undefined) details.push(`from ${change.from}`);
  if (change.hinted === true) details.push("hinted");
  if (change.properties !== undefined) details.push(change.properties.join(", "));
  if (change.affected !== undefined)
    details.push(`affected: ${countsDescription(change.affected)}`);
  if (change.violations !== undefined) details.push(`violations: ${change.violations}`);
  if (change.backfill !== undefined)
    details.push(`backfill: ${countsDescription(change.backfill)}`);
  const suffix = details.length === 0 ? "" : ` (${details.join("; ")})`;
  return `    ${change.class} ${change.kind} ${change.scope} ${change.target}${suffix}`;
}

export function renderConfigurationSyncPlanText(plan: ConfigurationSyncPlan): string {
  const lines = [
    `Configuration synchronization: ${plan.isValid ? "valid" : "invalid"}`,
    `Apply required: ${plan.requiresApply ? "yes" : "no"}`,
    "Operations:",
  ];
  if (plan.operations.length === 0) lines.push("- none");
  for (const operation of plan.operations) {
    const rename = operation.action === "rename" ? ` from ${operation.renamedFrom}` : "";
    lines.push(`- ${operation.action} ${operation.model.key}${rename}`);
    const evolution =
      operation.action === "version-update" ||
      operation.action === "rename" ||
      operation.action === "incompatible-change"
        ? operation.evolution
        : undefined;
    if (evolution === undefined) continue;
    lines.push(`  snapshots: ${countsDescription(evolution.snapshots)}`);
    for (const change of evolution.changes) lines.push(changeLine(change));
    if (evolution.renames !== undefined) {
      const renames = evolution.renames.map((rename) => `${rename.from} -> ${rename.to}`);
      lines.push(`  planned renames: ${renames.join(", ")}`);
    }
    if (evolution.fieldRemovals !== undefined) {
      lines.push(`  planned field removals: ${evolution.fieldRemovals.join(", ")}`);
    }
    if (evolution.blockRemovals !== undefined) {
      lines.push(`  planned block removals: ${evolution.blockRemovals.join(", ")}`);
    }
    if (evolution.backfills.length > 0) {
      lines.push(`  planned backfills: ${evolution.backfills.join(", ")}`);
    }
  }
  lines.push("Diagnostics:");
  if (plan.diagnostics.length === 0) lines.push("- none");
  for (const value of plan.diagnostics) {
    const related = value.relatedModelKey === undefined ? "" : ` (${value.relatedModelKey})`;
    lines.push(`- [${value.code}] ${value.modelKey}${related}: ${value.message}`);
    for (const snapshot of value.snapshots ?? []) {
      lines.push(`    ${snapshot.state} ${snapshot.entryId} "${snapshot.title}"`);
    }
    if (
      value.snapshots !== undefined &&
      value.affectedCount !== undefined &&
      value.affectedCount > value.snapshots.length
    ) {
      lines.push(`    … and ${value.affectedCount - value.snapshots.length} more`);
    }
  }
  return lines.join("\n");
}

export function reportConfigurationSynchronization(
  plan: ConfigurationSyncPlan,
): ConfigurationSyncReport {
  return Object.freeze({
    check: checkConfigurationSynchronization(plan),
    json: renderConfigurationSyncPlanJson(plan),
    text: renderConfigurationSyncPlanText(plan),
  });
}

/** Scans one model's snapshots page by page through the read port. */
async function scanModel(
  state: ConfigurationSyncStateReadPort,
  request: ConfigurationSyncScanRequest,
): Promise<ModelSnapshotEvidence> {
  const accumulator = createSnapshotEvidenceAccumulator(request);
  let after: string | undefined;
  do {
    const page = await state.readConfigurationSyncSnapshots({
      ...(after === undefined ? {} : { after }),
      limit: CONFIGURATION_SYNC_SCAN_PAGE_SIZE,
      modelKey: contentModelKey(request.modelKey),
    });
    accumulator.add(page.items);
    after = page.next;
  } while (after !== undefined);
  return accumulator.result();
}

/** Reads persistence once, scans data-dependent models, and produces the non-mutating decision. */
export async function prepareConfigurationSynchronization(input: {
  readonly models: readonly NormalizedContentModel[];
  readonly state: ConfigurationSyncStateReadPort;
}): Promise<PreparedConfigurationSynchronization> {
  const storedModels = Object.freeze(
    (await input.state.readConfigurationSyncState()).map(copyStoredModel).sort(compareByKey),
  );
  const evidence: Record<string, ModelSnapshotEvidence> = {};
  for (const request of planConfigurationSyncScans({ models: input.models, storedModels })) {
    evidence[request.modelKey] = await scanModel(input.state, request);
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

/** Creates the one incomplete draft that a newly synchronized page must own. */
export function createConfigurationSyncPageEntry(input: {
  readonly appliedAt: UnixMilliseconds;
  readonly entryId: ContentEntryId | string;
  readonly model: NormalizedContentModel;
  readonly snapshotId: ContentSnapshotId | string;
}): ConfigurationSyncPageEntry {
  if (input.model.kind !== "page") {
    throw new DomainError(
      "CONTENT_INVALID_STATE",
      "Only page models receive synchronized entries.",
    );
  }
  const entryId = contentEntryId(input.entryId);
  const snapshotId = contentSnapshotId(input.snapshotId);
  const model: ContentModelRoute = Object.freeze({
    key: contentModelKey(input.model.key),
    kind: "page",
    path: input.model.path,
  });
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

/** Applies a freshly prepared valid plan and allocates identities only for page creates. */
export async function applyPreparedConfigurationSynchronization(input: {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly models: readonly NormalizedContentModel[];
  readonly prepared: PreparedConfigurationSynchronization;
  readonly target: ConfigurationSyncApplyPort;
}): Promise<ApplyConfigurationSynchronizationResult> {
  if (!input.prepared.plan.isValid) {
    throw new DomainError(
      "CONTENT_INVALID_STATE",
      "Configuration synchronization plan is invalid.",
    );
  }
  const models = new Map(input.models.map((model) => [model.key, model]));
  const appliedAt = input.clock.now();
  const pageEntries: ConfigurationSyncPageEntry[] = [];
  for (const operation of input.prepared.plan.operations) {
    if (operation.action !== "create") continue;
    const model = models.get(operation.model.key);
    if (model?.kind !== "page") continue;
    pageEntries.push(
      createConfigurationSyncPageEntry({
        appliedAt,
        entryId: input.ids.next(),
        model,
        snapshotId: input.ids.next(),
      }),
    );
  }
  return input.target.applyConfigurationSynchronization({
    appliedAt,
    evidence: input.prepared.evidence,
    expectedStoredModels: input.prepared.storedModels,
    models: input.models,
    pageEntries,
    plan: input.prepared.plan,
  });
}

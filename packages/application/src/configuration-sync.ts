import type { ContentModelStructure, NormalizedContentModel } from "@lacecms/config";
import { configurationSyncLinkRewrites } from "./configuration-links.js";
import {
  canonicalizeJson,
  schemaFieldAt,
  parseSchemaPath,
  validateModelFields,
} from "@lacecms/content";
import type { BlockDefinition, BlockRegistry, JsonObject, JsonValue } from "@lacecms/content";
import {
  DomainError,
  actorId,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  isSingletonKind,
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
  ConfigurationSyncSnapshot,
  ConfigurationSyncSnapshotPage,
  ConfigurationSyncSnapshotReference,
  ModelSnapshotEvidence,
  SnapshotHolders,
  SnapshotStateCounts,
  StructuralChange,
  StructuralChangeClass,
  StructuralChangeKind,
} from "./configuration-evolution.js";
import {
  CONFIGURATION_SYNC_MIGRATION_PAGE_SIZE,
  createMigrationEvidenceAccumulator,
  planEntryMigration,
} from "./configuration-migration.js";
import type {
  BlockMigrationEvidence,
  ConfigurationSyncEntryMigration,
  ConfigurationSyncMigrationPage,
  ConfigurationSyncMigrationTarget,
} from "./configuration-migration.js";
import type { Clock, IdGenerator } from "./index.js";

export * from "./configuration-evolution.js";
export * from "./configuration-migration.js";

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
  /** Stored block versions migrated to the configured version, for a planned block migration. */
  readonly migration?: { readonly from: readonly number[]; readonly to: number };
  readonly properties?: readonly string[];
  readonly scope: StructuralChange["scope"];
  readonly target: string;
  readonly schemaPath?: string;
  /** Stored values that do not satisfy a validated change. */
  readonly violations?: number;
}

/** Classified structural changes and planned content writes for one model. */
export interface ConfigurationSyncEvolution {
  /** Field keys whose configured defaults are written into snapshots lacking them. */
  readonly backfills: readonly string[];
  readonly recursiveFields?: true;
  /** Hinted block types whose stored blocks are dropped; present when non-empty. */
  readonly blockRemovals?: readonly string[];
  readonly changes: readonly ConfigurationSyncChange[];
  /** Hinted field keys whose stored values are pruned; present when non-empty. */
  readonly fieldRemovals?: readonly string[];
  /** Block types whose stale stored blocks are migrated; present when non-empty. */
  readonly migrations?: readonly ConfigurationSyncBlockMigration[];
  /** Hinted field renames whose stored values are moved; present when non-empty. */
  readonly renames?: readonly ConfigurationSyncFieldRename[];
  /** Whether hinted SEO removal clears stored SEO groups; present when true. */
  readonly seoRemoval?: true;
  readonly snapshots: SnapshotStateCounts;
}

/** Stale blocks of one type that apply migrates to the configured block version. */
export interface ConfigurationSyncBlockMigration extends SnapshotStateCounts {
  readonly blockType: string;
  readonly blocks: number;
  readonly fromVersions: readonly number[];
  readonly toVersion: number;
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
  | { readonly action: "remove-seo" }
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
  | "BLOCK_MIGRATION_FAILED"
  | "BLOCK_MIGRATION_INVALID"
  | "BLOCK_MIGRATION_MISSING"
  | "BLOCK_TYPE_REMOVAL_HAS_BLOCKS"
  | "BLOCK_VERSION_AHEAD"
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
  | "SEO_REMOVAL_HAS_DATA"
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
  readonly schemaPath?: string;
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

/** Bounded scan of one model's entries holding stale blocks of the target types. */
export interface ConfigurationSyncMigrationScanInput {
  /** Continuation cursor returned by the previous page. */
  readonly after?: string;
  readonly limit: number;
  readonly modelKey: ContentModelKey;
  readonly targets: readonly ConfigurationSyncMigrationTarget[];
}

/** Read-only persistence boundary used by dry-run and guarded apply coordination. */
export interface ConfigurationSyncStateReadPort {
  readConfigurationSyncMigrationEntries(
    input: ConfigurationSyncMigrationScanInput,
  ): Promise<ConfigurationSyncMigrationPage>;
  readConfigurationSyncSnapshots(
    input: ConfigurationSyncSnapshotScanInput,
  ): Promise<ConfigurationSyncSnapshotPage>;
  readConfigurationSyncState(): Promise<readonly StoredContentModelState[]>;
}

/** One pre-materialized singleton draft required by a page or global create operation. */
export interface ConfigurationSyncSingletonEntry {
  readonly entry: ContentEntry;
  readonly modelKey: ContentModelKey;
}

/** Complete guarded input for one atomic synchronization mutation. */
export interface ApplyConfigurationSynchronizationInput {
  readonly linkRewrites?: readonly import("./configuration-links.js").ConfigurationSyncLinkRewrite[];
  readonly appliedAt: UnixMilliseconds;
  /** The scan evidence the plan was derived from; repositories re-plan with it. */
  readonly evidence: ConfigurationSyncEvidence;
  readonly expectedStoredModels: readonly StoredContentModelState[];
  readonly models: readonly NormalizedContentModel[];
  readonly singletonEntries: readonly ConfigurationSyncSingletonEntry[];
  readonly plan: ConfigurationSyncPlan;
}

/** Drafts, published snapshots and blocks rewritten by block migrations. */
export interface ConfigurationSyncMigrationCounts {
  readonly blocks: number;
  readonly drafts: number;
  readonly published: number;
}

/** Portable result that distinguishes a committed apply from an unchanged no-op. */
export interface ApplyConfigurationSynchronizationResult {
  /** Present when the apply migrated stored blocks before its final mutation. */
  readonly migrated?: ConfigurationSyncMigrationCounts;
  readonly operations: readonly ConfigurationSyncOperation[];
  readonly status: "applied" | "noop";
  readonly targetVersion?: number;
}

/** Guarded per-entry block-migration writes of one model. */
export interface ApplyConfigurationSyncBlockMigrationsInput {
  readonly migratedAt: UnixMilliseconds;
  readonly modelKey: ContentModelKey;
  readonly units: readonly ConfigurationSyncEntryMigration[];
}

/** Specialized mutation boundary; it intentionally does not expose a transaction callback. */
export interface ConfigurationSyncApplyPort {
  /**
   * Writes each unit atomically per snapshot, published before draft, and
   * throws a stale-plan error on the first failed guard; earlier units stay.
   */
  applyConfigurationSyncBlockMigrations(
    input: ApplyConfigurationSyncBlockMigrationsInput,
  ): Promise<ConfigurationSyncMigrationCounts>;
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
    ...(values.fieldKey === undefined
      ? {}
      : {
          fieldKey: values.fieldKey,
          ...(values.fieldKey.startsWith("/") ? { schemaPath: values.fieldKey } : {}),
        }),
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
    ...(change.scope === "field" && change.target.startsWith("/")
      ? { schemaPath: change.target }
      : {}),
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
    const migrations = changes
      .filter((change) => versionedBlockChange(change))
      .map((change) => Object.freeze({ type: change.target, version: change.version!.to }));
    context.scanRequests.push(
      Object.freeze({
        changes,
        blockFields: Object.fromEntries(
          ((current.structure?.blockDefinitions ?? []) as readonly JsonObject[]).map((block) => [
            block.type as string,
            block.fields as unknown as typeof current.fields,
          ]),
        ),
        storedFields: stored.structure?.fields as unknown as typeof current.fields,
        fields: current.fields,
        fingerprint,
        ...(migrations.length === 0 ? {} : { migrations: Object.freeze(migrations) }),
        modelKey: stored.key,
      }),
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
  const blockMigrations: ConfigurationSyncBlockMigration[] = [];
  let seoRemoval = false;
  for (const change of changes) {
    const fieldKey = change.scope === "field" ? change.target : undefined;
    const blockType = change.scope === "block" ? change.target : undefined;
    let affected: SnapshotStateCounts | undefined;
    let backfill: SnapshotStateCounts | undefined;
    let violations: number | undefined;
    let migration: ConfigurationSyncChange["migration"];

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
    } else if (change.kind === "seo-disabled") {
      const holders = evidence?.seoHolders;
      affected = holderCounts(holders);
      if (holders !== undefined && total(holders) > 0) {
        if (change.hinted === true) {
          seoRemoval = true;
        } else {
          refuse(
            "SEO_REMOVAL_HAS_DATA",
            `Model ${modelKey} disables seo while ${total(holders)} snapshots hold SEO values (${countsDescription(holders)}). Declare removedSeo: true to prune them.`,
            {
              affectedCount: total(holders),
              changeClass: change.class,
              snapshots: holders.snapshots,
            },
          );
        }
      }
    } else if (change.kind === "block-type-removed") {
      const holders = evidence?.blockHolders[change.target];
      affected = holderCounts(holders);
      if (holders !== undefined && total(holders) > 0) {
        if (change.hinted === true) {
          blockRemovals.push(change.target);
        } else {
          refuse(
            "BLOCK_TYPE_REMOVAL_HAS_BLOCKS",
            `Model ${modelKey} disallows block type ${change.target}, which ${total(holders)} snapshots use (${countsDescription(holders)}). Declare removedBlocks: ["${change.target}"] to drop those blocks.`,
            {
              affectedCount: total(holders),
              blockType,
              changeClass: change.class,
              snapshots: holders.snapshots,
            },
          );
        }
      }
    } else if (change.kind === "block-definition-changed") {
      const holders = evidence?.blockHolders[change.target];
      affected = holderCounts(holders);
      if (!versionedBlockChange(change)) {
        if (holders !== undefined && total(holders) > 0) {
          refuse(
            "BLOCK_DEFINITION_CHANGE_HAS_BLOCKS",
            `Block type ${change.target} changes its definition without a version increase while ${total(holders)} snapshots of model ${modelKey} hold such blocks (${countsDescription(holders)}). Increase the block version and declare migrations.`,
            {
              affectedCount: total(holders),
              blockType,
              changeClass: change.class,
              snapshots: holders.snapshots,
            },
          );
        }
      } else {
        const facts = evidence?.migrations?.[change.target];
        const decision =
          facts === undefined
            ? { planned: false, refusals: [] }
            : decideBlockMigration(modelKey, change.target, facts);
        for (const refusal of decision.refusals) {
          refuse(refusal.code, refusal.message, {
            affectedCount: refusal.findings.count,
            blockType,
            changeClass: change.class,
            snapshots: refusal.findings.snapshots,
          });
        }
        if (decision.planned && facts !== undefined) {
          migration = Object.freeze({ from: facts.fromVersions, to: facts.toVersion });
          blockMigrations.push(
            Object.freeze({
              blockType: change.target,
              blocks: facts.blocks,
              draft: facts.snapshots.draft,
              fromVersions: facts.fromVersions,
              published: facts.snapshots.published,
              toVersion: facts.toVersion,
            }),
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
        const invalidDefault = evidence?.violations[change.target];
        if (
          change.class !== "validated" &&
          invalidDefault !== undefined &&
          invalidDefault.count > 0
        )
          refuse(
            "CONSTRAINT_VIOLATED",
            `Model ${modelKey} default for ${change.target} is invalid for stored snapshots.`,
            {
              affectedCount: invalidDefault.count,
              changeClass: change.class,
              fieldKey,
              snapshots: invalidDefault.snapshots,
            },
          );
        if (
          current.fields[change.target]?.type === "media" ||
          (evidence?.mediaBackfills?.[change.target]?.count ?? 0) > 0
        ) {
          refuse(
            "MEDIA_DEFAULT_BACKFILL_UNSUPPORTED",
            `Model ${modelKey} declares a default for media field ${change.target}, which cannot be backfilled into ${total(backfill)} snapshots; remove the default or add the field without one.`,
            {
              affectedCount: total(backfill),
              changeClass: change.class,
              fieldKey,
              ...(evidence?.mediaBackfills?.[change.target] === undefined ||
              (current.fields[change.target]?.type === "media" && !change.target.startsWith("/"))
                ? {}
                : { snapshots: evidence.mediaBackfills[change.target]!.snapshots }),
            },
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
        ...(migration === undefined ? {} : { migration }),
        ...(change.properties === undefined ? {} : { properties: change.properties }),
        scope: change.scope,
        target: change.target,
        ...(change.scope === "field" && change.target.startsWith("/")
          ? { schemaPath: change.target }
          : {}),
        ...(violations === undefined ? {} : { violations }),
      }),
    );
  }
  if (evidence !== undefined && evidence.oversized.count > 0) {
    refuse(
      "BACKFILL_EXCEEDS_LIMIT",
      `Model ${modelKey} field rewrites would push ${evidence.oversized.count} snapshots above the content size, list-element or media-reference limit.`,
      {
        affectedCount: evidence.oversized.count,
        snapshots: evidence.oversized.snapshots,
        fieldKey: changes.find(
          (change) => change.scope === "field" && change.target.startsWith("/"),
        )?.target,
      },
    );
  }
  return {
    evolution: Object.freeze({
      backfills: Object.freeze(backfills.sort()),
      ...([
        ...Object.values(current.fields),
        ...Object.values((stored.structure?.fields ?? {}) as unknown as typeof current.fields),
      ].some((field) => field.type === "group" || field.type === "list")
        ? { recursiveFields: true as const }
        : {}),
      ...(blockRemovals.length === 0 ? {} : { blockRemovals: Object.freeze(blockRemovals.sort()) }),
      changes: Object.freeze(decided),
      ...(fieldRemovals.length === 0 ? {} : { fieldRemovals: Object.freeze(fieldRemovals.sort()) }),
      ...(blockMigrations.length === 0
        ? {}
        : {
            migrations: Object.freeze(
              blockMigrations.sort((left, right) => left.blockType.localeCompare(right.blockType)),
            ),
          }),
      ...(renames.length === 0
        ? {}
        : {
            renames: Object.freeze(renames.sort((left, right) => left.to.localeCompare(right.to))),
          }),
      ...(seoRemoval ? { seoRemoval: true as const } : {}),
      snapshots: evidence?.snapshots ?? storedCounts,
    }),
    refused,
  };
}

/** Whether a block definition change also changes the block version. */
function versionedBlockChange(change: StructuralChange): boolean {
  return (
    change.kind === "block-definition-changed" &&
    change.version !== undefined &&
    change.version.from !== change.version.to
  );
}

interface BlockMigrationRefusal {
  readonly code: ConfigurationSyncDiagnosticCode;
  readonly findings: BlockMigrationEvidence["failed"];
  readonly message: string;
}

/** Refuses a block migration on any finding; otherwise plans it when blocks are stale. */
function decideBlockMigration(
  modelKey: string,
  blockType: string,
  facts: BlockMigrationEvidence,
): { readonly planned: boolean; readonly refusals: readonly BlockMigrationRefusal[] } {
  const to = facts.toVersion;
  const groups: readonly [
    "ahead" | "failed" | "invalid" | "missing",
    ConfigurationSyncDiagnosticCode,
    string,
  ][] = [
    [
      "missing",
      "BLOCK_MIGRATION_MISSING",
      `Block type ${blockType} of model ${modelKey} has ${facts.missing.count} stored blocks without a migration path to version ${to}; declare migrations for every version after the oldest stored one.`,
    ],
    [
      "ahead",
      "BLOCK_VERSION_AHEAD",
      `Block type ${blockType} of model ${modelKey} has ${facts.ahead.count} stored blocks newer than the configured version ${to}.`,
    ],
    [
      "failed",
      "BLOCK_MIGRATION_FAILED",
      `Block type ${blockType} migration to version ${to} failed for ${facts.failed.count} stored blocks of model ${modelKey}.`,
    ],
    [
      "invalid",
      "BLOCK_MIGRATION_INVALID",
      `Block type ${blockType} migration to version ${to} produced ${facts.invalid.count} invalid blocks in model ${modelKey}.`,
    ],
  ];
  const refusals: BlockMigrationRefusal[] = [];
  for (const [key, code, message] of groups) {
    const findings = facts[key];
    if (findings.count > 0) refusals.push({ code, findings, message });
  }
  return { planned: refusals.length === 0 && facts.blocks > 0, refusals };
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
      ...(current.kind !== "global" && current.removedSeo === true ? { removedSeo: true } : {}),
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
    const definition = schemaFieldAt(model.fields, parseSchemaPath(fieldKey));
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
 * removals, block-type removals, SEO removal, then default backfills.
 */
export function configurationSyncContentWrites(
  operation: ConfigurationSyncOperation,
  model: NormalizedContentModel,
): readonly ConfigurationSyncContentWrite[] {
  if (operation.action !== "version-update" && operation.action !== "rename") return [];
  const evolution = operation.evolution;
  if (evolution === undefined) return [];
  return Object.freeze([
    ...(evolution.recursiveFields ? [] : (evolution.renames ?? [])).map((rename) =>
      Object.freeze({ action: "rename-field" as const, from: rename.from, to: rename.to }),
    ),
    ...(evolution.recursiveFields ? [] : (evolution.fieldRemovals ?? [])).map((fieldKey) =>
      Object.freeze({ action: "remove-field" as const, fieldKey }),
    ),
    ...(evolution.blockRemovals ?? []).map((blockType) =>
      Object.freeze({ action: "remove-block-type" as const, blockType }),
    ),
    ...(evolution.seoRemoval === true ? [Object.freeze({ action: "remove-seo" as const })] : []),
    ...(evolution.recursiveFields ? [] : configurationSyncBackfills(operation, model)).map(
      (backfill) => Object.freeze({ action: "backfill-field" as const, ...backfill }),
    ),
  ]);
}

/** Exact prepared model-field replacement, independent of SQL and executable migrations. */
export interface ConfigurationSyncSnapshotRewrite {
  readonly id: string;
  readonly fields: JsonObject;
  readonly references: readonly { readonly fieldPath: string; readonly mediaId: string }[];
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
  if (change.migration !== undefined)
    details.push(`version ${change.migration.from.join(",")} -> ${change.migration.to}`);
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
    if (evolution.seoRemoval === true) lines.push("  planned SEO removal: all snapshots");
    if (evolution.migrations !== undefined) {
      const migrations = evolution.migrations.map(
        (migration) =>
          `${migration.blockType} ${migration.fromVersions.join(",")} -> ${migration.toVersion} (draft=${migration.draft}, published=${migration.published}, blocks=${migration.blocks})`,
      );
      lines.push(`  planned block migrations: ${migrations.join(", ")}`);
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
      const block =
        snapshot.blockKey === undefined
          ? ""
          : ` block ${snapshot.blockKey}${snapshot.schemaVersion === undefined ? "" : ` v${snapshot.schemaVersion}`}`;
      const at = snapshot.path === undefined || snapshot.path === "" ? "" : ` at ${snapshot.path}`;
      const cause = snapshot.reason === undefined ? "" : `: ${snapshot.reason}`;
      lines.push(
        `    ${snapshot.state} ${snapshot.entryId} "${snapshot.title}"${block}${at}${cause}`,
      );
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
  throw new DomainError("CONTENT_INVALID_STATE", message);
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

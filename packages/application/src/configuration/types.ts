import type { ContentModelStructure, NormalizedContentModel } from "@lacecms/config";
import type {
  FieldDefinition,
  FieldVisibility,
  FieldVisibilityRule,
  JsonObject,
  InternalLinkReference,
} from "@lacecms/content";
import type {
  ContentEntry,
  ContentModelKey,
  ContentModelRoute,
  UnixMilliseconds,
} from "@lacecms/domain";

/** How a structural difference affects existing content. */
export type StructuralChangeClass =
  | "breaking"
  | "compatible"
  | "destructive"
  | "display"
  | "migration"
  | "validated";

/** The kind of structural difference between a baseline and a configured model. */
export type StructuralChangeKind =
  | "block-allowlist-reordered"
  | "block-definition-changed"
  | "block-type-allowed"
  | "block-type-removed"
  | "field-added"
  | "field-changed"
  | "field-options-reordered"
  | "field-removed"
  | "field-renamed"
  | "field-type-changed"
  | "field-visibility-added"
  | "field-visibility-changed"
  | "field-visibility-removed"
  | "model-property-changed"
  | "route-changed"
  | "seo-disabled"
  | "seo-enabled";

/** One classified structural difference. `target` is a field key, block type, or model property. */
export interface StructuralChange {
  /** Whether the configured default is written into snapshots lacking the field. */
  readonly backfill?: boolean;
  readonly class: StructuralChangeClass;
  /** Former field key of a `field-renamed` change. */
  readonly from?: string;
  /** Whether a destructive removal is declared by a `removedFields` or `removedBlocks` hint. */
  readonly hinted?: true;
  readonly kind: StructuralChangeKind;
  /** Changed field-definition properties, for `field-changed`. */
  readonly properties?: readonly string[];
  readonly scope: "block" | "field" | "model";
  readonly target: string;
  readonly schemaPath?: string;
  /** Baseline and configured block versions of a `block-definition-changed` change. */
  readonly version?: { readonly from: number; readonly to: number };
  /**
   * Baseline and configured rules of a `field-visibility-*` change; the
   * baseline controller is expressed by its configured key.
   */
  readonly visibility?: {
    readonly before?: FieldVisibilityRule;
    readonly after?: FieldVisibilityRule;
  };
}

/** Temporary synchronization hints of a configured model. */
export interface StructureHints {
  readonly removedBlocks?: readonly string[];
  readonly removedFields?: readonly string[];
  /** Current field key to former field key. */
  readonly renamedFields?: Readonly<Record<string, string>>;
  /** Stored SEO groups may be cleared after `seo` is disabled. */
  readonly removedSeo?: boolean;
}

/** A field rename hint that contradicts the stored baseline. */
export interface StructureHintIssue {
  readonly from: string;
  readonly kind: "source-missing" | "target-exists";
  readonly target: string;
}

/** Draft and published snapshot counts. */
export interface SnapshotStateCounts {
  readonly draft: number;
  readonly published: number;
}

/** A stored snapshot named by a synchronization report. */
export interface ConfigurationSyncSnapshotReference {
  /** Key of the affected block, for block-migration findings. */
  readonly blockKey?: string;
  readonly entryId: string;
  /** Validation path of an invalid migration result. */
  readonly path?: string;
  /** Short cause of a failed or invalid migration. */
  readonly reason?: string;
  /** Stored schema version of the affected block. */
  readonly schemaVersion?: number;
  readonly state: "draft" | "published";
  readonly title: string;
}

/** A bounded list of offending snapshots and their total. */
export interface ConfigurationSyncSnapshotFindings {
  readonly count: number;
  readonly snapshots: readonly ConfigurationSyncSnapshotReference[];
}

/** One current draft or published snapshot read for a data-dependent sync decision. */
export interface ConfigurationSyncSnapshot {
  readonly internalLinks?: readonly import("@lacecms/content").InternalLinkReference[];
  readonly blocks: readonly {
    readonly data?: JsonObject;
    readonly settings?: JsonObject;
    readonly hidden?: boolean;
    readonly key: string;
    readonly schemaVersion: number;
    readonly type: string;
  }[];
  readonly references?: readonly {
    readonly sourceKey: string;
    readonly fieldPath: string;
    readonly mediaId: string;
  }[];
  readonly entryId: string;
  readonly fields: JsonObject;
  /** Whether the snapshot holds an SEO group; absent means it holds none. */
  readonly hasSeo?: boolean;
  readonly revision: number;
  readonly snapshotId: string;
  readonly state: "draft" | "published";
  readonly title: string;
}

/** One bounded page of a model's current snapshots ordered by snapshot ID. */
export interface ConfigurationSyncSnapshotPage {
  readonly items: readonly ConfigurationSyncSnapshot[];
  /** Opaque continuation cursor; absent on the last page. */
  readonly next?: string;
}

/** Snapshots holding a field or block type: counts plus up to 20 named snapshots. */
export interface SnapshotHolders extends SnapshotStateCounts {
  readonly snapshots: readonly ConfigurationSyncSnapshotReference[];
}

/** Facts derived from one scan of a model's snapshots for a fixed fingerprint. */
export interface ModelSnapshotEvidence {
  readonly backfills: Readonly<Record<string, SnapshotStateCounts>>;
  readonly mediaBackfills?: Readonly<Record<string, ConfigurationSyncSnapshotFindings>>;
  /** Snapshots holding removed or changed block types. */
  readonly blockHolders: Readonly<Record<string, SnapshotHolders>>;
  /** Snapshots holding removed fields, rename sources, and rename targets. */
  readonly fieldHolders: Readonly<Record<string, SnapshotHolders>>;
  readonly fingerprint: string;
  /** Block-migration facts per block type whose version changed; present when scanned. */
  readonly migrations?: Readonly<Record<string, BlockMigrationEvidence>>;
  readonly oversized: ConfigurationSyncSnapshotFindings;
  /** Snapshots holding an SEO group; present when SEO is being disabled. */
  readonly seoHolders?: SnapshotHolders;
  readonly snapshots: SnapshotStateCounts;
  /** Published snapshots whose hidden values the published projection removes, by target. */
  readonly prunes?: Readonly<Record<string, SnapshotStateCounts>>;
  readonly violations: Readonly<Record<string, ConfigurationSyncSnapshotFindings>>;
}

/** Scan evidence keyed by stored model key. */
export type ConfigurationSyncEvidence = Readonly<Record<string, ModelSnapshotEvidence>>;

/** A model whose snapshots must be scanned before its changes can be decided. */
export interface ConfigurationSyncScanRequest {
  readonly changes: readonly StructuralChange[];
  readonly blockFields?: Readonly<Record<string, Readonly<Record<string, FieldDefinition>>>>;
  readonly storedFields?: Readonly<Record<string, FieldDefinition>>;
  readonly fields: Readonly<Record<string, FieldDefinition>>;
  readonly fingerprint: string;
  /** Block types whose stale blocks are migrated in memory; present when non-empty. */
  readonly migrations?: readonly ConfigurationSyncMigrationTarget[];
  readonly modelKey: string;
  /** Configured model-level conditional-field rules. */
  readonly visibility?: FieldVisibility;
}

/** A block type whose stored blocks are migrated to the configured version. */
export interface ConfigurationSyncMigrationTarget {
  readonly type: string;
  readonly version: number;
}

/** One media reference held by a snapshot. */
export interface ConfigurationSyncMediaReference {
  readonly fieldPath: string;
  readonly mediaId: string;
  readonly sourceKey: string;
}

/** One stored block read by the migration scan; all data is needed for snapshot budgets. */
export interface ConfigurationSyncMigrationBlock {
  readonly data: JsonObject;
  /** Hidden blocks are validated in draft mode even in a published snapshot. */
  readonly hidden: boolean;
  readonly key: string;
  readonly position: number;
  readonly schemaVersion: number;
  /** Stored settings; read only for blocks of a migrated type. */
  readonly settings?: JsonObject;
  readonly type: string;
}

/** One current snapshot of an entry read by the migration scan. */
export interface ConfigurationSyncMigrationSnapshot {
  readonly internalLinks?: readonly import("@lacecms/content").InternalLinkReference[];
  readonly blocks: readonly ConfigurationSyncMigrationBlock[];
  readonly fields: JsonObject;
  readonly references: readonly ConfigurationSyncMediaReference[];
  readonly revision: number;
  readonly snapshotId: string;
  readonly state: "draft" | "published";
  readonly title: string;
}

/** One entry holding a stale block of a migrated type, with its current snapshots. */
export interface ConfigurationSyncMigrationEntry {
  readonly draft?: ConfigurationSyncMigrationSnapshot;
  readonly entryId: string;
  readonly published?: ConfigurationSyncMigrationSnapshot;
}

/** Bounded entry page of the migration scan, ordered by entry ID. */
export interface ConfigurationSyncMigrationPage {
  readonly items: readonly ConfigurationSyncMigrationEntry[];
  /** Opaque continuation cursor; absent on the last page. */
  readonly next?: string;
}

/** One block rewritten in place by a migration unit. */
export interface ConfigurationSyncMigratedBlock {
  readonly data: JsonObject;
  readonly expectedSchemaVersion: number;
  readonly key: string;
  readonly schemaVersion: number;
  /** Migrated settings with the declared defaults applied. */
  readonly settings: JsonObject;
}

/** The guarded rewrite of one snapshot of a migration unit. */
export interface ConfigurationSyncSnapshotMigration {
  readonly internalLinks?: readonly import("@lacecms/content").InternalLinkReference[];
  readonly blocks: readonly ConfigurationSyncMigratedBlock[];
  /** Present when a published snapshot takes the draft's new revision. */
  readonly draftGuard?: { readonly revision: number; readonly snapshotId: string };
  readonly expectedRevision: number;
  /** Media references of the migrated blocks after migration. */
  readonly references: readonly ConfigurationSyncMediaReference[];
  readonly revision: number;
  readonly snapshotId: string;
  readonly state: "draft" | "published";
  /** Audit actor written to a migrated draft; published snapshots keep theirs. */
  readonly updatedBy?: string;
}

/** The independent migration unit of one entry; its published snapshot comes first. */
export interface ConfigurationSyncEntryMigration {
  readonly entryId: string;
  readonly snapshots: readonly ConfigurationSyncSnapshotMigration[];
}

/** Why a stale block cannot be migrated. */
export type BlockMigrationFindingKind = "ahead" | "failed" | "invalid" | "missing";

/** One stale block that cannot be migrated. */
export interface BlockMigrationFinding {
  readonly kind: BlockMigrationFindingKind;
  readonly reference: ConfigurationSyncSnapshotReference;
  readonly type: string;
}

/** Planned migration of one entry: findings, or a unit when there are none. */
export interface EntryMigrationPlan {
  /** Migrated blocks per type, with the states of the snapshots that hold them. */
  readonly blocks: readonly {
    readonly fromVersion: number;
    readonly state: "draft" | "published";
    readonly type: string;
  }[];
  readonly findings: readonly BlockMigrationFinding[];
  readonly unit?: ConfigurationSyncEntryMigration;
}

/** Migration facts of one block type derived from the migration scan. */
export interface BlockMigrationEvidence {
  readonly ahead: ConfigurationSyncSnapshotFindings;
  readonly blocks: number;
  readonly failed: ConfigurationSyncSnapshotFindings;
  readonly fromVersions: readonly number[];
  readonly invalid: ConfigurationSyncSnapshotFindings;
  readonly missing: ConfigurationSyncSnapshotFindings;
  /** Snapshots holding at least one migrated block of the type. */
  readonly snapshots: SnapshotStateCounts;
  readonly toVersion: number;
}

export interface StoredContentModelState {
  readonly draftSnapshotCount: number;
  readonly entryCount: number;
  readonly key: ContentModelKey;
  readonly kind: ContentModelRoute["kind"];
  readonly projectionHash: string;
  readonly publicProjectionHash?: string;
  readonly publicProjectionSourceHash?: string;
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
  readonly publicProjectionHash?: string;
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
  /** Baseline and configured rules of a `field-visibility-*` change. */
  readonly visibility?: NonNullable<StructuralChange["visibility"]>;
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
  | (ConfigurationSyncModelOperation & {
      readonly action: "label-update";
      readonly affectsPublicProjection?: boolean;
    })
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
  readonly linkRewrites?: readonly ConfigurationSyncLinkRewrite[];
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

export interface ConfigurationSyncLinkRewrite {
  readonly snapshotId: string;
  readonly references: readonly InternalLinkReference[];
}

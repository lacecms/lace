import type { ContentModelStructure } from "@lacecms/config";
import {
  ContentValidationError,
  MAX_JSON_BYTES,
  canonicalJsonByteLength,
  canonicalizeJson,
  validateFieldValue,
} from "@lacecms/content";
import type { FieldDefinition, JsonObject, JsonValue } from "@lacecms/content";

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
  | "model-property-changed"
  | "route-changed";

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
}

/** Temporary synchronization hints of a configured model. */
export interface StructureHints {
  readonly removedBlocks?: readonly string[];
  readonly removedFields?: readonly string[];
  /** Current field key to former field key. */
  readonly renamedFields?: Readonly<Record<string, string>>;
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
  readonly entryId: string;
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
  readonly blocks: readonly {
    readonly key: string;
    readonly schemaVersion: number;
    readonly type: string;
  }[];
  readonly entryId: string;
  readonly fields: JsonObject;
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
  /** Snapshots holding removed or changed block types. */
  readonly blockHolders: Readonly<Record<string, SnapshotHolders>>;
  /** Snapshots holding removed fields, rename sources, and rename targets. */
  readonly fieldHolders: Readonly<Record<string, SnapshotHolders>>;
  readonly fingerprint: string;
  readonly oversized: ConfigurationSyncSnapshotFindings;
  readonly snapshots: SnapshotStateCounts;
  readonly violations: Readonly<Record<string, ConfigurationSyncSnapshotFindings>>;
}

/** Scan evidence keyed by stored model key. */
export type ConfigurationSyncEvidence = Readonly<Record<string, ModelSnapshotEvidence>>;

/** A model whose snapshots must be scanned before its changes can be decided. */
export interface ConfigurationSyncScanRequest {
  readonly changes: readonly StructuralChange[];
  readonly fields: Readonly<Record<string, FieldDefinition>>;
  readonly fingerprint: string;
  readonly modelKey: string;
}

/** Maximum snapshots read per scan page. */
export const CONFIGURATION_SYNC_SCAN_PAGE_SIZE = 100;
/** Maximum offending snapshots named per finding. */
export const CONFIGURATION_SYNC_NAMED_SNAPSHOT_LIMIT = 20;

const FIELD_PROPERTIES = new Set([
  "defaultValue",
  "max",
  "maxLength",
  "min",
  "minLength",
  "options",
  "required",
  "type",
]);
const MODEL_IDENTITY_PROPERTIES = new Set([
  "blockDefinitions",
  "blocks",
  "fields",
  "key",
  "kind",
  "path",
  "route",
  "version",
]);
const SCOPE_ORDER = { block: 1, field: 0, model: 2 } as const;

function record(value: JsonValue | undefined): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function stringList(value: JsonValue | undefined): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function same(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return canonicalizeJson(left) === canonicalizeJson(right);
}

function lowerBoundChange(
  before: JsonValue | undefined,
  after: JsonValue | undefined,
): "relax" | "tighten" | undefined {
  if (same(before, after)) return undefined;
  if (typeof after !== "number") return "relax";
  if (typeof before !== "number") return "tighten";
  return after > before ? "tighten" : "relax";
}

function upperBoundChange(
  before: JsonValue | undefined,
  after: JsonValue | undefined,
): "relax" | "tighten" | undefined {
  if (same(before, after)) return undefined;
  if (typeof after !== "number") return "relax";
  if (typeof before !== "number") return "tighten";
  return after < before ? "tighten" : "relax";
}

function compareField(key: string, before: JsonObject, after: JsonObject): StructuralChange[] {
  if (before.type !== after.type) {
    return [{ class: "breaking", kind: "field-type-changed", scope: "field", target: key }];
  }
  const properties = new Set([...Object.keys(before), ...Object.keys(after)]);
  const unsupported = [...properties]
    .filter((name) => !FIELD_PROPERTIES.has(name) && !same(before[name], after[name]))
    .sort();
  if (unsupported.length > 0) {
    return [
      {
        class: "breaking",
        kind: "field-changed",
        properties: unsupported,
        scope: "field",
        target: key,
      },
    ];
  }

  const changed: string[] = [];
  // Any tightened property makes the whole field change `validated`.
  let tightened = false;
  const bounds: readonly [string, typeof lowerBoundChange][] = [
    ["minLength", lowerBoundChange],
    ["maxLength", upperBoundChange],
    ["min", lowerBoundChange],
    ["max", upperBoundChange],
  ];
  for (const [name, compare] of bounds) {
    const direction = compare(before[name], after[name]);
    if (direction === undefined) continue;
    changed.push(name);
    if (direction === "tighten") tightened = true;
  }
  if (before.required !== after.required) {
    changed.push("required");
    if (after.required === true) tightened = true;
  }
  let reordered = false;
  if (!same(before.options, after.options)) {
    const beforeOptions = stringList(before.options);
    const afterOptions = new Set(stringList(after.options));
    const removed = beforeOptions.some((option) => !afterOptions.has(option));
    const added = [...afterOptions].some((option) => !beforeOptions.includes(option));
    changed.push("options");
    if (removed) tightened = true;
    if (!removed && !added) reordered = true;
  }
  const defaultChanged = !same(before.defaultValue, after.defaultValue);
  if (defaultChanged) changed.push("defaultValue");
  const backfill = defaultChanged && Object.hasOwn(after, "defaultValue");

  if (changed.length === 0) return [];
  changed.sort();
  if (reordered && changed.length === 1) {
    return [{ class: "display", kind: "field-options-reordered", scope: "field", target: key }];
  }
  return [
    {
      ...(backfill ? { backfill: true } : {}),
      class: tightened ? "validated" : "compatible",
      kind: "field-changed",
      properties: changed,
      scope: "field",
      target: key,
    },
  ];
}

function definitionsByType(structure: ContentModelStructure): Map<string, JsonValue> {
  const definitions = new Map<string, JsonValue>();
  for (const definition of Array.isArray(structure.blockDefinitions)
    ? structure.blockDefinitions
    : []) {
    const type = record(definition).type;
    if (typeof type === "string") definitions.set(type, definition);
  }
  return definitions;
}

function compareChanges(left: StructuralChange, right: StructuralChange): number {
  return (
    SCOPE_ORDER[left.scope] - SCOPE_ORDER[right.scope] ||
    left.target.localeCompare(right.target) ||
    left.kind.localeCompare(right.kind)
  );
}

/**
 * Derives classified structural changes between a stored baseline and a
 * configured canonical structure. Model key and version are identity, not
 * structure, and are never reported.
 */
export function diffContentModelStructures(
  baseline: ContentModelStructure,
  target: ContentModelStructure,
  hints: StructureHints = {},
): readonly StructuralChange[] {
  const changes: StructuralChange[] = [];
  const beforeFields = record(baseline.fields);
  const afterFields = record(target.fields);
  const renames = applicableRenames(beforeFields, afterFields, hints);
  const renamedSources = new Set(renames.values());
  const removedFields = new Set(hints.removedFields ?? []);
  const removedBlocks = new Set(hints.removedBlocks ?? []);
  for (const key of Object.keys(afterFields)) {
    const after = record(afterFields[key]);
    const former = renames.get(key);
    if (former !== undefined) {
      changes.push({
        class: "destructive",
        from: former,
        kind: "field-renamed",
        scope: "field",
        target: key,
      });
      changes.push(...compareField(key, record(beforeFields[former]), after));
      continue;
    }
    if (!Object.hasOwn(beforeFields, key)) {
      changes.push({
        ...(Object.hasOwn(after, "defaultValue") ? { backfill: true } : {}),
        class: "compatible",
        kind: "field-added",
        scope: "field",
        target: key,
      });
      continue;
    }
    changes.push(...compareField(key, record(beforeFields[key]), after));
  }
  for (const key of Object.keys(beforeFields)) {
    if (!Object.hasOwn(afterFields, key) && !renamedSources.has(key)) {
      changes.push({
        class: "destructive",
        ...(removedFields.has(key) ? { hinted: true as const } : {}),
        kind: "field-removed",
        scope: "field",
        target: key,
      });
    }
  }

  const beforeBlocks = stringList(baseline.blocks);
  const afterBlocks = stringList(target.blocks);
  for (const type of afterBlocks) {
    if (!beforeBlocks.includes(type)) {
      changes.push({
        class: "compatible",
        kind: "block-type-allowed",
        scope: "block",
        target: type,
      });
    }
  }
  for (const type of beforeBlocks) {
    if (!afterBlocks.includes(type)) {
      changes.push({
        class: "destructive",
        ...(removedBlocks.has(type) ? { hinted: true as const } : {}),
        kind: "block-type-removed",
        scope: "block",
        target: type,
      });
    }
  }
  const shared = afterBlocks.filter((type) => beforeBlocks.includes(type));
  if (
    shared.length === beforeBlocks.length &&
    shared.length === afterBlocks.length &&
    !same(baseline.blocks, target.blocks)
  ) {
    changes.push({
      class: "display",
      kind: "block-allowlist-reordered",
      scope: "model",
      target: "blocks",
    });
  }
  const beforeDefinitions = definitionsByType(baseline);
  const afterDefinitions = definitionsByType(target);
  for (const type of shared) {
    if (!same(beforeDefinitions.get(type), afterDefinitions.get(type))) {
      changes.push({
        class: "migration",
        kind: "block-definition-changed",
        scope: "block",
        target: type,
      });
    }
  }

  for (const property of ["path", "route"]) {
    if (!same(baseline[property], target[property])) {
      changes.push({ class: "breaking", kind: "route-changed", scope: "model", target: property });
    }
  }
  const modelProperties = new Set([...Object.keys(baseline), ...Object.keys(target)]);
  for (const property of [...modelProperties].sort()) {
    if (MODEL_IDENTITY_PROPERTIES.has(property)) continue;
    if (!same(baseline[property], target[property])) {
      changes.push({
        class: "breaking",
        kind: "model-property-changed",
        scope: "model",
        target: property,
      });
    }
  }
  return Object.freeze(changes.sort(compareChanges).map((change) => Object.freeze(change)));
}

/**
 * Rename hints that apply to a baseline: the former key is a baseline field and
 * the new key is configured but not a baseline field.
 */
function applicableRenames(
  beforeFields: JsonObject,
  afterFields: JsonObject,
  hints: StructureHints,
): Map<string, string> {
  const renames = new Map<string, string>();
  for (const [key, former] of Object.entries(hints.renamedFields ?? {})) {
    if (
      Object.hasOwn(afterFields, key) &&
      Object.hasOwn(beforeFields, former) &&
      !Object.hasOwn(beforeFields, key)
    ) {
      renames.set(key, former);
    }
  }
  return renames;
}

/**
 * Lists field rename hints that contradict a baseline: both keys are baseline
 * fields, or neither is. A hint whose new key alone is in the baseline was
 * already applied and is inert.
 */
export function validateStructureHints(
  baseline: ContentModelStructure,
  hints: StructureHints,
): readonly StructureHintIssue[] {
  const fields = record(baseline.fields);
  const issues: StructureHintIssue[] = [];
  for (const [target, from] of Object.entries(hints.renamedFields ?? {})) {
    const hasSource = Object.hasOwn(fields, from);
    const hasTarget = Object.hasOwn(fields, target);
    if (hasSource && hasTarget) issues.push({ from, kind: "target-exists", target });
    if (!hasSource && !hasTarget) issues.push({ from, kind: "source-missing", target });
  }
  return Object.freeze(
    issues
      .sort((left, right) => left.target.localeCompare(right.target))
      .map((issue) => Object.freeze(issue)),
  );
}

/** Whether a change can only be decided by reading stored snapshots. */
export function changeNeedsEvidence(change: StructuralChange): boolean {
  return (
    change.backfill === true ||
    change.class === "destructive" ||
    change.class === "migration" ||
    change.class === "validated"
  );
}

function emptyCounts(): { draft: number; published: number } {
  return { draft: 0, published: 0 };
}

function increment(
  counts: Record<string, { draft: number; published: number }>,
  key: string,
  state: "draft" | "published",
): void {
  const value = (counts[key] ??= emptyCounts());
  value[state] += 1;
}

interface MutableFindings {
  count: number;
  snapshots: ConfigurationSyncSnapshotReference[];
}

function addFinding(findings: MutableFindings, snapshot: ConfigurationSyncSnapshot): void {
  findings.count += 1;
  if (findings.snapshots.length < CONFIGURATION_SYNC_NAMED_SNAPSHOT_LIMIT) {
    findings.snapshots.push(
      Object.freeze({ entryId: snapshot.entryId, state: snapshot.state, title: snapshot.title }),
    );
  }
}

function freezeCounts(
  counts: Record<string, { draft: number; published: number }>,
): Readonly<Record<string, SnapshotStateCounts>> {
  return Object.freeze(
    Object.fromEntries(
      Object.keys(counts)
        .sort()
        .map((key) => [key, Object.freeze({ ...counts[key]! })]),
    ),
  );
}

function freezeFindings(findings: MutableFindings): ConfigurationSyncSnapshotFindings {
  return Object.freeze({
    count: findings.count,
    snapshots: Object.freeze([...findings.snapshots]),
  });
}

interface MutableHolders {
  draft: number;
  published: number;
  snapshots: ConfigurationSyncSnapshotReference[];
}

function emptyHolders(): MutableHolders {
  return { draft: 0, published: 0, snapshots: [] };
}

function addHolder(holders: MutableHolders, snapshot: ConfigurationSyncSnapshot): void {
  holders[snapshot.state] += 1;
  if (holders.snapshots.length < CONFIGURATION_SYNC_NAMED_SNAPSHOT_LIMIT) {
    holders.snapshots.push(
      Object.freeze({ entryId: snapshot.entryId, state: snapshot.state, title: snapshot.title }),
    );
  }
}

function freezeHolders(
  holders: Record<string, MutableHolders>,
): Readonly<Record<string, SnapshotHolders>> {
  return Object.freeze(
    Object.fromEntries(
      Object.keys(holders)
        .sort()
        .map((key) => {
          const { draft, published, snapshots } = holders[key]!;
          return [
            key,
            Object.freeze({ draft, published, snapshots: Object.freeze([...snapshots]) }),
          ];
        }),
    ),
  );
}

function conforms(definition: FieldDefinition, value: JsonValue): boolean {
  try {
    validateFieldValue(definition, value);
    return true;
  } catch (error) {
    if (error instanceof ContentValidationError) return false;
    throw error;
  }
}

/** Folds bounded snapshot pages into the evidence one scan request needs. */
export function createSnapshotEvidenceAccumulator(request: ConfigurationSyncScanRequest): {
  add(snapshots: readonly ConfigurationSyncSnapshot[]): void;
  result(): ModelSnapshotEvidence;
} {
  const snapshots = emptyCounts();
  const fieldHolders: Record<string, MutableHolders> = {};
  const blockHolders: Record<string, MutableHolders> = {};
  const backfills: Record<string, { draft: number; published: number }> = {};
  const violations: Record<string, MutableFindings> = {};
  const oversized: MutableFindings = { count: 0, snapshots: [] };
  const removedFields = new Set<string>();
  const renames = new Map<string, string>();
  const blockTypes = new Set<string>();
  const backfilled = new Set<string>();
  const validated = new Map<string, StructuralChange>();
  for (const change of request.changes) {
    if (change.kind === "field-removed") removedFields.add(change.target);
    if (change.kind === "field-renamed" && change.from !== undefined) {
      renames.set(change.target, change.from);
    }
    if (change.scope === "block" && change.class !== "compatible") blockTypes.add(change.target);
    if (change.backfill === true) backfilled.add(change.target);
    if (change.class === "validated") validated.set(change.target, change);
  }
  for (const key of [...removedFields, ...renames.keys(), ...renames.values()]) {
    fieldHolders[key] = emptyHolders();
  }
  for (const type of blockTypes) blockHolders[type] = emptyHolders();
  for (const key of backfilled) backfills[key] = emptyCounts();
  for (const key of validated.keys()) violations[key] = { count: 0, snapshots: [] };

  return {
    add(page) {
      for (const snapshot of page) {
        snapshots[snapshot.state] += 1;
        for (const [key, holders] of Object.entries(fieldHolders)) {
          if (Object.hasOwn(snapshot.fields, key)) addHolder(holders, snapshot);
        }
        const types = new Set(snapshot.blocks.map((block) => block.type));
        for (const type of blockTypes) {
          if (types.has(type)) addHolder(blockHolders[type]!, snapshot);
        }
        // Apply order matches the synchronization writes: rename, prune, backfill.
        const transformed: Record<string, JsonValue> = { ...snapshot.fields };
        let grown = false;
        for (const [key, former] of renames) {
          if (!Object.hasOwn(snapshot.fields, former)) continue;
          transformed[key] = snapshot.fields[former]!;
          delete transformed[former];
          grown = true;
        }
        for (const key of removedFields) delete transformed[key];
        for (const key of backfilled) {
          const definition = request.fields[key];
          if (Object.hasOwn(transformed, key) || definition?.defaultValue === undefined) continue;
          transformed[key] = definition.defaultValue as JsonValue;
          grown = true;
          increment(backfills, key, snapshot.state);
        }
        if (grown && canonicalJsonByteLength(transformed) > MAX_JSON_BYTES) {
          addFinding(oversized, snapshot);
        }
        for (const [key, change] of validated) {
          const definition = request.fields[key];
          if (definition === undefined) continue;
          const value = transformed[key];
          const violates =
            value === undefined
              ? snapshot.state === "published" &&
                definition.required &&
                change.properties?.includes("required") === true
              : !conforms(definition, value);
          if (violates) addFinding(violations[key]!, snapshot);
        }
      }
    },
    result() {
      return Object.freeze({
        backfills: freezeCounts(backfills),
        blockHolders: freezeHolders(blockHolders),
        fieldHolders: freezeHolders(fieldHolders),
        fingerprint: request.fingerprint,
        oversized: freezeFindings(oversized),
        snapshots: Object.freeze({ ...snapshots }),
        violations: Object.freeze(
          Object.fromEntries(
            Object.keys(violations)
              .sort()
              .map((key) => [key, freezeFindings(violations[key]!)]),
          ),
        ),
      });
    },
  };
}

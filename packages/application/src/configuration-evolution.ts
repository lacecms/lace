import { transformConfigurationSyncFields } from "./configuration-fields.js";
import type { ContentModelStructure } from "@lacecms/config";
import {
  ContentValidationError,
  validateSnapshotListBudget,
  parseSchemaPath,
  encodeSchemaPath,
  MAX_JSON_BYTES,
  canonicalJsonByteLength,
  canonicalizeJson,
} from "@lacecms/content";
import type { FieldDefinition, JsonObject, JsonValue } from "@lacecms/content";
import type {
  BlockMigrationEvidence,
  ConfigurationSyncMigrationTarget,
} from "./configuration-migration.js";

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
}

/** Maximum snapshots read per scan page. */
export const CONFIGURATION_SYNC_SCAN_PAGE_SIZE = 100;
/** Maximum offending snapshots named per finding. */
export const CONFIGURATION_SYNC_NAMED_SNAPSHOT_LIMIT = 20;

const FIELD_PROPERTIES = new Set([
  "embedProviders",
  "fields",
  "item",
  "minItems",
  "maxItems",
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
  "seo",
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
  if (after.type === "list") {
    before = { ...before, minItems: before.minItems ?? 0, maxItems: before.maxItems ?? 100 };
    after = { ...after, minItems: after.minItems ?? 0, maxItems: after.maxItems ?? 100 };
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
  let providerBreaking = false;
  if (!same(before.embedProviders, after.embedProviders)) {
    changed.push("embedProviders");
    if (after.embedProviders !== undefined) {
      const nextProviders = new Set(stringList(after.embedProviders));
      providerBreaking =
        before.embedProviders === undefined ||
        stringList(before.embedProviders).some((provider) => !nextProviders.has(provider));
    }
  }
  const bounds: readonly [string, typeof lowerBoundChange][] = [
    ["minItems", lowerBoundChange],
    ["maxItems", upperBoundChange],
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
      class: providerBreaking ? "breaking" : tightened ? "validated" : "compatible",
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
  const removedBlocks = new Set(hints.removedBlocks ?? []);
  const compareDefinition = (
    path: readonly string[],
    before: JsonObject,
    after: JsonObject,
  ): void => {
    const address = encodeSchemaPath(path);
    changes.push(...compareField(address, before, after));
    if (before.type !== after.type) return;
    if (after.type === "group") compareMap(path, record(before.fields), record(after.fields));
    if (after.type === "list")
      compareDefinition([...path, "*"], record(before.item), record(after.item));
  };
  const compareMap = (parent: readonly string[], before: JsonObject, after: JsonObject): void => {
    const sources = new Set<string>();
    for (const key of Object.keys(after)) {
      const path = [...parent, key];
      const address = encodeSchemaPath(path);
      const hint = hints.renamedFields?.[address];
      const former = hint === undefined ? undefined : parseSchemaPath(hint).at(-1);
      const renamed =
        former !== undefined && Object.hasOwn(before, former) && !Object.hasOwn(before, key);
      const old = renamed ? former : key;
      if (renamed) {
        sources.add(old);
        changes.push({
          class: "destructive",
          from: encodeSchemaPath([...parent, old]),
          kind: "field-renamed",
          scope: "field",
          target: address,
        });
      }
      if (!Object.hasOwn(before, old)) {
        changes.push({
          ...(Object.hasOwn(record(after[key]), "defaultValue") ? { backfill: true } : {}),
          class: "compatible",
          kind: "field-added",
          scope: "field",
          target: address,
        });
      } else compareDefinition(path, record(before[old]), record(after[key]));
    }
    for (const key of Object.keys(before)) {
      if (Object.hasOwn(after, key) || sources.has(key)) continue;
      const address = encodeSchemaPath([...parent, key]);
      changes.push({
        class: "destructive",
        ...(hints.removedFields?.includes(address) ? { hinted: true as const } : {}),
        kind: "field-removed",
        scope: "field",
        target: address,
      });
    }
  };
  compareMap([], record(baseline.fields), record(target.fields));

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
    const before = beforeDefinitions.get(type);
    const after = afterDefinitions.get(type);
    if (!same(before, after)) {
      const from = record(before).version;
      const to = record(after).version;
      changes.push({
        class: "migration",
        kind: "block-definition-changed",
        scope: "block",
        target: type,
        ...(typeof from === "number" && typeof to === "number"
          ? { version: Object.freeze({ from, to }) }
          : {}),
      });
    }
  }

  if (baseline.seo !== target.seo) {
    if (target.seo === true) {
      changes.push({ class: "compatible", kind: "seo-enabled", scope: "model", target: "seo" });
    } else if (baseline.seo === true) {
      changes.push({
        class: "destructive",
        ...(hints.removedSeo === true ? { hinted: true as const } : {}),
        kind: "seo-disabled",
        scope: "model",
        target: "seo",
      });
    } else {
      changes.push({
        class: "breaking",
        kind: "model-property-changed",
        scope: "model",
        target: "seo",
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

/** Resolve a configured schema address through applicable ancestor rename pairs. */
function baselineFieldAt(
  baseline: ContentModelStructure,
  path: readonly string[],
  hints: StructureHints,
): FieldDefinition | undefined {
  let fields = record(baseline.fields) as unknown as Readonly<Record<string, FieldDefinition>>;
  let current: FieldDefinition | undefined;
  for (let index = 0; index < path.length; index++) {
    const part = path[index]!;
    if (part === "*") {
      if (current === undefined) return undefined;
      if (current.type !== "list") throw new Error("Wildcard does not address a list.");
      current = current.item;
    } else {
      if (index > 0) {
        if (current === undefined) return undefined;
        if (current.type !== "group") throw new Error("Named child does not address a group.");
        fields = current.fields;
      }
      const address = encodeSchemaPath(path.slice(0, index + 1));
      const former = hints.renamedFields?.[address];
      const source = former === undefined ? undefined : parseSchemaPath(former).at(-1);
      const key =
        index < path.length - 1 &&
        source !== undefined &&
        Object.hasOwn(fields, source) &&
        !Object.hasOwn(fields, part)
          ? source
          : part;
      current = Object.hasOwn(fields, key) ? fields[key] : undefined;
    }
  }
  return current;
}

/** Validate nested hints in paired ancestor contexts, preserving inert applied hints. */
export function validateStructureHints(
  baseline: ContentModelStructure,
  hints: StructureHints,
): readonly StructureHintIssue[] {
  const issues: StructureHintIssue[] = [];
  for (const [target, from] of Object.entries(hints.renamedFields ?? {})) {
    try {
      const hasSource = baselineFieldAt(baseline, parseSchemaPath(from), hints) !== undefined;
      const hasTarget = baselineFieldAt(baseline, parseSchemaPath(target), hints) !== undefined;
      if (hasSource && hasTarget) issues.push({ from, kind: "target-exists", target });
      if (!hasSource && !hasTarget) issues.push({ from, kind: "source-missing", target });
    } catch {
      issues.push({ from, kind: "source-missing", target });
    }
  }
  for (const target of hints.removedFields ?? []) {
    try {
      baselineFieldAt(baseline, parseSchemaPath(target), hints);
    } catch {
      issues.push({ from: target, kind: "source-missing", target });
    }
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

function addFinding(
  findings: MutableFindings,
  snapshot: ConfigurationSyncSnapshot,
  path?: string,
): void {
  findings.count += 1;
  if (findings.snapshots.length < CONFIGURATION_SYNC_NAMED_SNAPSHOT_LIMIT) {
    findings.snapshots.push(
      Object.freeze({
        entryId: snapshot.entryId,
        state: snapshot.state,
        title: snapshot.title,
        ...(path === undefined ? {} : { path }),
      }),
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

function addHolder(
  holders: MutableHolders,
  snapshot: ConfigurationSyncSnapshot,
  path?: string,
): void {
  holders[snapshot.state] += 1;
  if (holders.snapshots.length < CONFIGURATION_SYNC_NAMED_SNAPSHOT_LIMIT) {
    holders.snapshots.push(
      Object.freeze({
        entryId: snapshot.entryId,
        state: snapshot.state,
        title: snapshot.title,
        ...(path === undefined ? {} : { path }),
      }),
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
  const mediaBackfills: Record<string, MutableFindings> = {};
  const oversized: MutableFindings = { count: 0, snapshots: [] };
  const removedFields = new Set<string>();
  const renames = new Map<string, string>();
  const blockTypes = new Set<string>();
  const backfilled = new Set<string>();
  const validated = new Map<string, StructuralChange>();
  const seoHolders = request.changes.some((change) => change.kind === "seo-disabled")
    ? emptyHolders()
    : undefined;
  for (const change of request.changes) {
    if (change.kind === "field-removed") removedFields.add(change.target);
    if (change.kind === "field-renamed" && change.from !== undefined) {
      renames.set(change.target, change.from);
    }
    if (change.scope === "block" && change.class !== "compatible") blockTypes.add(change.target);
    if (change.backfill === true) backfilled.add(change.target);
    if (change.class === "validated" || change.backfill) validated.set(change.target, change);
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
        if (seoHolders !== undefined && snapshot.hasSeo === true) addHolder(seoHolders, snapshot);
        const types = new Set(snapshot.blocks.map((block) => block.type));
        for (const type of blockTypes) {
          if (types.has(type)) addHolder(blockHolders[type]!, snapshot);
        }
        const transformed = transformConfigurationSyncFields(
          request.fields,
          request.changes,
          snapshot.fields,
          snapshot.state,
        );
        for (const [key, path] of Object.entries(transformed.holders))
          if (fieldHolders[key] !== undefined)
            addHolder(fieldHolders[key]!, snapshot, key.startsWith("/") ? path : undefined);
        for (const [key] of Object.entries(transformed.backfills))
          increment(backfills, key, snapshot.state);
        for (const [key, path] of Object.entries(transformed.mediaBackfills)) {
          const finding = (mediaBackfills[key] ??= { count: 0, snapshots: [] });
          addFinding(finding, snapshot, path);
        }
        let overLimit = canonicalJsonByteLength(transformed.fields) > MAX_JSON_BYTES;
        let limitPath: string | undefined;
        const removedTypes = new Set(
          request.changes
            .filter((change) => change.kind === "block-type-removed")
            .map((change) => change.target),
        );
        const retained = snapshot.blocks.filter((block) => !removedTypes.has(block.type));
        const oversizedBlock = retained.findIndex(
          (block) => canonicalJsonByteLength(block.data ?? {}) > MAX_JSON_BYTES,
        );
        if (oversizedBlock >= 0) {
          overLimit = true;
          limitPath = `/blocks/${oversizedBlock}/data`;
        }
        try {
          validateSnapshotListBudget(
            request.fields,
            transformed.fields,
            retained.map((block, index) => ({
              fields: request.blockFields?.[block.type] ?? {},
              data: block.data ?? {},
              path: ["blocks", index, "data"],
            })),
          );
        } catch (error) {
          if (!(error instanceof ContentValidationError)) throw error;
          overLimit = true;
          limitPath = error.issues[0]?.path.map(String).join("/");
          if (limitPath !== undefined) limitPath = `/${limitPath}`;
        }
        const keptReferences = (snapshot.references ?? []).filter(
          (reference) =>
            reference.sourceKey !== "$fields" &&
            !(
              reference.sourceKey === "$seo" &&
              request.changes.some((change) => change.kind === "seo-disabled")
            ) &&
            !snapshot.blocks.some(
              (block) => removedTypes.has(block.type) && block.key === reference.sourceKey,
            ),
        );
        if (keptReferences.length + transformed.references.length > 200) overLimit = true;
        if (overLimit) addFinding(oversized, snapshot, limitPath);
        for (const [key, path] of Object.entries(transformed.violations))
          addFinding(violations[key]!, snapshot, key.startsWith("/") ? path : undefined);
      }
    },
    result() {
      return Object.freeze({
        backfills: freezeCounts(backfills),
        ...(Object.keys(mediaBackfills).length === 0
          ? {}
          : {
              mediaBackfills: Object.freeze(
                Object.fromEntries(
                  Object.entries(mediaBackfills).map(([key, finding]) => [
                    key,
                    freezeFindings(finding),
                  ]),
                ),
              ),
            }),
        blockHolders: freezeHolders(blockHolders),
        fieldHolders: freezeHolders(fieldHolders),
        fingerprint: request.fingerprint,
        oversized: freezeFindings(oversized),
        ...(seoHolders === undefined
          ? {}
          : { seoHolders: freezeHolders({ seo: seoHolders }).seo! }),
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

import type { StructuralChange, StructureHints } from "./types.js";
import type { ContentModelStructure } from "@lacecms/config";
import { isRecord, canonicalizeJson, parseSchemaPath, encodeSchemaPath } from "@lacecms/content";
import type { FieldVisibility, FieldVisibilityRule, JsonObject, JsonValue } from "@lacecms/content";

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
  // Compared separately by visibility change kinds.
  "visibility",
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
  "visibility",
]);
const SCOPE_ORDER = { block: 1, field: 0, model: 2 } as const;

function record(value: JsonValue | undefined): JsonObject {
  return isRecord(value) ? (value as JsonObject) : {};
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

function visibilityRules(value: JsonValue | undefined): FieldVisibility {
  return record(value) as unknown as FieldVisibility;
}

/**
 * Classify one target's rule change. Narrowing the same controller's values
 * only hides occurrences, so it is compatible; anything that can reveal one
 * is validated against the newly visible published occurrences.
 */
function compareVisibility(
  address: string,
  before: FieldVisibilityRule | undefined,
  after: FieldVisibilityRule | undefined,
): StructuralChange[] {
  if (before === undefined && after === undefined) return [];
  const visibility = {
    ...(before === undefined ? {} : { before }),
    ...(after === undefined ? {} : { after }),
  };
  if (before === undefined)
    return [
      {
        class: "compatible",
        kind: "field-visibility-added",
        scope: "field",
        target: address,
        visibility,
      },
    ];
  if (after === undefined)
    return [
      {
        class: "validated",
        kind: "field-visibility-removed",
        scope: "field",
        target: address,
        visibility,
      },
    ];
  const narrowed =
    before.field === after.field && after.values.every((value) => before.values.includes(value));
  if (narrowed && after.values.length === before.values.length) return [];
  return [
    {
      class: narrowed ? "compatible" : "validated",
      kind: "field-visibility-changed",
      scope: "field",
      target: address,
      visibility,
    },
  ];
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
    if (after.type === "group")
      compareMap(
        path,
        record(before.fields),
        record(after.fields),
        visibilityRules(before.visibility),
        visibilityRules(after.visibility),
      );
    if (after.type === "list")
      compareDefinition([...path, "*"], record(before.item), record(after.item));
  };
  const compareMap = (
    parent: readonly string[],
    before: JsonObject,
    after: JsonObject,
    beforeRules: FieldVisibility,
    afterRules: FieldVisibility,
  ): void => {
    const sources = new Set<string>();
    // Configured key -> baseline key, after applicable rename hints.
    const baselineKeys = new Map<string, string>();
    for (const key of Object.keys(after)) {
      const path = [...parent, key];
      const address = encodeSchemaPath(path);
      const hint = hints.renamedFields?.[address];
      const former = hint === undefined ? undefined : parseSchemaPath(hint).at(-1);
      const renamed =
        former !== undefined && Object.hasOwn(before, former) && !Object.hasOwn(before, key);
      const old = renamed ? former : key;
      baselineKeys.set(key, old);
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
    // Express baseline controllers by configured keys so pure renames compare equal.
    const configuredKeys = new Map([...baselineKeys].map(([key, old]) => [old, key]));
    for (const key of Object.keys(after)) {
      const old = baselineKeys.get(key)!;
      if (!Object.hasOwn(before, old)) continue;
      const prior = Object.hasOwn(beforeRules, old) ? beforeRules[old] : undefined;
      const next = Object.hasOwn(afterRules, key) ? afterRules[key] : undefined;
      changes.push(
        ...compareVisibility(
          encodeSchemaPath([...parent, key]),
          prior === undefined
            ? undefined
            : { field: configuredKeys.get(prior.field) ?? prior.field, values: prior.values },
          next,
        ),
      );
    }
  };
  compareMap(
    [],
    record(baseline.fields),
    record(target.fields),
    visibilityRules(baseline.visibility),
    visibilityRules(target.visibility),
  );

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
      changes.push({
        class: "breaking",
        kind: "route-changed",
        scope: "model",
        target: property,
        ...(property === "route" && baseline.route !== undefined && target.route === undefined
          ? { routeRemoved: true as const }
          : {}),
      });
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

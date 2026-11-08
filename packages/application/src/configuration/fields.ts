import type { StructuralChange, ConfigurationSyncChange } from "./types.js";
import {
  ContentValidationError,
  canonicalizeJson,
  collectFieldMedia,
  encodeFieldPath,
  encodeSchemaPath,
  effectiveVisibilityValues,
  isFieldVisible,
  isRecord,
  parseSchemaPath,
  schemaFieldAt,
  validateFieldValue,
} from "@lacecms/content";
import type {
  FieldDefinition,
  FieldVisibility,
  FieldVisibilityRule,
  JsonObject,
  JsonValue,
  ModelFieldDefinitions,
} from "@lacecms/content";

type MutableObject = Record<string, JsonValue>;
interface Occurrence {
  readonly parent: MutableObject | JsonValue[];
  readonly key: string | number;
  readonly path: readonly (string | number)[];
}
function object(value: unknown): value is MutableObject {
  return isRecord(value);
}
function occurrences(root: MutableObject, address: string): Occurrence[] {
  const segments = parseSchemaPath(address);
  const result: Occurrence[] = [];
  function walk(value: unknown, index: number, path: readonly (string | number)[]): void {
    const segment = segments[index]!;
    if (segment === "*") {
      if (!Array.isArray(value)) return;
      value.forEach((child, item) => {
        if (index === segments.length - 1)
          result.push({ parent: value, key: item, path: [...path, item] });
        else walk(child, index + 1, [...path, item]);
      });
    } else if (object(value)) {
      if (index === segments.length - 1)
        result.push({ parent: value, key: segment, path: [...path, segment] });
      else walk(value[segment], index + 1, [...path, segment]);
    }
  }
  walk(root, 0, ["fields"]);
  return result;
}
function read(occurrence: Occurrence): JsonValue | undefined {
  return (occurrence.parent as MutableObject)[occurrence.key];
}
function present(occurrence: Occurrence): boolean {
  return Object.hasOwn(occurrence.parent, occurrence.key);
}
function set(occurrence: Occurrence, value: JsonValue): void {
  Object.defineProperty(occurrence.parent, occurrence.key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/** The sibling field map and rules that own the field at a schema address. */
function ownerAt(
  definitions: ModelFieldDefinitions,
  visibility: FieldVisibility | undefined,
  address: string,
): { readonly fields: ModelFieldDefinitions; readonly rules?: FieldVisibility } | undefined {
  const parts = parseSchemaPath(address);
  if (parts.length === 1)
    return { fields: definitions, ...(visibility ? { rules: visibility } : {}) };
  const parent = schemaFieldAt(definitions, parts.slice(0, -1));
  if (parent?.type !== "group") return undefined;
  return { fields: parent.fields, ...(parent.visibility ? { rules: parent.visibility } : {}) };
}

/** Rule evaluation over stored values, using the controller default when it is absent. */
function visibleUnder(
  rule: FieldVisibilityRule | undefined,
  fields: ModelFieldDefinitions,
  parent: MutableObject,
): boolean {
  if (rule === undefined) return true;
  // A local target also accommodates the before/after rules of a sync change.
  const rules = { target: rule };
  return isFieldVisible(rules, "target", effectiveVisibilityValues(fields, rules, parent));
}

function ruleFor(
  owner: { readonly rules?: FieldVisibility } | undefined,
  key: string | number,
): FieldVisibilityRule | undefined {
  return owner?.rules !== undefined && Object.hasOwn(owner.rules, key)
    ? owner.rules[key as string]
    : undefined;
}

/** Facts of one pure prospective model-field rewrite; paths are concrete JSON pointers. */
export interface ConfigurationSyncFieldResult {
  readonly fields: JsonObject;
  readonly holders: Readonly<Record<string, string>>;
  readonly backfills: Readonly<Record<string, string>>;
  readonly mediaBackfills: Readonly<Record<string, string>>;
  /** Hidden published values removed by the published projection, by schema address. */
  readonly prunes: Readonly<Record<string, string>>;
  readonly violations: Readonly<Record<string, string>>;
  readonly references: readonly { readonly fieldPath: string; readonly mediaId: string }[];
}

/** Remove every value hidden by the configured rules, recursively through visible values. */
function pruneHidden(
  fields: ModelFieldDefinitions,
  rules: FieldVisibility | undefined,
  value: MutableObject,
  schema: readonly string[],
  path: readonly (string | number)[],
  prunes: Record<string, string>,
): void {
  for (const [key, definition] of Object.entries(fields)) {
    if (!Object.hasOwn(value, key)) continue;
    const address = encodeSchemaPath([...schema, key]);
    const rule = rules !== undefined && Object.hasOwn(rules, key) ? rules[key] : undefined;
    if (!visibleUnder(rule, fields, value)) {
      prunes[address] ??= encodeFieldPath([...path, key]);
      delete value[key];
      continue;
    }
    const visit = (
      child: FieldDefinition,
      item: JsonValue,
      at: readonly (string | number)[],
      within: readonly string[],
    ) => {
      if (child.type === "group" && object(item))
        pruneHidden(child.fields, child.visibility, item, within, at, prunes);
      if (child.type === "list" && Array.isArray(item))
        item.forEach((entry, index) => visit(child.item, entry, [...at, index], [...within, "*"]));
    };
    visit(definition, value[key]!, [...path, key], [...schema, key]);
  }
}

/** Apply only the reviewed changes; never materialize untouched defaults or missing parents. */
export function transformConfigurationSyncFields(
  definitions: ModelFieldDefinitions,
  changes: readonly StructuralChange[],
  values: JsonObject,
  state: "draft" | "published",
  visibility?: FieldVisibility,
): ConfigurationSyncFieldResult {
  const fields = JSON.parse(canonicalizeJson(values)) as MutableObject;
  const holders: Record<string, string> = {};
  const backfills: Record<string, string> = {};
  const mediaBackfills: Record<string, string> = {};
  const prunes: Record<string, string> = {};
  const violations: Record<string, string> = {};
  // Published snapshots never hold values their configured rules hide.
  const hiddenInPublished = (address: string, occurrence: Occurrence): boolean => {
    if (state !== "published") return false;
    const owner = ownerAt(definitions, visibility, address);
    return !visibleUnder(
      ruleFor(owner, occurrence.key),
      owner?.fields ?? {},
      occurrence.parent as MutableObject,
    );
  };
  const ordered = [...changes]
    .filter((change) => change.scope === "field")
    .sort(
      (left, right) =>
        parseSchemaPath(left.target).length - parseSchemaPath(right.target).length ||
        left.target.localeCompare(right.target),
    );
  const hold = (address: string, occurrence: Occurrence): void => {
    if (present(occurrence)) holders[address] ??= encodeFieldPath(occurrence.path);
  };
  for (const change of ordered) {
    if (change.kind !== "field-renamed" || change.from === undefined) continue;
    const from = parseSchemaPath(change.from).at(-1)!;
    for (const target of occurrences(fields, change.target)) {
      hold(change.target, target);
      const source = { ...target, key: from, path: [...target.path.slice(0, -1), from] };
      hold(change.from, source);
      if (!present(source) || present(target)) continue;
      set(target, read(source)!);
      delete (source.parent as MutableObject)[from];
    }
  }
  for (const change of ordered) {
    if (change.kind !== "field-removed") continue;
    for (const occurrence of occurrences(fields, change.target)) {
      hold(change.target, occurrence);
      delete (occurrence.parent as MutableObject)[occurrence.key];
    }
  }
  for (const change of ordered) {
    if (!change.backfill || parseSchemaPath(change.target).at(-1) === "*") continue;
    const definition = schemaFieldAt(definitions, parseSchemaPath(change.target));
    if (definition?.defaultValue === undefined) continue;
    for (const occurrence of occurrences(fields, change.target)) {
      if (present(occurrence) || hiddenInPublished(change.target, occurrence)) continue;
      const path = encodeFieldPath(occurrence.path);
      let inserted: JsonValue;
      backfills[change.target] ??= path;
      try {
        inserted = validateFieldValue(
          definition,
          definition.defaultValue,
          occurrence.path,
          "draft",
        ) as JsonValue;
      } catch (error) {
        if (!(error instanceof ContentValidationError)) throw error;
        violations[change.target] ??= encodeFieldPath(error.issues[0]?.path ?? occurrence.path);
        continue;
      }
      const media = collectFieldMedia({ value: definition }, { value: inserted });
      if (media.length > 0) mediaBackfills[change.target] ??= path;
      set(occurrence, inserted);
      backfills[change.target] ??= path;
    }
  }
  if (state === "published") pruneHidden(definitions, visibility, fields, [], ["fields"], prunes);
  for (const change of ordered) {
    if (change.class !== "validated") continue;
    const definition = schemaFieldAt(definitions, parseSchemaPath(change.target));
    if (definition === undefined) continue;
    if (change.kind.startsWith("field-visibility-")) {
      // Only published occurrences that this change reveals must satisfy publication.
      if (state !== "published") continue;
      const owner = ownerAt(definitions, visibility, change.target);
      for (const occurrence of occurrences(fields, change.target)) {
        const parent = occurrence.parent as MutableObject;
        if (
          !visibleUnder(change.visibility?.after, owner?.fields ?? {}, parent) ||
          visibleUnder(change.visibility?.before, owner?.fields ?? {}, parent)
        )
          continue;
        const path = encodeFieldPath(occurrence.path);
        if (!present(occurrence)) {
          if (definition.required) violations[change.target] ??= path;
          continue;
        }
        try {
          validateFieldValue(definition, read(occurrence), occurrence.path, "publish");
        } catch (error) {
          if (!(error instanceof ContentValidationError)) throw error;
          violations[change.target] ??= encodeFieldPath(error.issues[0]?.path ?? occurrence.path);
        }
      }
      continue;
    }
    for (const occurrence of occurrences(fields, change.target)) {
      const path = encodeFieldPath(occurrence.path);
      // A hidden published occurrence keeps draft semantics: never required.
      const hidden = hiddenInPublished(change.target, occurrence);
      if (!present(occurrence)) {
        if (hidden) continue;
        if (state === "published" && definition.required && change.properties?.includes("required"))
          violations[change.target] ??= path;
        continue;
      }
      try {
        // Container child presence/minimum changes have their own diff entries.
        const mode =
          definition.type === "group" || definition.type === "list" || state === "draft" || hidden
            ? "draft"
            : "publish";
        validateFieldValue(definition, read(occurrence), occurrence.path, mode);
        if (
          state === "published" &&
          !hidden &&
          definition.type === "list" &&
          change.properties?.includes("minItems") &&
          Array.isArray(read(occurrence)) &&
          (read(occurrence) as readonly JsonValue[]).length < (definition.minItems ?? 0)
        )
          violations[change.target] ??= path;
      } catch (error) {
        if (!(error instanceof ContentValidationError)) throw error;
        violations[change.target] ??= encodeFieldPath(error.issues[0]?.path ?? occurrence.path);
      }
    }
  }
  return {
    fields,
    holders,
    backfills,
    mediaBackfills,
    prunes,
    violations,
    references: collectFieldMedia(definitions, fields).map(({ mediaId, path }) => ({
      fieldPath: encodeFieldPath(path),
      mediaId,
    })),
  };
}

/** Build exact replacements only for snapshots whose reviewed model fields change. */
export function configurationSyncSnapshotRewrites(
  definitions: ModelFieldDefinitions,
  changes: readonly ConfigurationSyncChange[],
  snapshots: readonly {
    readonly id: string;
    readonly fields: JsonObject;
    readonly state: "draft" | "published";
  }[],
  visibility?: FieldVisibility,
): readonly {
  readonly id: string;
  readonly fields: JsonObject;
  readonly references: ConfigurationSyncFieldResult["references"];
}[] {
  return snapshots.flatMap((snapshot) => {
    const transformed = transformConfigurationSyncFields(
      definitions,
      configurationSyncFieldChanges(changes),
      snapshot.fields,
      snapshot.state,
      visibility,
    );
    if (canonicalizeJson(snapshot.fields) === canonicalizeJson(transformed.fields)) return [];
    return [{ id: snapshot.id, fields: transformed.fields, references: transformed.references }];
  });
}

/** Recover field transformation instructions from a reviewed evidence-backed plan. */
export function configurationSyncFieldChanges(
  changes: readonly ConfigurationSyncChange[],
): readonly StructuralChange[] {
  return changes.map(({ backfill, ...change }) => ({
    ...change,
    ...(backfill === undefined ? {} : { backfill: true }),
  }));
}

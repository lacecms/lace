import type {
  FieldDefinition,
  FieldValue,
  ModelFieldDefinitions,
  FieldVisibility,
  ModelFieldValues,
} from "./definitions.js";
import { visitFieldDefinition, MAX_SNAPSHOT_LIST_ITEMS, MAX_LIST_ITEMS } from "./definitions.js";
import { isSafeRichTextDocument, isUrlFieldTarget, isSafeUrl } from "./rich-text.js";
import { parseVideoEmbed } from "./video-embeds.js";
import * as v from "valibot";
import type { ValidationPathSegment } from "../shared/errors.js";
import { ContentValidationError, invalid } from "../shared/errors.js";
import type { JsonValue, JsonObject } from "../shared/json.js";
import { isRecord } from "../shared/objects.js";
import { effectiveVisibilityValues, isFieldVisible } from "./visibility.js";

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }
  const parts = value.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function isUtcIsoDatetime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isFieldValue(definition: FieldDefinition, value: unknown): boolean {
  return visitFieldDefinition(definition, {
    group: () => false,
    list: () => false,
    boolean: () => typeof value === "boolean",
    date: () => isCalendarDate(value),
    datetime: () => isUtcIsoDatetime(value),
    media: () => typeof value === "string" && value.length > 0,
    number: (fieldDefinition) =>
      typeof value === "number" &&
      Number.isFinite(value) &&
      (fieldDefinition.min === undefined || value >= fieldDefinition.min) &&
      (fieldDefinition.max === undefined || value <= fieldDefinition.max),
    richText: () => isSafeRichTextDocument(value),
    select: (fieldDefinition) =>
      typeof value === "string" && fieldDefinition.options.includes(value),
    text: (fieldDefinition) =>
      typeof value === "string" &&
      (fieldDefinition.minLength === undefined || textLength(value) >= fieldDefinition.minLength) &&
      (fieldDefinition.maxLength === undefined || textLength(value) <= fieldDefinition.maxLength),
    textarea: (fieldDefinition) =>
      typeof value === "string" &&
      (fieldDefinition.minLength === undefined || textLength(value) >= fieldDefinition.minLength) &&
      (fieldDefinition.maxLength === undefined || textLength(value) <= fieldDefinition.maxLength),
    url: (descriptor) => {
      if (descriptor.embedProviders === undefined) return isUrlFieldTarget(value);
      if (!isSafeUrl(value)) return false;
      const embed = parseVideoEmbed(value);
      return embed !== undefined && descriptor.embedProviders.includes(embed.provider);
    },
  });
}

/** A Valibot runtime schema compiled from a field definition. */
export type CompiledFieldSchema<Definition extends FieldDefinition> = v.BaseSchema<
  unknown,
  FieldValue<Definition>,
  v.BaseIssue<unknown>
>;

/** Compiles a field definition with the same normalization as aggregate validation. */
export function compileFieldSchema<Definition extends FieldDefinition>(
  definition: Definition,
  mode: ContentValidationMode = "publish",
): CompiledFieldSchema<Definition> {
  return v.pipe(
    v.custom<FieldValue<Definition>>((value) => {
      try {
        normalizeFieldValue(definition, value, mode, [], { count: 0 });
        return true;
      } catch (error) {
        if (error instanceof ContentValidationError) return false;
        throw error;
      }
    }),
    v.transform(
      (value) =>
        normalizeFieldValue(definition, value, mode, [], { count: 0 }) as FieldValue<Definition>,
    ),
  );
}

/** Validates and normalizes one present value; absence is handled by its field map. */
export function validateFieldValue<Definition extends FieldDefinition>(
  definition: Definition,
  value: unknown,
  path: readonly ValidationPathSegment[] = [],
  mode: ContentValidationMode = "publish",
): FieldValue<Definition> {
  return normalizeFieldValue(definition, value, mode, path, { count: 0 }) as FieldValue<Definition>;
}

/** The validation state of a content snapshot. */
export type ContentValidationMode = "draft" | "publish";

interface ListBudget {
  count: number;
}

function addListItems(
  length: number,
  path: readonly ValidationPathSegment[],
  budget: ListBudget,
): void {
  budget.count += length;
  if (budget.count > MAX_SNAPSHOT_LIST_ITEMS)
    invalid(
      path,
      "too_many_list_items",
      `must not exceed ${MAX_SNAPSHOT_LIST_ITEMS} list elements per snapshot.`,
    );
}

export function normalizeFieldValue(
  definition: FieldDefinition,
  value: unknown,
  mode: ContentValidationMode,
  path: readonly ValidationPathSegment[],
  budget: ListBudget,
): JsonValue {
  if (definition.type === "group") {
    if (!isRecord(value)) invalid(path, "invalid_field_value", "must be a group object.");
    return normalizeFieldMap(definition.fields, value, mode, path, budget, definition.visibility);
  }
  if (definition.type === "list") {
    if (!Array.isArray(value)) invalid(path, "invalid_field_value", "must be a list.");
    if (value.length > (definition.maxItems ?? MAX_LIST_ITEMS))
      invalid(
        path,
        "list_too_long",
        `must contain at most ${definition.maxItems ?? MAX_LIST_ITEMS} items.`,
      );
    if (mode === "publish" && value.length < (definition.minItems ?? 0))
      invalid(
        path,
        "list_too_short",
        `must contain at least ${definition.minItems} items for publication.`,
      );
    addListItems(value.length, path, budget);
    return Array.from({ length: value.length }, (_, index) => {
      if (!Object.hasOwn(value, index))
        invalid([...path, index], "invalid_field_value", "must contain a value.");
      return normalizeFieldValue(definition.item, value[index], mode, [...path, index], budget);
    });
  }
  if (!isFieldValue(definition, value))
    invalid(path, "invalid_field_value", "does not conform to its field definition.");
  return value as JsonValue;
}

function normalizeFieldMap(
  definitions: ModelFieldDefinitions,
  value: unknown,
  mode: ContentValidationMode,
  path: readonly ValidationPathSegment[],
  budget: ListBudget,
  visibility?: FieldVisibility,
): ModelFieldValues {
  if (!isRecord(value)) invalid(path, "invalid_fields", "must be an object.");
  for (const key of Object.keys(value))
    if (!Object.hasOwn(definitions, key))
      invalid([...path, key], "unknown_field", "is not defined by this model.");
  const normalized = new Map<string, JsonValue>();
  const normalize = (
    key: string,
    definition: FieldDefinition,
    fieldMode: ContentValidationMode,
  ) => {
    let present: unknown;
    if (Object.hasOwn(value, key)) present = value[key];
    else if (Object.hasOwn(definition, "defaultValue")) present = definition.defaultValue;
    else {
      if (fieldMode === "publish" && definition.required)
        invalid([...path, key], "missing_required_field", "is required for publication.");
      return;
    }
    normalized.set(
      key,
      normalizeFieldValue(definition, present, fieldMode, [...path, key], budget),
    );
  };
  const conditional = (key: string) => visibility !== undefined && Object.hasOwn(visibility, key);
  // Controllers are unconditional, so their normalized values decide every target.
  for (const [key, definition] of Object.entries(definitions))
    if (!conditional(key)) normalize(key, definition, mode);
  const controllers = effectiveVisibilityValues(
    definitions,
    visibility,
    Object.fromEntries(normalized),
  );
  for (const [key, definition] of Object.entries(definitions))
    if (conditional(key))
      normalize(key, definition, isFieldVisible(visibility, key, controllers) ? mode : "draft");
  const output: Record<string, JsonValue> = {};
  for (const key of Object.keys(definitions))
    if (normalized.has(key))
      Object.defineProperty(output, key, { value: normalized.get(key), enumerable: true });
  return output;
}

/** Validates field data for either an incomplete draft or a publish candidate. */
export function validateModelFields(
  definitions: ModelFieldDefinitions,
  value: unknown,
  mode: ContentValidationMode,
  path: readonly ValidationPathSegment[] = [],
  visibility?: FieldVisibility,
): ModelFieldValues {
  return normalizeFieldMap(definitions, value, mode, path, { count: 0 }, visibility);
}

/**
 * Removes every hidden target from already normalized values, recursively
 * through visible groups and list items, without inserting or reordering.
 */
export function publishedFieldValues(
  definitions: ModelFieldDefinitions,
  values: JsonObject,
  visibility?: FieldVisibility,
): JsonObject {
  const project = (definition: FieldDefinition, value: JsonValue): JsonValue => {
    if (definition.type === "group" && isRecord(value))
      return publishedFieldValues(definition.fields, value as JsonObject, definition.visibility);
    if (definition.type === "list" && Array.isArray(value))
      return value.map((item) => project(definition.item, item));
    return value;
  };
  const effective = effectiveVisibilityValues(definitions, visibility, values);
  const output: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!isFieldVisible(visibility, key, effective)) continue;
    const definition = Object.hasOwn(definitions, key) ? definitions[key] : undefined;
    Object.defineProperty(output, key, {
      value: definition === undefined ? value : project(definition, value),
      enumerable: true,
    });
  }
  return output;
}

/**
 * Whether an owner or any nested group, including list-item groups, declares
 * conditional-field rules, so its published projection can differ from its values.
 */
export function declaresFieldVisibility(
  definitions: ModelFieldDefinitions,
  visibility?: FieldVisibility,
): boolean {
  if (visibility !== undefined && Object.keys(visibility).length > 0) return true;
  const visit = (definition: FieldDefinition): boolean =>
    definition.type === "group"
      ? declaresFieldVisibility(definition.fields, definition.visibility)
      : definition.type === "list" && visit(definition.item);
  return Object.values(definitions).some(visit);
}

/** Checks already normalized model/block values against one snapshot-wide budget. */
export function validateSnapshotListBudget(
  fields: ModelFieldDefinitions,
  values: JsonObject,
  blocks: readonly {
    readonly fields: ModelFieldDefinitions;
    readonly data: JsonObject;
    readonly path: readonly ValidationPathSegment[];
  }[],
): void {
  const budget = { count: 0 };
  function count(
    definition: FieldDefinition,
    value: JsonValue | undefined,
    path: readonly ValidationPathSegment[],
  ): void {
    if (definition.type === "group" && isRecord(value))
      walk(definition.fields, value as JsonObject, path);
    if (definition.type === "list" && Array.isArray(value)) {
      addListItems(value.length, path, budget);
      value.forEach((item, index) => count(definition.item, item, [...path, index]));
    }
  }
  function walk(
    definitions: ModelFieldDefinitions,
    data: JsonObject,
    path: readonly ValidationPathSegment[],
  ): void {
    for (const [key, definition] of Object.entries(definitions))
      count(definition, data[key], [...path, key]);
  }
  walk(fields, values, ["fields"]);
  blocks.forEach((block) => walk(block.fields, block.data, block.path));
}

/** Raw UTF-16 units: the existing text/textarea length contract, without trimming. */
export function textLength(value: string): number {
  return value.length;
}

/** Trimmed Unicode code points: the existing SEO title/description contract. */
export function seoTextLength(value: string): number {
  return [...value.trim()].length;
}

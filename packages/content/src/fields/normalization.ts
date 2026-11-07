import { normalizeJsonValue } from "../shared/json.js";
import { fail, FieldConfigurationError, ContentValidationError } from "../shared/errors.js";
import { fieldTypeCapabilities } from "./capabilities.js";
import type {
  FieldDefinition,
  GroupFieldDefinition,
  ListFieldDefinition,
  BooleanFieldOptions,
  StringValueFieldOptions,
  NumberFieldOptions,
  RichTextFieldOptions,
  StringFieldOptions,
} from "./definitions.js";
import {
  MAX_FIELD_CONTAINER_DEPTH,
  MAX_CONSECUTIVE_GROUPS,
  FIELD_KEY_PATTERN,
  MAX_LIST_ITEMS,
} from "./definitions.js";
import { normalizeFieldValue } from "./validation.js";
import { deepFreeze } from "../shared/objects.js";
import { normalizeFormLayout } from "./layout.js";
import { normalizeFieldVisibility } from "./visibility.js";
import { descriptorRecord } from "./descriptor-record.js";
import {
  scalarField,
  normalizeOptions,
  addCommonOptions,
  readOptionalFiniteNumber,
} from "./scalar-builders.js";

export function normalizeCompositeOptions(
  type: GroupFieldDefinition["type"] | ListFieldDefinition["type"],
  value: unknown,
): FieldDefinition {
  const options = descriptorRecord(value, "options");
  if (Object.hasOwn(options, "type")) fail("options.type", "is not supported.");
  return normalizeFieldDefinition({ ...options, type });
}

/** Validates and detaches a descriptor, including forged JSON/configuration input. */
export function normalizeFieldDefinition(value: unknown): FieldDefinition {
  return normalizeDescriptor(value, "definition", 0, 0, new WeakSet<object>());
}

function normalizeDescriptor(
  value: unknown,
  path: string,
  depth: number,
  groups: number,
  ancestors: WeakSet<object>,
): FieldDefinition {
  const raw = descriptorRecord(value, path);
  if (ancestors.has(value as object)) fail(path, "must not contain a cyclic reference.");
  const { type, ...options } = raw;
  if (type !== "group" && type !== "list") {
    try {
      switch (type) {
        case "boolean":
          return scalarField.boolean(options as BooleanFieldOptions);
        case "date":
          return scalarField.date(options as StringValueFieldOptions);
        case "datetime":
          return scalarField.datetime(options as StringValueFieldOptions);
        case "media":
          return scalarField.media(options as StringValueFieldOptions);
        case "number":
          return scalarField.number(options as NumberFieldOptions);
        case "richText":
          return scalarField.richText(options as RichTextFieldOptions);
        case "select":
          return scalarField.select(
            options as { readonly options: readonly [string, ...string[]] },
          );
        case "text":
          return scalarField.text(options as StringFieldOptions);
        case "textarea":
          return scalarField.textarea(options as StringFieldOptions);
        case "url":
          return scalarField.url(options as StringValueFieldOptions);
        default:
          fail(`${path}.type`, "must name a supported field type.");
      }
    } catch (error) {
      if (error instanceof FieldConfigurationError) fail(path, error.message);
      throw error;
    }
  }
  if (depth >= MAX_FIELD_CONTAINER_DEPTH)
    fail(path, `must not exceed ${MAX_FIELD_CONTAINER_DEPTH} containers.`);
  if (type === "group" && groups >= MAX_CONSECUTIVE_GROUPS)
    fail(path, `must not exceed ${MAX_CONSECUTIVE_GROUPS} consecutive groups.`);
  const allowed = [
    "label",
    "description",
    "required",
    "defaultValue",
    "renamedFrom",
    ...(type === "group"
      ? ["fields", "layout", "visibility"]
      : ["item", "minItems", "maxItems", "itemLabel"]),
  ];
  for (const key of Object.keys(options))
    if (!allowed.includes(key)) fail(`${path}.${key}`, "is not supported by this field type.");
  const { fields, item, defaultValue, ...common } = options;
  const normalized = normalizeOptions(common);
  const result: Record<string, unknown> = { type };
  addCommonOptions(result, normalized);
  ancestors.add(value as object);
  try {
    if (type === "group") {
      const children = descriptorRecord(fields, `${path}.fields`);
      const output: Record<string, FieldDefinition> = {};
      for (const [key, child] of Object.entries(children)) {
        if (!FIELD_KEY_PATTERN.test(key))
          fail(`${path}.fields.${key}`, "must be a valid field key.");
        Object.defineProperty(output, key, {
          value: normalizeDescriptor(
            child,
            `${path}.fields.${key}`,
            depth + 1,
            groups + 1,
            ancestors,
          ),
          enumerable: true,
        });
      }
      result.fields = output;
      const layout = normalizeFormLayout(options.layout, output, `${path}.layout`);
      if (layout !== undefined) result.layout = layout;
      const visibility = normalizeFieldVisibility(options.visibility, output, `${path}.visibility`);
      if (visibility !== undefined) result.visibility = visibility;
    } else {
      const child = descriptorRecord(item, `${path}.item`);
      if (child.type === "list") fail(`${path}.item`, "must not be a direct list of lists.");
      if (Object.hasOwn(child, "renamedFrom"))
        fail(
          `${path}.item.renamedFrom`,
          "list item descriptors have no field key and cannot be renamed.",
        );
      result.item = normalizeDescriptor(item, `${path}.item`, depth + 1, 0, ancestors);
      if (Object.hasOwn(options, "itemLabel")) {
        const key = options.itemLabel;
        const itemDefinition = result.item as FieldDefinition;
        if (
          typeof key !== "string" ||
          !FIELD_KEY_PATTERN.test(key) ||
          itemDefinition.type !== "group" ||
          !Object.hasOwn(itemDefinition.fields, key) ||
          !fieldTypeCapabilities[itemDefinition.fields[key]!.type].itemLabel
        )
          fail(
            `${path}.itemLabel`,
            "must name an immediate text, textarea, select or URL group child.",
          );
        result.itemLabel = key;
      }
      const min = readOptionalFiniteNumber(normalized, "minItems", true);
      const max = readOptionalFiniteNumber(normalized, "maxItems", true);
      if ((min ?? 0) > (max ?? MAX_LIST_ITEMS) || (max ?? MAX_LIST_ITEMS) > MAX_LIST_ITEMS)
        fail(path, `list bounds must satisfy 0 ≤ minItems ≤ maxItems ≤ ${MAX_LIST_ITEMS}.`);
      if (min !== undefined) result.minItems = min;
      if (max !== undefined) result.maxItems = max;
    }
    if (Object.hasOwn(options, "defaultValue")) {
      const portableDefault = normalizeJsonValue(defaultValue, `${path}.defaultValue`);
      try {
        normalizeFieldValue(result as unknown as FieldDefinition, portableDefault, "draft", [], {
          count: 0,
        });
      } catch (error) {
        if (error instanceof ContentValidationError) fail(`${path}.defaultValue`, error.message);
        throw error;
      }
      result.defaultValue = portableDefault;
    }
    return deepFreeze(result) as unknown as FieldDefinition;
  } finally {
    ancestors.delete(value as object);
  }
}

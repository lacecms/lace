import { deepFreeze } from "@lacecms/content";
import type { BlockRegistry, JsonObject, JsonValue } from "@lacecms/content";
import type { ContentModelDefinition, ContentModelStructure } from "../models/types.js";
import { modelForHash } from "./hash-input.js";
import type { MutableJsonObject, MutableJsonValue } from "./hash-input.js";

export function omitDisplayMetadata(value: JsonValue): MutableJsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(omitDisplayMetadata);
  }
  const projection: MutableJsonObject = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (key !== "description" && key !== "label") {
      projection[key] = omitDisplayMetadata(nestedValue);
    }
  }
  return projection;
}

/**
 * Removes model-level presentation metadata that must not affect structural
 * identity: `listFields`, the SEO fallback mapping (only whether SEO is enabled
 * is structural) and `seoDefaults`.
 */
export function omitListFields(model: JsonValue): JsonValue {
  if (model === null || typeof model !== "object" || Array.isArray(model)) {
    return model;
  }
  const {
    listFields: _listFields,
    listOptions: _listOptions,
    layout: _layout,
    seo,
    seoDefaults: _seoDefaults,
    ...structure
  } = model as JsonObject;
  return seo === undefined ? structure : { ...structure, seo: true };
}

/**
 * Descriptor keys that carry presentation only, by descriptor owner. Models
 * drop the shared display keys; blocks also drop their settings visibility;
 * fields drop placeholders, select presentation and list item labels; block
 * settings and placeholder-free field maps keep labels and descriptions but
 * drop placeholders, select presentation and group layout.
 */
export const DISPLAY_ONLY_KEYS = deepFreeze({
  model: ["description", "label", "layout", "settingsLayout"],
  block: ["description", "label", "layout", "settingsLayout", "settingsVisibility"],
  field: [
    "description",
    "label",
    "layout",
    "settingsLayout",
    "placeholder",
    "presentation",
    "itemLabel",
  ],
  setting: ["placeholder", "presentation", "layout"],
} as const satisfies Record<"model" | "block" | "field" | "setting", readonly string[]>);

function withoutKeys(value: JsonValue, owner: keyof typeof DISPLAY_ONLY_KEYS): MutableJsonObject {
  const result = JSON.parse(JSON.stringify(value)) as MutableJsonObject;
  for (const key of DISPLAY_ONLY_KEYS[owner]) delete result[key];
  return result;
}

export function withoutDisplayProperties(value: JsonValue): MutableJsonObject {
  return withoutKeys(value, "model");
}

function fieldDefinitionStructure(definition: JsonValue): MutableJsonObject {
  const result = withoutKeys(definition, "field");
  if (result.type === "group") result.fields = fieldMapStructure(result.fields);
  if (result.type === "list" && result.item !== undefined)
    result.item = fieldDefinitionStructure(result.item);
  return result;
}

export function fieldMapWithoutPlaceholders(fields: JsonValue | undefined): MutableJsonObject {
  return Object.fromEntries(
    Object.entries((fields ?? {}) as JsonObject).map(([key, value]) => {
      const result = withoutKeys(value, "setting");
      if (result.type === "group") result.fields = fieldMapWithoutPlaceholders(result.fields);
      if (result.type === "list" && result.item !== undefined)
        result.item = fieldMapWithoutPlaceholders({ item: result.item }).item!;
      return [key, result];
    }),
  );
}

export function fieldMapStructure(fields: JsonValue | undefined): MutableJsonObject {
  const structure: MutableJsonObject = {};
  for (const [key, definition] of Object.entries((fields ?? {}) as JsonObject)) {
    structure[key] = fieldDefinitionStructure(definition);
  }
  return structure;
}

export function blockWithoutVisibility(definition: JsonValue): MutableJsonObject {
  return withoutKeys(definition, "block");
}

/**
 * Builds the canonical structure of a model. Display metadata is removed only
 * from the model, field, block, and block-field definitions, so field keys and
 * default values named `label` or `description` remain structural.
 */
export function contentModelStructure(
  model: ContentModelDefinition,
  registry: BlockRegistry,
): ContentModelStructure {
  const projection = modelForHash(model, registry) as JsonObject;
  const structure = withoutDisplayProperties(omitListFields(projection));
  structure.fields = fieldMapStructure(projection.fields);
  structure.blockDefinitions = (projection.blockDefinitions as readonly JsonObject[]).map(
    (definition) => ({
      ...blockWithoutVisibility(definition),
      fields: fieldMapStructure(definition.fields),
      ...(definition.settings === undefined
        ? {}
        : { settings: fieldMapWithoutPlaceholders(definition.settings) }),
    }),
  );
  return deepFreeze(structure) as ContentModelStructure;
}

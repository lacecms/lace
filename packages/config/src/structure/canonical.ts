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

/** The pre-baseline structural value, kept only to recognise legacy stored hashes. */
export function legacyStructureForHash(projection: JsonValue): MutableJsonValue {
  const strip = (owner: JsonValue, block = false): JsonValue => {
    const result = { ...(owner as JsonObject) };
    delete result.layout;
    delete result.settingsLayout;
    if (block) delete result.settingsVisibility;
    const fieldMap = (map: JsonValue): JsonValue =>
      Object.fromEntries(
        Object.entries(map as JsonObject).map(([key, descriptor]) => {
          const child = { ...(descriptor as JsonObject) };
          if (child.type === "group") {
            delete child.layout;
            child.fields = fieldMap(child.fields!);
          }
          if (child.type === "list")
            child.item = (fieldMap({ item: child.item! }) as JsonObject).item!;
          return [key, child];
        }),
      );
    if (result.fields) result.fields = fieldMap(result.fields);
    if (result.settings) result.settings = fieldMap(result.settings);
    if (Array.isArray(result.blockDefinitions))
      result.blockDefinitions = result.blockDefinitions.map((definition) =>
        strip(definition, true),
      );
    return result;
  };
  return omitDisplayMetadata(strip(omitListFields(projection)));
}

export function withoutDisplayProperties(value: JsonValue): MutableJsonObject {
  const {
    description: _description,
    label: _label,
    layout: _layout,
    settingsLayout: _settingsLayout,
    ...rest
  } = value as JsonObject;
  return JSON.parse(JSON.stringify(rest)) as MutableJsonObject;
}

function fieldDefinitionStructure(definition: JsonValue): MutableJsonObject {
  const result = withoutDisplayProperties(definition);
  delete result.placeholder;
  if (result.type === "select") delete result.presentation;
  if (result.type === "group") result.fields = fieldMapStructure(result.fields);
  if (result.type === "list") {
    delete result.itemLabel;
    if (result.item !== undefined) result.item = fieldDefinitionStructure(result.item);
  }
  return result;
}

export function fieldMapWithoutPlaceholders(fields: JsonValue | undefined): MutableJsonObject {
  return Object.fromEntries(
    Object.entries((fields ?? {}) as JsonObject).map(([key, value]) => {
      const result = JSON.parse(JSON.stringify(value)) as MutableJsonObject;
      delete result.placeholder;
      if (result.type === "select") delete result.presentation;
      if (result.type === "group") {
        delete result.layout;
        result.fields = fieldMapWithoutPlaceholders(result.fields);
      }
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
  const result = withoutDisplayProperties(definition);
  delete result.settingsVisibility;
  return result;
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

import {
  BLOCK_TYPE_PATTERN,
  canonicalizeJson,
  defineBlock,
  FIELD_KEY_PATTERN,
  normalizeFieldDefinition,
  toBlockMetadata,
} from "@lacecms/content";
import type {
  BlockMetadata,
  FieldMetadata,
  FieldVisibility,
  FormLayout,
  JsonValue,
} from "@lacecms/content";
import * as v from "valibot";
import { isJsonObject } from "../shared/json.js";

export type FieldMetadataMapDto = Readonly<Record<string, FieldMetadata>>;

function isFieldMetadata(value: unknown): value is FieldMetadata {
  try {
    const normalized = normalizeFieldDefinition(value);
    return (
      canonicalizeJson(value as JsonValue) === canonicalizeJson(normalized as unknown as JsonValue)
    );
  } catch {
    return false;
  }
}

function isFieldMetadataMap(value: unknown): value is FieldMetadataMapDto {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) &&
    Object.getOwnPropertySymbols(value).length === 0 &&
    Object.entries(Object.getOwnPropertyDescriptors(value)).every(
      ([key, descriptor]) =>
        FIELD_KEY_PATTERN.test(key) &&
        descriptor.enumerable &&
        "value" in descriptor &&
        isFieldMetadata(descriptor.value),
    )
  );
}

function isBlockMetadata(value: unknown): value is BlockMetadata {
  if (!isJsonObject(value)) return false;
  const allowedKeys = new Set([
    "defaultValue",
    "description",
    "fields",
    "label",
    "settings",
    "layout",
    "settingsLayout",
    "settingsVisibility",
    "type",
    "version",
    "visibility",
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return false;
  if (
    typeof value.type !== "string" ||
    !BLOCK_TYPE_PATTERN.test(value.type) ||
    typeof value.version !== "number" ||
    !Number.isSafeInteger(value.version) ||
    value.version < 1 ||
    (value.label !== undefined && typeof value.label !== "string") ||
    (value.description !== undefined && typeof value.description !== "string") ||
    !isFieldMetadataMap(value.fields) ||
    (value.settings !== undefined && !isFieldMetadataMap(value.settings)) ||
    (value.defaultValue !== undefined && !isJsonObject(value.defaultValue))
  ) {
    return false;
  }
  try {
    const normalized = defineBlock({
      ...(value.defaultValue === undefined ? {} : { defaultValue: value.defaultValue }),
      ...(value.description === undefined ? {} : { description: value.description }),
      fields: value.fields,
      ...(value.label === undefined ? {} : { label: value.label }),
      ...(value.layout === undefined ? {} : { layout: value.layout as unknown as FormLayout }),
      ...(value.settingsLayout === undefined
        ? {}
        : { settingsLayout: value.settingsLayout as unknown as FormLayout }),
      ...(value.settingsVisibility === undefined
        ? {}
        : {
            settingsVisibility:
              value.settingsVisibility as import("@lacecms/content").SettingsVisibility,
          }),
      ...(value.settings === undefined ? {} : { settings: value.settings }),
      type: value.type,
      version: value.version,
      ...(value.visibility === undefined
        ? {}
        : { visibility: value.visibility as unknown as FieldVisibility }),
    });
    return (
      canonicalizeJson(value) ===
      canonicalizeJson(toBlockMetadata(normalized) as unknown as JsonValue)
    );
  } catch {
    return false;
  }
}

/** Validated, executable-value-free metadata used to render browser form fields. */
export const fieldMetadataSchema = v.custom<FieldMetadata>(isFieldMetadata);
export const fieldMetadataMapSchema = v.custom<FieldMetadataMapDto>(isFieldMetadataMap);
/** Validated executable-value-free metadata used to render generic block forms. */
export const blockMetadataSchema = v.custom<BlockMetadata>(isBlockMetadata);
/** Model-level conditional-field rules; the model schema checks them against its fields. */
export const fieldVisibilitySchema = v.custom<FieldVisibility>((value) => isJsonObject(value));

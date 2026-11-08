import { normalizeJsonValue } from "../shared/json.js";
import { fail } from "../shared/errors.js";
import { isRecord, deepFreeze } from "../shared/objects.js";
import type { FieldType } from "../fields/capabilities.js";
import type { FieldDefinition, ModelFieldDefinitions } from "../fields/definitions.js";
import type { SettingsVisibility } from "./types.js";
import { normalizeBlockFields } from "./fields.js";
import { blockFail } from "./errors.js";

/** Field types a block setting may use; every setting declares a default. */
export const BLOCK_SETTING_FIELD_TYPES = Object.freeze([
  "boolean",
  "number",
  "select",
  "text",
] as const satisfies readonly FieldType[]);

/** Validates and detaches settings-only visibility metadata. */
export function normalizeSettingsVisibility<Key extends string>(
  value: unknown,
  settings: Readonly<Record<Key, FieldDefinition>>,
  path = "settingsVisibility",
): SettingsVisibility<Key> | undefined {
  if (value === undefined) return undefined;
  const raw = normalizeJsonValue(value, path);
  if (!isRecord(raw)) fail(path, "must be a plain object of setting rules.");
  for (const [target, rule] of Object.entries(raw)) {
    const at = `${path}.${target}`;
    if (!Object.hasOwn(settings, target)) fail(at, "must target a declared scalar setting.");
    if (
      !isRecord(rule) ||
      Object.keys(rule).some((key) => !["setting", "values"].includes(key)) ||
      typeof rule.setting !== "string"
    )
      fail(at, "must contain only setting and values.");
    if (rule.setting === target || Object.hasOwn(raw, rule.setting))
      fail(
        `${at}.setting`,
        "must be an unconditional sibling select; self references, chains and cycles are not allowed.",
      );
    const controller = Object.hasOwn(settings, rule.setting)
      ? settings[rule.setting as Key]
      : undefined;
    if (
      controller?.type !== "select" ||
      !controller.required ||
      !Object.hasOwn(controller, "defaultValue") ||
      typeof controller.defaultValue !== "string" ||
      !controller.options.includes(controller.defaultValue)
    )
      fail(`${at}.setting`, "must name a required select setting with a valid default.");
    if (
      !Array.isArray(rule.values) ||
      rule.values.length === 0 ||
      new Set(rule.values).size !== rule.values.length ||
      rule.values.some(
        (option) => typeof option !== "string" || !controller.options.includes(option),
      )
    )
      fail(`${at}.values`, "must be a nonempty unique subset of the controller options.");
  }
  return deepFreeze(raw) as unknown as SettingsVisibility<Key>;
}

const SETTING_TYPES: ReadonlySet<string> = new Set(BLOCK_SETTING_FIELD_TYPES);

/** Normalizes declared settings; an empty map yields none. */
export function normalizeBlockSettings(value: unknown): ModelFieldDefinitions | undefined {
  if (value === undefined) return undefined;
  const settings = normalizeBlockFields(value, "settings");
  for (const [key, definition] of Object.entries(settings)) {
    if (!SETTING_TYPES.has(definition.type)) {
      blockFail(`settings.${key} must be a select, boolean, number or text field.`);
    }
    if (!Object.hasOwn(definition, "defaultValue")) {
      blockFail(`settings.${key} must declare a defaultValue.`);
    }
  }
  return Object.keys(settings).length === 0 ? undefined : settings;
}

import type { JsonObject } from "../shared/json.js";
import { normalizeJsonValue } from "../shared/json.js";
import type { ContentValidationMode } from "../fields/validation.js";
import { publishedFieldValues, validateModelFields } from "../fields/validation.js";
import type {
  FieldVisibility,
  FieldDefinition,
  ModelFieldDefinitions,
  FormLayout,
  FieldValue,
  BlockDataValues,
} from "../fields/definitions.js";
import { FIELD_KEY_PATTERN } from "../fields/definitions.js";
import type { ValidationPathSegment } from "../shared/errors.js";
import {
  LaceError,
  fail,
  FieldConfigurationError,
  ContentValidationError,
  invalid,
} from "../shared/errors.js";
import type { FieldType } from "../fields/capabilities.js";
import { isRecord, deepFreeze } from "../shared/objects.js";
import { toFieldMetadata } from "../fields/builders.js";
import { normalizeFormLayout } from "../fields/layout.js";
import { normalizeFieldVisibility } from "../fields/visibility.js";

/** The published projection of one block's normalized data. */
export function publishedBlockData(definition: BlockMetadata, data: JsonObject): JsonObject {
  return publishedFieldValues(definition.fields, data, definition.visibility as FieldVisibility);
}

/** Block type grammar without anchors, for OpenAPI strings and composed grammars. */
export const BLOCK_TYPE_SOURCE = "[A-Za-z][A-Za-z0-9-]*";
/** Block types: an ASCII letter followed by ASCII letters, digits or hyphens. */
export const BLOCK_TYPE_PATTERN = new RegExp(`^${BLOCK_TYPE_SOURCE}$`, "u");
/** A block instance key: a block type or a ULID. */
export const BLOCK_KEY_PATTERN = new RegExp(
  `^(?:${BLOCK_TYPE_SOURCE}|[0-7][0-9A-HJKMNP-TV-Z]{25})$`,
  "u",
);

/** Maximum length of a block anchor. */
export const MAX_BLOCK_ANCHOR_LENGTH = 64;
/** Maximum length of a normalized block class name. */
export const MAX_BLOCK_CLASS_NAME_LENGTH = 256;
/** Maximum number of class tokens in a block class name. */
export const MAX_BLOCK_CLASS_TOKENS = 16;
/** Maximum length of one block class token. */
export const MAX_BLOCK_CLASS_TOKEN_LENGTH = 64;

const BLOCK_ANCHOR_PATTERN = /^[a-z][a-z0-9-]{0,63}$/u;
const BLOCK_CLASS_TOKEN_PATTERN = /^[A-Za-z_-][A-Za-z0-9_\-:/.%#[\]]*$/u;

/** Whether a value is a block anchor: a lowercase letter, then lowercase letters, digits and hyphens. */
export function isBlockAnchor(value: unknown): value is string {
  return typeof value === "string" && BLOCK_ANCHOR_PATTERN.test(value);
}

/**
 * Normalizes a block class name: whitespace-separated class tokens, repeats
 * dropped, joined with single spaces. Returns `undefined` for a non-string,
 * blank or invalid value.
 */
export function normalizeBlockClassName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const tokens = [...new Set(value.split(/[\t\n\f\r ]+/u).filter((token) => token !== ""))];
  if (
    tokens.length === 0 ||
    tokens.length > MAX_BLOCK_CLASS_TOKENS ||
    tokens.some(
      (token) =>
        token.length > MAX_BLOCK_CLASS_TOKEN_LENGTH || !BLOCK_CLASS_TOKEN_PATTERN.test(token),
    )
  ) {
    return undefined;
  }
  const normalized = tokens.join(" ");
  return normalized.length > MAX_BLOCK_CLASS_NAME_LENGTH ? undefined : normalized;
}

/** Thrown when a block definition or registry is not portable or internally consistent. */
export class BlockConfigurationError extends LaceError<"BLOCK_CONFIGURATION_INVALID"> {
  public constructor(message: string) {
    super("BLOCK_CONFIGURATION_INVALID", message);
    this.name = "BlockConfigurationError";
  }
}

/** The stored data and settings a block migration step receives. */
export interface BlockMigrationInput {
  readonly data: JsonObject;
  readonly settings: JsonObject;
}

/** A migration step's result; leaving out `settings` keeps the input settings. */
export interface BlockMigrationOutput {
  readonly data: JsonObject;
  readonly settings?: JsonObject;
}

/**
 * A pure, synchronous step that turns the stored data and settings of the
 * previous block version into those of its target version.
 */
export type BlockMigration = (block: BlockMigrationInput) => BlockMigrationOutput;

/** Migrations keyed by target version; the keys form one range ending at the block version. */
export type BlockMigrations = Readonly<Record<number, BlockMigration>>;

/** Field types a block setting may use; every setting declares a default. */
export const BLOCK_SETTING_FIELD_TYPES = Object.freeze([
  "boolean",
  "number",
  "select",
  "text",
] as const satisfies readonly FieldType[]);

/** The settings of a block that declares none. */
export type NoBlockSettings = Readonly<Record<never, FieldDefinition>>;

/** Bounded presentation rules over unconditional sibling select settings. */
export type SettingsVisibility<Key extends string = string> = Readonly<
  Partial<
    Record<
      Key,
      {
        readonly setting: Key;
        readonly values: readonly string[];
      }
    >
  >
>;

/** Validates and detaches settings-only visibility metadata. */
export function normalizeSettingsVisibility<Key extends string>(
  value: unknown,
  settings: Readonly<Record<Key, FieldDefinition>>,
  path = "settingsVisibility",
): SettingsVisibility<Key> | undefined {
  if (value === undefined) return undefined;
  const raw = normalizeJsonValue(value, path, new WeakSet<object>());
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

/** Input accepted by the portable block-definition DSL. */
export interface BlockDefinitionInput<
  Fields extends ModelFieldDefinitions = ModelFieldDefinitions,
  Settings extends ModelFieldDefinitions = ModelFieldDefinitions,
> {
  readonly defaultValue?: unknown;
  readonly description?: string;
  readonly fields: Fields;
  readonly layout?: FormLayout<keyof Fields & string>;
  readonly settingsLayout?: FormLayout<keyof Settings & string>;
  readonly settingsVisibility?: SettingsVisibility<keyof Settings & string>;
  /** Conditional-field rules over block data fields; settings use `settingsVisibility`. */
  readonly visibility?: FieldVisibility<Fields>;
  readonly label?: string;
  /** Data and settings migrations from earlier versions, keyed by target version. */
  readonly migrations?: BlockMigrations;
  /** Presentational settings: `select`, `boolean`, `number` or `text` fields with defaults. */
  readonly settings?: Settings;
  readonly type: string;
  readonly version: number;
}

/** The settings record of a block; every setting has a default, so every key is present. */
export type BlockSettingsValues<Settings extends ModelFieldDefinitions> = Readonly<{
  [Key in keyof Settings]: FieldValue<Settings[Key]>;
}>;

/** A detached JSON-safe representation of a block definition. */
export interface BlockMetadata<
  Fields extends ModelFieldDefinitions = ModelFieldDefinitions,
  Settings extends ModelFieldDefinitions = ModelFieldDefinitions,
  Visibility = undefined,
> {
  readonly defaultValue?: BlockDataValues<Fields, Visibility>;
  readonly description?: string;
  readonly fields: Fields;
  readonly layout?: FormLayout<keyof Fields & string>;
  readonly settingsLayout?: FormLayout<keyof Settings & string>;
  readonly settingsVisibility?: SettingsVisibility<keyof Settings & string>;
  /** Conditional-field rules over block data fields. */
  readonly visibility?: FieldVisibility<Fields>;
  readonly label?: string;
  /** Declared settings; absent when the block declares none. */
  readonly settings?: Settings;
  readonly type: string;
  readonly version: number;
}

/** An executable block definition retained only in the runtime projection. */
export interface BlockDefinition<
  Fields extends ModelFieldDefinitions = ModelFieldDefinitions,
  Settings extends ModelFieldDefinitions = ModelFieldDefinitions,
  Visibility = undefined,
> extends BlockMetadata<Fields, Settings, Visibility> {
  /** Runtime-only migrations keyed by target version; never part of metadata. */
  readonly migrations?: BlockMigrations;
  readonly validate: (
    value: unknown,
    mode: ContentValidationMode,
  ) => BlockDataValues<Fields, Visibility>;
}

function blockFail(message: string): never {
  throw new BlockConfigurationError(message);
}

function normalizeBlockFields(value: unknown, name = "fields"): ModelFieldDefinitions {
  if (!isRecord(value)) {
    blockFail(`${name} must be a plain object.`);
  }
  const fields: Record<string, FieldDefinition> = {};
  for (const [key, definition] of Object.entries(value)) {
    if (!FIELD_KEY_PATTERN.test(key)) {
      blockFail(`${name}.${key} must be a valid field key.`);
    }
    try {
      const metadata = toFieldMetadata(definition as FieldDefinition);
      const rejectHints = (field: FieldDefinition, path: string): void => {
        if (Object.hasOwn(field, "renamedFrom"))
          blockFail(`${path} must not declare renamedFrom; block data changes use block versions.`);
        if (field.type === "group")
          for (const [childKey, child] of Object.entries(field.fields))
            rejectHints(child, `${path}.fields.${childKey}`);
        if (field.type === "list") rejectHints(field.item, `${path}.item`);
      };
      rejectHints(metadata, `${name}.${key}`);
      fields[key] = metadata;
    } catch (error) {
      if (error instanceof FieldConfigurationError) {
        blockFail(`${name}.${key} must be a field definition.`);
      }
      throw error;
    }
  }
  return deepFreeze(fields);
}

const SETTING_TYPES: ReadonlySet<string> = new Set(BLOCK_SETTING_FIELD_TYPES);

/** Normalizes declared settings; an empty map yields none. */
function normalizeBlockSettings(value: unknown): ModelFieldDefinitions | undefined {
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

const MIGRATION_KEY_PATTERN = /^[1-9][0-9]*$/u;

function normalizeBlockMigrations(value: unknown, version: number): BlockMigrations | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    blockFail("migrations must be a plain object keyed by target version.");
  }
  const keys = Object.keys(value);
  if (keys.length === 0) return undefined;
  const targets: number[] = [];
  for (const key of keys) {
    const target = Number(key);
    if (!MIGRATION_KEY_PATTERN.test(key) || !Number.isSafeInteger(target)) {
      blockFail(`migrations.${key} must be keyed by an integer target version.`);
    }
    if (target < 2 || target > version) {
      blockFail(`migrations.${key} must target a version from 2 to ${version}.`);
    }
    if (typeof value[key] !== "function") {
      blockFail(`migrations.${key} must be a function.`);
    }
    targets.push(target);
  }
  targets.sort((left, right) => left - right);
  if (targets.at(-1) !== version) {
    blockFail(`migrations must include the current version ${version}.`);
  }
  for (let index = 1; index < targets.length; index += 1) {
    if (targets[index] !== targets[index - 1]! + 1) {
      blockFail(`migrations.${targets[index - 1]! + 1} is missing; migrations must be contiguous.`);
    }
  }
  return Object.freeze(
    Object.fromEntries(targets.map((target) => [target, value[String(target)] as BlockMigration])),
  );
}

/** Defines a versioned block using only portable field descriptors. */
export function defineBlock<
  const Fields extends ModelFieldDefinitions,
  const Settings extends ModelFieldDefinitions = NoBlockSettings,
  const Visibility extends FieldVisibility<Fields> | undefined = undefined,
>(
  input: BlockDefinitionInput<Fields, Settings> & { readonly visibility?: Visibility },
): BlockDefinition<Fields, Settings, Visibility> {
  if (!isRecord(input)) {
    blockFail("block must be a plain object.");
  }
  for (const key of Object.keys(input)) {
    if (
      !new Set([
        "defaultValue",
        "description",
        "fields",
        "label",
        "migrations",
        "layout",
        "settingsLayout",
        "settingsVisibility",
        "settings",
        "type",
        "version",
        "visibility",
      ]).has(key)
    ) {
      blockFail(`block.${key} is not permitted.`);
    }
  }
  if (typeof input.type !== "string" || !BLOCK_TYPE_PATTERN.test(input.type)) {
    blockFail(
      "type must begin with an ASCII letter and contain only letters, digits, and hyphens.",
    );
  }
  if (
    typeof input.version !== "number" ||
    !Number.isSafeInteger(input.version) ||
    input.version < 1
  ) {
    blockFail("version must be a positive integer.");
  }
  if (input.label !== undefined && typeof input.label !== "string") {
    blockFail("label must be a string when provided.");
  }
  if (input.description !== undefined && typeof input.description !== "string") {
    blockFail("description must be a string when provided.");
  }

  const fields = normalizeBlockFields(input.fields) as Fields;
  const migrations = normalizeBlockMigrations(input.migrations, input.version);
  const settings = normalizeBlockSettings(input.settings) as Settings | undefined;
  const layout = normalizeFormLayout(input.layout, fields, `block.${input.type}.layout`);
  const settingsLayout = normalizeFormLayout(
    input.settingsLayout,
    settings ?? {},
    `block.${input.type}.settingsLayout`,
  );
  const settingsVisibility = normalizeSettingsVisibility(
    input.settingsVisibility,
    settings ?? {},
    `block.${input.type}.settingsVisibility`,
  );
  const visibility = normalizeFieldVisibility(
    input.visibility,
    fields,
    `block.${input.type}.visibility`,
  ) as FieldVisibility<Fields> | undefined;
  let defaultValue: BlockDataValues<Fields, Visibility> | undefined;
  if (input.defaultValue !== undefined) {
    try {
      const normalized = normalizeJsonValue(
        input.defaultValue,
        "defaultValue",
        new WeakSet<object>(),
      );
      if (!isRecord(normalized)) {
        blockFail("defaultValue must be a plain object.");
      }
      defaultValue = deepFreeze(
        validateModelFields(fields, normalized, "draft", [], visibility as FieldVisibility),
      ) as BlockDataValues<Fields, Visibility>;
    } catch (error) {
      if (error instanceof ContentValidationError) {
        blockFail("defaultValue must conform to the block fields.");
      }
      throw error;
    }
  }
  const definition: BlockDefinition<Fields, Settings, Visibility> = {
    ...(defaultValue === undefined ? {} : { defaultValue }),
    ...(input.description === undefined ? {} : { description: input.description }),
    fields,
    ...(input.label === undefined ? {} : { label: input.label }),
    ...(migrations === undefined ? {} : { migrations }),
    ...(layout === undefined ? {} : { layout }),
    ...(settingsLayout === undefined ? {} : { settingsLayout }),
    ...(settingsVisibility === undefined ? {} : { settingsVisibility }),
    ...(settings === undefined ? {} : { settings }),
    type: input.type,
    validate: (value, mode) => {
      const rules = visibility as FieldVisibility | undefined;
      if (!isRecord(value)) {
        return validateModelFields(fields, value, mode, [], rules) as BlockDataValues<
          Fields,
          Visibility
        >;
      }
      const withDefault = defaultValue === undefined ? value : { ...defaultValue, ...value };
      return validateModelFields(fields, withDefault, mode, [], rules) as BlockDataValues<
        Fields,
        Visibility
      >;
    },
    version: input.version,
    ...(visibility === undefined ? {} : { visibility }),
  };
  return deepFreeze(definition);
}

/** Projects a block definition into detached, JSON-safe metadata. */
export function toBlockMetadata(definition: BlockDefinition): BlockMetadata {
  const metadata: BlockMetadata = {
    ...(definition.defaultValue === undefined ? {} : { defaultValue: definition.defaultValue }),
    ...(definition.description === undefined ? {} : { description: definition.description }),
    fields: Object.fromEntries(
      Object.entries(definition.fields).map(([key, fieldDefinition]) => [
        key,
        toFieldMetadata(fieldDefinition),
      ]),
    ),
    ...(definition.label === undefined ? {} : { label: definition.label }),
    ...(definition.layout === undefined
      ? {}
      : { layout: normalizeFormLayout(definition.layout, definition.fields)! }),
    ...(definition.settingsLayout === undefined
      ? {}
      : {
          settingsLayout: normalizeFormLayout(
            definition.settingsLayout,
            definition.settings ?? {},
          )!,
        }),
    ...(definition.settingsVisibility === undefined
      ? {}
      : {
          settingsVisibility: normalizeSettingsVisibility(
            definition.settingsVisibility,
            definition.settings ?? {},
          )!,
        }),
    ...(definition.settings === undefined
      ? {}
      : {
          settings: Object.fromEntries(
            Object.entries(definition.settings).map(([key, fieldDefinition]) => [
              key,
              toFieldMetadata(fieldDefinition),
            ]),
          ),
        }),
    type: definition.type,
    version: definition.version,
    ...(definition.visibility === undefined
      ? {}
      : { visibility: normalizeFieldVisibility(definition.visibility, definition.fields)! }),
  };
  return deepFreeze(metadata);
}

/** A registry of the current executable definition for every allowed block type. */
export interface BlockRegistry {
  readonly blocks: readonly BlockDefinition[];
  readonly get: (type: string) => BlockDefinition | undefined;
}

/** Creates a registry and rejects duplicate current block types. */
export function defineBlockRegistry(blocks: readonly BlockDefinition[]): BlockRegistry {
  if (!Array.isArray(blocks)) {
    blockFail("blocks must be an array of block definitions.");
  }
  const definitions = new Map<string, BlockDefinition>();
  for (const definition of blocks) {
    if (definitions.has(definition.type)) {
      blockFail(`blocks contains duplicate block type "${definition.type}".`);
    }
    definitions.set(definition.type, definition);
  }
  const normalized = deepFreeze([...definitions.values()]);
  return Object.freeze({ blocks: normalized, get: (type: string) => definitions.get(type) });
}

/** Projects a registry to immutable JSON-safe metadata for admin and public clients. */
export function toBlockRegistryMetadata(registry: BlockRegistry): readonly BlockMetadata[] {
  return deepFreeze(registry.blocks.map(toBlockMetadata));
}

/** Validates one block's field record, applying its whole-record default first. */
export function validateBlockData<Fields extends ModelFieldDefinitions>(
  definition: BlockDefinition<Fields>,
  value: unknown,
  mode: ContentValidationMode,
  path: readonly ValidationPathSegment[] = [],
): BlockDataValues<Fields> {
  const rules = definition.visibility as FieldVisibility | undefined;
  if (!isRecord(value)) {
    return validateModelFields(
      definition.fields,
      value,
      mode,
      path,
      rules,
    ) as BlockDataValues<Fields>;
  }
  const withDefault =
    definition.defaultValue === undefined ? value : { ...definition.defaultValue, ...value };
  return validateModelFields(
    definition.fields,
    withDefault,
    mode,
    path,
    rules,
  ) as BlockDataValues<Fields>;
}

/**
 * Validates a block's settings record against its declared settings, filling
 * every default; a block that declares none accepts only `{}`.
 */
export function validateBlockSettings(
  definition: Pick<BlockMetadata, "settings">,
  value: unknown,
  path: readonly ValidationPathSegment[] = [],
): JsonObject {
  if (!isRecord(value)) {
    invalid(path, "invalid_block_settings", "must be an object.");
  }
  return validateModelFields(definition.settings ?? {}, value, "draft", path) as JsonObject;
}

/** Why stored block data could not be migrated to the current block version. */
export type BlockMigrationErrorCode =
  | "invalid_result"
  | "migration_failed"
  | "missing_step"
  | "version_ahead";

/** Thrown when stored block data cannot be migrated to its definition's version. */
export class BlockMigrationError extends LaceError<BlockMigrationErrorCode> {
  public constructor(
    code: BlockMigrationErrorCode,
    public readonly blockType: string,
    public readonly fromVersion: number,
    public readonly toVersion: number,
    message: string,
    /** Target version of the failing step, for failed or invalid steps. */
    public readonly step?: number,
    options?: { readonly cause?: unknown },
  ) {
    super(code, message, options);
    this.name = "BlockMigrationError";
  }
}

function jsonObject(value: unknown, name: string): JsonObject {
  if (value instanceof Promise || !isRecord(value)) {
    throw new FieldConfigurationError(`${name} must be a plain JSON object.`);
  }
  return deepFreeze(normalizeJsonValue(value, name, new WeakSet<object>())) as JsonObject;
}

/** Checks a step result: `{data, settings?}`; absent settings keep `previous`. */
function migrationResult(value: unknown, previous: JsonObject): BlockMigrationInput {
  if (value instanceof Promise || !isRecord(value)) {
    throw new FieldConfigurationError("result must be a plain object.");
  }
  for (const key of Object.keys(value)) {
    if (key !== "data" && key !== "settings") {
      throw new FieldConfigurationError(`result.${key} is not permitted.`);
    }
  }
  if (!Object.hasOwn(value, "data")) {
    throw new FieldConfigurationError("result.data is required.");
  }
  return Object.freeze({
    data: jsonObject(value.data, "result.data"),
    settings:
      value.settings === undefined ? previous : jsonObject(value.settings, "result.settings"),
  });
}

/**
 * Migrates stored block data and settings from `fromVersion` to the
 * definition's version by composing its declared migrations in ascending
 * order. Each step receives a detached, frozen copy. The result is not
 * validated against the definition.
 */
export function migrateBlockData(
  definition: BlockDefinition,
  block: BlockMigrationInput,
  fromVersion: number,
): BlockMigrationInput {
  const toVersion = definition.version;
  function fail(
    code: BlockMigrationErrorCode,
    message: string,
    step?: number,
    cause?: unknown,
  ): never {
    throw new BlockMigrationError(
      code,
      definition.type,
      fromVersion,
      toVersion,
      message,
      step,
      cause === undefined ? undefined : { cause },
    );
  }
  if (fromVersion > toVersion) {
    fail(
      "version_ahead",
      `Block ${definition.type} version ${fromVersion} is newer than ${toVersion}.`,
    );
  }
  let current: BlockMigrationInput;
  try {
    current = Object.freeze({
      data: jsonObject(block.data, "data"),
      settings: jsonObject(block.settings, "settings"),
    });
  } catch (error) {
    fail(
      "invalid_result",
      `Block ${definition.type} data or settings are not JSON objects.`,
      fromVersion,
      error,
    );
  }
  for (let step = fromVersion + 1; step <= toVersion; step += 1) {
    const migration = definition.migrations?.[step];
    if (migration === undefined) {
      fail(
        "missing_step",
        `Block ${definition.type} has no migration from version ${fromVersion} to ${toVersion}.`,
      );
    }
    let output: unknown;
    try {
      output = migration(current);
    } catch (error) {
      fail(
        "migration_failed",
        `Block ${definition.type} migration to version ${step} threw.`,
        step,
        error,
      );
    }
    try {
      current = migrationResult(output, current.settings);
    } catch (error) {
      fail(
        "invalid_result",
        `Block ${definition.type} migration to version ${step} did not return {data, settings?} JSON objects.`,
        step,
        error,
      );
    }
  }
  return current;
}

import type { JsonObject } from "../shared/json.js";
import { normalizeJsonValue } from "../shared/json.js";
import type { ContentValidationMode } from "../fields/validation.js";
import { publishedFieldValues, validateModelFields } from "../fields/validation.js";
import type {
  FieldVisibility,
  ModelFieldDefinitions,
  BlockDataValues,
} from "../fields/definitions.js";
import type { ValidationPathSegment } from "../shared/errors.js";
import { ContentValidationError, invalid } from "../shared/errors.js";
import { isRecord, deepFreeze } from "../shared/objects.js";
import { toFieldMetadata } from "../fields/metadata.js";
import { normalizeFormLayout } from "../fields/layout.js";
import { normalizeFieldVisibility } from "../fields/visibility.js";
import type {
  BlockDefinitionInput,
  BlockDefinition,
  BlockMetadata,
  NoBlockSettings,
} from "./types.js";
import { BLOCK_TYPE_PATTERN } from "./grammar.js";
import { blockFail } from "./errors.js";
import { normalizeBlockFields } from "./fields.js";
import { normalizeBlockMigrations } from "./migration.js";
import { normalizeBlockSettings, normalizeSettingsVisibility } from "./settings.js";

/** The published projection of one block's normalized data. */
export function publishedBlockData(definition: BlockMetadata, data: JsonObject): JsonObject {
  return publishedFieldValues(definition.fields, data, definition.visibility as FieldVisibility);
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
      const normalized = normalizeJsonValue(input.defaultValue, "defaultValue");
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

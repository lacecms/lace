import type { JsonObject } from "../shared/json.js";
import type { ContentValidationMode } from "../fields/validation.js";
import type {
  FieldVisibility,
  FieldDefinition,
  ModelFieldDefinitions,
  FormLayout,
  FieldValue,
  BlockDataValues,
} from "../fields/definitions.js";

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

/** A registry of the current executable definition for every allowed block type. */
export interface BlockRegistry {
  readonly blocks: readonly BlockDefinition[];
  readonly get: (type: string) => BlockDefinition | undefined;
}

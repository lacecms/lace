import { parseVideoEmbed } from "./video-embeds.js";
import type { EmbedProvider } from "./video-embeds.js";
import * as v from "valibot";
export * from "./video-embeds.js";

/** A JSON primitive that can be transported between Lace runtimes. */
export type JsonPrimitive = boolean | null | number | string;

/** A portable JSON value. Field descriptors never retain executable values. */
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

/** A portable JSON object. */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** Field kinds available in the first Lace content-model DSL. */
export type FieldType =
  | "boolean"
  | "date"
  | "datetime"
  | "media"
  | "group"
  | "list"
  | "number"
  | "richText"
  | "select"
  | "text"
  | "textarea"
  | "url";

/** Options common to every field builder. */
export interface CommonFieldOptions<Value> {
  readonly defaultValue?: Value;
  readonly description?: string;
  readonly label?: string;
  /**
   * Temporary synchronization hint naming the field's former key in a content
   * model. Configuration moves it out of the field definition; block fields
   * reject it.
   */
  readonly renamedFrom?: string;
  readonly required?: boolean;
}

/** A prompt on controls with an editable empty text surface. */
export interface PlaceholderFieldOptions<Value> extends CommonFieldOptions<Value> {
  readonly placeholder?: string;
}

/** Provider restrictions on otherwise ordinary safe URL fields. */
export interface UrlFieldOptions extends PlaceholderFieldOptions<string> {
  readonly embedProviders?: readonly EmbedProvider[];
}

/** String-length constraints supported by text and textarea fields. */
export interface StringFieldOptions extends PlaceholderFieldOptions<string> {
  readonly maxLength?: number;
  readonly minLength?: number;
}

/** Numeric bounds supported by number fields. */
export interface NumberFieldOptions extends PlaceholderFieldOptions<number> {
  readonly max?: number;
  readonly min?: number;
}

/** Options supported by boolean fields. */
export type BooleanFieldOptions = CommonFieldOptions<boolean>;

/** Options supported by date, datetime, URL, and media fields. */
export type StringValueFieldOptions = CommonFieldOptions<string>;

/** Options supported by a safe Tiptap rich-text field. */
export interface RichTextFieldOptions extends PlaceholderFieldOptions<SafeRichTextDocument> {}

/** Decorative rectangles in a fixed 12 by 12 logical canvas. */
export interface ChoiceDiagram {
  readonly cells: readonly {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }[];
}

/** Portable select hints; options remain the source of authored values. */
export interface SelectPresentation {
  readonly control: "cards";
  readonly choices: readonly {
    readonly value: string;
    readonly label: string;
    readonly description?: string;
    readonly diagram?: ChoiceDiagram;
  }[];
}

/** Options supported by select fields. */
export interface SelectFieldOptions<
  Choices extends readonly string[],
> extends PlaceholderFieldOptions<NoInfer<Choices[number]>> {
  readonly options: Choices;
  readonly presentation?: SelectPresentation;
}

type RequiredFrom<Options> = "required" extends keyof Options
  ? Options extends { readonly required: infer Required extends boolean }
    ? Required
    : boolean
  : false;

type PropertyFrom<Options, Key extends string> = Key extends keyof Options
  ? Options extends { readonly [Name in Key]: infer Value }
    ? { readonly [Name in Key]: Value }
    : Options extends { readonly [Name in Key]?: infer Value }
      ? { readonly [Name in Key]?: Value }
      : {}
  : {};

type DefaultFrom<Options> = PropertyFrom<Options, "defaultValue">;

type LabelAndDescriptionFrom<Options> = PropertyFrom<Options, "label"> &
  PropertyFrom<Options, "description"> &
  PropertyFrom<Options, "placeholder">;

type CommonDefinition<Type extends FieldType, Options> = {
  readonly required: RequiredFrom<Options>;
  readonly type: Type;
} & DefaultFrom<Options> &
  LabelAndDescriptionFrom<Options>;

type StringConstraintsFrom<Options> = PropertyFrom<Options, "minLength"> &
  PropertyFrom<Options, "maxLength">;

type NumberConstraintsFrom<Options> = PropertyFrom<Options, "min"> & PropertyFrom<Options, "max">;

/** A text-field descriptor. */
export type TextFieldDefinition<Options extends StringFieldOptions = StringFieldOptions> =
  CommonDefinition<"text", Options> & StringConstraintsFrom<Options>;

/** A textarea-field descriptor. */
export type TextareaFieldDefinition<Options extends StringFieldOptions = StringFieldOptions> =
  CommonDefinition<"textarea", Options> & StringConstraintsFrom<Options>;

/** A rich-text-field descriptor. */
export type RichTextFieldDefinition<Options extends RichTextFieldOptions = RichTextFieldOptions> =
  CommonDefinition<"richText", Options>;

/** A number-field descriptor. */
export type NumberFieldDefinition<Options extends NumberFieldOptions = NumberFieldOptions> =
  CommonDefinition<"number", Options> & NumberConstraintsFrom<Options>;

/** A boolean-field descriptor. */
export type BooleanFieldDefinition<Options extends BooleanFieldOptions = BooleanFieldOptions> =
  CommonDefinition<"boolean", Options>;

/** A date-field descriptor. */
export type DateFieldDefinition<Options extends StringValueFieldOptions = StringValueFieldOptions> =
  CommonDefinition<"date", Options>;

/** A datetime-field descriptor. */
export type DatetimeFieldDefinition<
  Options extends StringValueFieldOptions = StringValueFieldOptions,
> = CommonDefinition<"datetime", Options>;

/** A URL-field descriptor. */
export type UrlFieldDefinition<Options extends UrlFieldOptions = UrlFieldOptions> =
  CommonDefinition<"url", Options> & PropertyFrom<Options, "embedProviders">;

/** A media-field descriptor that stores a media identifier. */
export type MediaFieldDefinition<
  Options extends StringValueFieldOptions = StringValueFieldOptions,
> = CommonDefinition<"media", Options>;

/** A select-field descriptor. */
export type SelectFieldDefinition<
  Choices extends readonly string[] = readonly string[],
  Options extends SelectFieldOptions<Choices> = SelectFieldOptions<Choices>,
> = CommonDefinition<"select", Options> & { readonly options: Choices } & PropertyFrom<
    Options,
    "presentation"
  >;

/** Ordered presentation of immediate sibling fields; never content data. */
export interface FormLayout<Key extends string = string> {
  readonly mode: "sections" | "tabs";
  readonly groups: readonly {
    readonly key: string;
    readonly label: string;
    readonly description?: string;
    readonly fields: readonly Key[];
  }[];
}

/** Validates, detaches and freezes optional sibling layout metadata. */
export function normalizeFormLayout<Key extends string>(
  value: unknown,
  fields: Readonly<Record<Key, unknown>>,
  path = "layout",
): FormLayout<Key> | undefined {
  if (value === undefined) return undefined;
  const raw = normalizeJsonValue(value, path, new WeakSet<object>());
  if (
    !isRecord(raw) ||
    Object.keys(raw).some((key) => !["mode", "groups"].includes(key)) ||
    (raw.mode !== "sections" && raw.mode !== "tabs") ||
    !Array.isArray(raw.groups) ||
    raw.groups.length === 0
  )
    fail(path, "must declare mode sections/tabs and nonempty groups.");
  const keys = new Set<string>();
  const placed = new Set<string>();
  for (const [index, group] of raw.groups.entries()) {
    const at = `${path}.groups.${index}`;
    if (
      !isRecord(group) ||
      Object.keys(group).some((key) => !["key", "label", "description", "fields"].includes(key)) ||
      typeof group.key !== "string" ||
      !FIELD_KEY_PATTERN.test(group.key) ||
      keys.has(group.key) ||
      typeof group.label !== "string" ||
      !group.label.trim() ||
      (group.description !== undefined && typeof group.description !== "string") ||
      !Array.isArray(group.fields) ||
      group.fields.length === 0
    )
      fail(at, "must declare a unique key, nonempty label and fields.");
    keys.add(group.key);
    for (const key of group.fields) {
      if (typeof key !== "string" || !Object.hasOwn(fields, key) || placed.has(key))
        fail(at, `contains unknown or repeated field ${String(key)}.`);
      placed.add(key);
    }
  }
  return deepFreeze(raw) as unknown as FormLayout<Key>;
}

/** Sibling field order used by rendering and validation summaries. */
export function formFieldKeys(
  fields: Readonly<Record<string, unknown>>,
  layout?: FormLayout,
): readonly string[] {
  const placed = layout?.groups.flatMap((group) => group.fields) ?? [];
  return [...placed, ...Object.keys(fields).filter((key) => !placed.includes(key))];
}

/** A finite group of named child descriptors. */
export interface GroupFieldDefinition {
  readonly layout?: FormLayout;
  readonly type: "group";
  readonly fields: ModelFieldDefinitions;
  readonly required: boolean;
  readonly label?: string;
  readonly description?: string;
  readonly defaultValue?: JsonObject;
}

/** A list item cannot itself be a list. */
export type ListItemDefinition = Exclude<FieldDefinition, ListFieldDefinition>;

/** A homogeneous ordered list; omitted bounds mean 0 and 100. */
export interface ListFieldDefinition {
  readonly type: "list";
  readonly item: ListItemDefinition;
  readonly required: boolean;
  readonly label?: string;
  readonly description?: string;
  readonly defaultValue?: readonly JsonValue[];
  readonly minItems?: number;
  readonly maxItems?: number;
  /** Immediate text/textarea/select/URL child used for an item summary. */
  readonly itemLabel?: string;
}

/** A draft starting value can omit required group descendants. */
export type DraftFieldValue<Definition extends FieldDefinition> = Definition extends {
  readonly type: "group";
  readonly fields: infer Fields extends ModelFieldDefinitions;
}
  ? string extends keyof Fields
    ? JsonObject
    : { readonly [Key in keyof Fields]?: DraftFieldValue<Fields[Key]> }
  : Definition extends {
        readonly type: "list";
        readonly item: infer Item extends ListItemDefinition;
      }
    ? readonly DraftFieldValue<Item>[]
    : FieldValue<Definition>;

/** Maximum containers along a descriptor branch. */
export const MAX_FIELD_CONTAINER_DEPTH = 6;
/** Maximum directly nested groups. */
export const MAX_CONSECUTIVE_GROUPS = 2;
/** Maximum items in any one list. */
export const MAX_LIST_ITEMS = 100;
/** Maximum sum of list lengths in a snapshot. */
export const MAX_SNAPSHOT_LIST_ITEMS = 500;

/** The discriminated union of all currently supported field descriptors. */
export type FieldDefinition =
  | GroupFieldDefinition
  | ListFieldDefinition
  | BooleanFieldDefinition
  | DateFieldDefinition
  | DatetimeFieldDefinition
  | MediaFieldDefinition
  | NumberFieldDefinition
  | RichTextFieldDefinition
  | SelectFieldDefinition
  | TextareaFieldDefinition
  | TextFieldDefinition
  | UrlFieldDefinition;

/** The submitted value type associated with a field descriptor. */
export type FieldValue<Definition extends FieldDefinition> = Definition extends {
  readonly type: "boolean";
}
  ? boolean
  : Definition extends { readonly type: "number" }
    ? number
    : Definition extends { readonly type: "richText" }
      ? SafeRichTextDocument
      : Definition extends { readonly type: "select" }
        ? Definition extends { readonly options: readonly (infer Choice)[] }
          ? Choice
          : never
        : Definition extends {
              readonly type: "group";
              readonly fields: infer Fields extends ModelFieldDefinitions;
            }
          ? string extends keyof Fields
            ? JsonObject
            : BlockDataValues<Fields>
          : Definition extends {
                readonly type: "list";
                readonly item: infer Item extends ListItemDefinition;
              }
            ? readonly FieldValue<Item>[]
            : string;

/** Whether a descriptor makes a model property required through `required` or a default. */
export type FieldIsRequired<Definition extends FieldDefinition> = Definition extends {
  readonly defaultValue: unknown;
}
  ? true
  : Definition extends { readonly required: true }
    ? true
    : false;

/** Serializable form metadata has the same safe data shape as a field descriptor. */
export type FieldMetadata = FieldDefinition;

/** Thrown when a field builder receives a non-portable or contradictory option. */
export class FieldConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "FieldConfigurationError";
  }
}

type MutableJsonObject = { [key: string]: MutableJsonValue };
type MutableJsonValue = boolean | null | number | string | MutableJsonObject | MutableJsonValue[];

function fail(path: string, message: string): never {
  throw new FieldConfigurationError(`${path} ${message}`);
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

function isArrayIndex(key: string): boolean {
  if (key === "0") {
    return true;
  }

  if (!/^[1-9][0-9]*$/u.test(key)) {
    return false;
  }

  const index = Number(key);
  return Number.isSafeInteger(index) && index < 4_294_967_295;
}

function normalizeJsonValue(
  value: unknown,
  path: string,
  ancestors: WeakSet<object>,
): MutableJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail(path, "must not contain a non-finite number.");
    }

    return value;
  }

  if (typeof value !== "object") {
    fail(path, "must be JSON-serializable.");
  }

  if (ancestors.has(value)) {
    fail(path, "must not contain a cyclic reference.");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Reflect.ownKeys(value);
      for (const key of keys) {
        if (key === "length") {
          continue;
        }

        if (typeof key !== "string" || !isArrayIndex(key)) {
          fail(path, "must not contain non-index array properties or symbols.");
        }

        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined) {
          fail(`${path}[${key}]`, "must contain an own data property.");
        }
        if ("get" in descriptor || "set" in descriptor) {
          fail(`${path}[${key}]`, "must not contain accessor properties.");
        }
      }

      const normalized: MutableJsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          fail(`${path}[${index}]`, "must not contain sparse array entries.");
        }

        normalized.push(normalizeJsonValue(value[index], `${path}[${index}]`, ancestors));
      }

      return normalized;
    }

    if (!isPlainObject(value)) {
      fail(path, "must not contain a non-plain object.");
    }

    const normalized: MutableJsonObject = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        fail(path, "must not contain symbol keys.");
      }

      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined) {
        fail(`${path}.${key}`, "must contain an own data property.");
      }
      if ("get" in descriptor || "set" in descriptor) {
        fail(`${path}.${key}`, "must not contain accessor properties.");
      }
      if (!descriptor.enumerable) {
        fail(`${path}.${key}`, "must contain an enumerable data property.");
      }

      normalized[key] = normalizeJsonValue(descriptor.value, `${path}.${key}`, ancestors);
    }

    return normalized;
  } finally {
    ancestors.delete(value);
  }
}

function normalizeOptions(options: unknown): MutableJsonObject {
  const normalized = normalizeJsonValue(options, "options", new WeakSet<object>());
  if (normalized === null || Array.isArray(normalized) || typeof normalized !== "object") {
    fail("options", "must be a plain object.");
  }

  return normalized;
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }

    Object.freeze(value);
  }

  return value;
}

const RENAMED_FROM_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/u;

function readOptionalString(options: MutableJsonObject, name: string): string | undefined {
  const value = options[name];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    fail(`options.${name}`, "must be a string.");
  }

  return value;
}

function readOptionalBoolean(options: MutableJsonObject, name: string): boolean | undefined {
  const value = options[name];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    fail(`options.${name}`, "must be a boolean.");
  }

  return value;
}

function readOptionalFiniteNumber(
  options: MutableJsonObject,
  name: string,
  integer: boolean,
): number | undefined {
  const value = options[name];
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (integer && !Number.isSafeInteger(value)) ||
    (integer && value < 0)
  ) {
    fail(
      `options.${name}`,
      integer ? "must be a non-negative safe integer." : "must be a finite number.",
    );
  }

  return value;
}

function addCommonOptions(definition: Record<string, unknown>, options: MutableJsonObject): void {
  const label = readOptionalString(options, "label");
  if (label !== undefined) {
    definition.label = label;
  }

  const description = readOptionalString(options, "description");
  if (description !== undefined) {
    definition.description = description;
  }

  const placeholder = readOptionalString(options, "placeholder");
  if (placeholder !== undefined) definition.placeholder = placeholder;

  const renamedFrom = readOptionalString(options, "renamedFrom");
  if (renamedFrom !== undefined) {
    if (!RENAMED_FROM_PATTERN.test(renamedFrom)) {
      fail("options.renamedFrom", "must be a valid field key.");
    }
    definition.renamedFrom = renamedFrom;
  }

  definition.required = readOptionalBoolean(options, "required") ?? false;
}

function assertAllowedOptions(options: MutableJsonObject, allowed: readonly string[]): void {
  for (const key of Object.keys(options)) {
    // Every field kind accepts the temporary `renamedFrom` hint.
    if (!allowed.includes(key) && key !== "renamedFrom") {
      fail(`options.${key}`, "is not supported by this field type.");
    }
  }
}

function addDefault(
  definition: Record<string, unknown>,
  options: MutableJsonObject,
  isValid: (value: MutableJsonValue) => boolean,
  message: string,
): void {
  if (!Object.hasOwn(options, "defaultValue")) {
    return;
  }

  const value = options.defaultValue;
  if (value === undefined || !isValid(value)) {
    fail("options.defaultValue", message);
  }

  definition.defaultValue = value;
}

function buildStringField<Type extends "text" | "textarea", Options extends StringFieldOptions>(
  type: Type,
  input: Options | undefined,
): Type extends "text" ? TextFieldDefinition<Options> : TextareaFieldDefinition<Options> {
  const options = normalizeOptions(input ?? {});
  assertAllowedOptions(options, [
    "defaultValue",
    "description",
    "label",
    "maxLength",
    "minLength",
    "placeholder",
    "required",
  ]);
  const definition: Record<string, unknown> = { type };
  addCommonOptions(definition, options);

  const minLength = readOptionalFiniteNumber(options, "minLength", true);
  const maxLength = readOptionalFiniteNumber(options, "maxLength", true);
  if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) {
    fail("options", "must not set minLength greater than maxLength.");
  }

  if (minLength !== undefined) {
    definition.minLength = minLength;
  }
  if (maxLength !== undefined) {
    definition.maxLength = maxLength;
  }

  addDefault(
    definition,
    options,
    (value) =>
      typeof value === "string" &&
      (minLength === undefined || textLength(value) >= minLength) &&
      (maxLength === undefined || textLength(value) <= maxLength),
    "must be a string that conforms to the declared length constraints.",
  );

  return deepFreeze(definition) as Type extends "text"
    ? TextFieldDefinition<Options>
    : TextareaFieldDefinition<Options>;
}

function buildStringValueField<
  Type extends "date" | "datetime" | "media" | "url",
  Options extends StringValueFieldOptions,
>(type: Type, input: Options | undefined): FieldDefinition {
  const options = normalizeOptions(input ?? {});
  assertAllowedOptions(options, [
    "defaultValue",
    "description",
    "label",
    "required",
    ...(type === "url" ? ["placeholder", "embedProviders"] : []),
  ]);
  const definition: Record<string, unknown> = { type };
  addCommonOptions(definition, options);
  if (type === "url" && options.embedProviders !== undefined) {
    const providers = options.embedProviders;
    if (
      !Array.isArray(providers) ||
      providers.length === 0 ||
      providers.some((provider) => provider !== "youtube" && provider !== "vimeo") ||
      new Set(providers).size !== providers.length
    )
      fail("options.embedProviders", "must be a non-empty unique list of youtube and vimeo.");
    definition.embedProviders = ["youtube", "vimeo"].filter((provider) =>
      providers.includes(provider),
    );
  }
  addDefault(
    definition,
    options,
    (value) => {
      if (typeof value !== "string") return false;
      if (definition.embedProviders === undefined) return true;
      const embed = parseVideoEmbed(value);
      return (
        isSafeUrl(value) &&
        embed !== undefined &&
        (definition.embedProviders as readonly string[]).includes(embed.provider)
      );
    },
    definition.embedProviders === undefined
      ? "must be a string."
      : "must be a string matching the declared embed providers.",
  );
  return deepFreeze(definition) as FieldDefinition;
}

/** Builders for portable Lace field descriptors. */
export const field = {
  /** Define named child fields stored as one plain object. */
  group<const Options extends { readonly fields: ModelFieldDefinitions }>(
    options: Options &
      CommonFieldOptions<
        NoInfer<{
          readonly [Key in keyof Options["fields"]]?: DraftFieldValue<Options["fields"][Key]>;
        }>
      > & { readonly layout?: FormLayout<keyof Options["fields"] & string> },
  ): CommonDefinition<"group", Options> &
    PropertyFrom<Options, "layout"> & { readonly fields: Options["fields"] } {
    return normalizeCompositeOptions("group", options) as unknown as CommonDefinition<
      "group",
      Options
    > &
      PropertyFrom<Options, "layout"> & { readonly fields: Options["fields"] };
  },

  /** Define an ordered array of scalar or group values. */
  list<
    const Options extends {
      readonly item: ListItemDefinition;
      readonly minItems?: number;
      readonly maxItems?: number;
      readonly itemLabel?: string;
    },
  >(
    options: Options & CommonFieldOptions<NoInfer<readonly DraftFieldValue<Options["item"]>[]>>,
  ): CommonDefinition<"list", Options> & { readonly item: Options["item"] } & PropertyFrom<
      Options,
      "minItems"
    > &
    PropertyFrom<Options, "maxItems"> &
    PropertyFrom<Options, "itemLabel"> {
    return normalizeCompositeOptions("list", options) as unknown as CommonDefinition<
      "list",
      Options
    > & { readonly item: Options["item"] } & PropertyFrom<Options, "minItems"> &
      PropertyFrom<Options, "maxItems"> &
      PropertyFrom<Options, "itemLabel">;
  },

  /** Define a single-line text field. */
  text<const Options extends StringFieldOptions = StringFieldOptions>(
    options?: Options,
  ): TextFieldDefinition<Options> {
    return buildStringField("text", options);
  },

  /** Define a multiline text field. */
  textarea<const Options extends StringFieldOptions = StringFieldOptions>(
    options?: Options,
  ): TextareaFieldDefinition<Options> {
    return buildStringField("textarea", options);
  },

  /** Define a safe Tiptap JSON field. */
  richText<const Options extends RichTextFieldOptions = RichTextFieldOptions>(
    options?: Options,
  ): RichTextFieldDefinition<Options> {
    const normalized = normalizeOptions(options ?? {});
    assertAllowedOptions(normalized, [
      "defaultValue",
      "description",
      "label",
      "required",
      "placeholder",
    ]);
    const definition: Record<string, unknown> = { type: "richText" };
    addCommonOptions(definition, normalized);
    addDefault(
      definition,
      normalized,
      (value) => isSafeRichTextDocument(value),
      "must be a safe rich-text document.",
    );
    return deepFreeze(definition) as RichTextFieldDefinition<Options>;
  },

  /** Define a finite numeric field. */
  number<const Options extends NumberFieldOptions = NumberFieldOptions>(
    options?: Options,
  ): NumberFieldDefinition<Options> {
    const normalized = normalizeOptions(options ?? {});
    assertAllowedOptions(normalized, [
      "defaultValue",
      "description",
      "label",
      "placeholder",
      "max",
      "min",
      "required",
    ]);
    const definition: Record<string, unknown> = { type: "number" };
    addCommonOptions(definition, normalized);
    const min = readOptionalFiniteNumber(normalized, "min", false);
    const max = readOptionalFiniteNumber(normalized, "max", false);
    if (min !== undefined && max !== undefined && min > max) {
      fail("options", "must not set min greater than max.");
    }
    if (min !== undefined) {
      definition.min = min;
    }
    if (max !== undefined) {
      definition.max = max;
    }
    addDefault(
      definition,
      normalized,
      (value) =>
        typeof value === "number" &&
        Number.isFinite(value) &&
        (min === undefined || value >= min) &&
        (max === undefined || value <= max),
      "must be a finite number that conforms to the declared numeric bounds.",
    );
    return deepFreeze(definition) as NumberFieldDefinition<Options>;
  },

  /** Define a boolean field. */
  boolean<const Options extends BooleanFieldOptions = BooleanFieldOptions>(
    options?: Options,
  ): BooleanFieldDefinition<Options> {
    const normalized = normalizeOptions(options ?? {});
    assertAllowedOptions(normalized, ["defaultValue", "description", "label", "required"]);
    const definition: Record<string, unknown> = { type: "boolean" };
    addCommonOptions(definition, normalized);
    addDefault(definition, normalized, (value) => typeof value === "boolean", "must be a boolean.");
    return deepFreeze(definition) as BooleanFieldDefinition<Options>;
  },

  /** Define a date string field. */
  date<const Options extends StringValueFieldOptions = StringValueFieldOptions>(
    options?: Options,
  ): DateFieldDefinition<Options> {
    return buildStringValueField("date", options) as DateFieldDefinition<Options>;
  },

  /** Define a datetime string field. */
  datetime<const Options extends StringValueFieldOptions = StringValueFieldOptions>(
    options?: Options,
  ): DatetimeFieldDefinition<Options> {
    return buildStringValueField("datetime", options) as DatetimeFieldDefinition<Options>;
  },

  /** Define a select field with a non-empty unique list of string choices. */
  select<
    const Options extends {
      readonly options: readonly [string, ...string[]];
    },
  >(
    options: Options & SelectFieldOptions<Options["options"]>,
  ): SelectFieldDefinition<Options["options"], Options & SelectFieldOptions<Options["options"]>> {
    const normalized = normalizeOptions(options);
    assertAllowedOptions(normalized, [
      "defaultValue",
      "description",
      "label",
      "options",
      "presentation",
      "placeholder",
      "required",
    ]);
    const rawChoices = normalized.options;
    if (!Array.isArray(rawChoices) || rawChoices.length === 0) {
      fail("options.options", "must be a non-empty array of strings.");
    }

    const choices: string[] = [];
    const seen = new Set<string>();
    for (const [index, choice] of rawChoices.entries()) {
      if (typeof choice !== "string") {
        fail(`options.options[${index}]`, "must be a string.");
      }
      if (seen.has(choice)) {
        fail(`options.options[${index}]`, "must not duplicate a select choice.");
      }
      seen.add(choice);
      choices.push(choice);
    }

    const definition: Record<string, unknown> = { options: choices, type: "select" };
    addCommonOptions(definition, normalized);
    if (normalized.presentation !== undefined)
      definition.presentation = normalizeSelectPresentation(normalized.presentation, choices);
    addDefault(
      definition,
      normalized,
      (value) => typeof value === "string" && seen.has(value),
      "must be one of the declared select choices.",
    );
    return deepFreeze(definition) as SelectFieldDefinition<
      Options["options"],
      Options & SelectFieldOptions<Options["options"]>
    >;
  },

  /** Define a safe URL field, optionally restricted to supported video providers. */
  url<const Options extends UrlFieldOptions = UrlFieldOptions>(
    options?: Options,
  ): UrlFieldDefinition<Options> {
    return buildStringValueField("url", options) as UrlFieldDefinition<Options>;
  },

  /** Define a field holding a media identifier. */
  media<const Options extends StringValueFieldOptions = StringValueFieldOptions>(
    options?: Options,
  ): MediaFieldDefinition<Options> {
    return buildStringValueField("media", options) as MediaFieldDefinition<Options>;
  },
} as const;

function normalizeSelectPresentation(
  value: unknown,
  options: readonly string[],
): SelectPresentation {
  const path = "options.presentation";
  const exact = (raw: unknown, keys: readonly string[], at: string) => {
    const record = descriptorRecord(raw, at);
    for (const key of Object.keys(record))
      if (!keys.includes(key)) fail(`${at}.${key}`, "is not supported.");
    return record;
  };
  const text = (raw: unknown, at: string): string => {
    if (
      typeof raw !== "string" ||
      !raw.trim() ||
      /[<>]/u.test(raw) ||
      [...raw].some((character) => character.charCodeAt(0) < 32)
    )
      fail(at, "must be nonempty plain text.");
    return raw;
  };
  const raw = exact(value, ["control", "choices"], path);
  if (raw.control !== "cards") fail(`${path}.control`, 'must be "cards".');
  if (!Array.isArray(raw.choices) || raw.choices.length !== options.length)
    fail(`${path}.choices`, "must cover every select option exactly once.");
  const seen = new Set<string>();
  const choices = raw.choices.map((choice, index) => {
    const at = `${path}.choices[${index}]`;
    const entry = exact(choice, ["value", "label", "description", "diagram"], at);
    if (typeof entry.value !== "string" || !options.includes(entry.value) || seen.has(entry.value))
      fail(`${at}.value`, "must name a unique declared select option.");
    seen.add(entry.value);
    const result: SelectPresentation["choices"][number] = {
      value: entry.value,
      label: text(entry.label, `${at}.label`),
      ...(entry.description !== undefined
        ? { description: text(entry.description, `${at}.description`) }
        : {}),
      ...(entry.diagram !== undefined ? { diagram: diagram(entry.diagram, `${at}.diagram`) } : {}),
    };
    return result;
  });
  return deepFreeze({ control: "cards", choices });

  function diagram(input: unknown, at: string): ChoiceDiagram {
    const rawDiagram = exact(input, ["cells"], at);
    if (
      !Array.isArray(rawDiagram.cells) ||
      rawDiagram.cells.length < 1 ||
      rawDiagram.cells.length > 16
    )
      fail(`${at}.cells`, "must contain 1–16 rectangles.");
    const cells: { x: number; y: number; width: number; height: number }[] = [];
    for (const [index, inputCell] of rawDiagram.cells.entries()) {
      const cellPath = `${at}.cells[${index}]`;
      const rawCell = exact(inputCell, ["x", "y", "width", "height"], cellPath);
      for (const key of ["x", "y", "width", "height"] as const) {
        const n = rawCell[key];
        if (
          typeof n !== "number" ||
          !Number.isInteger(n) ||
          n < (key === "x" || key === "y" ? 0 : 1)
        )
          fail(`${cellPath}.${key}`, "must be an integer within the 12 by 12 canvas.");
      }
      const cell = rawCell as { x: number; y: number; width: number; height: number };
      if (cell.x + cell.width > 12 || cell.y + cell.height > 12)
        fail(cellPath, "must fit within the 12 by 12 canvas.");
      if (
        cells.some(
          (other) =>
            cell.x < other.x + other.width &&
            cell.x + cell.width > other.x &&
            cell.y < other.y + other.height &&
            cell.y + cell.height > other.y,
        )
      )
        fail(cellPath, "must not overlap another rectangle.");
      cells.push({ ...cell });
    }
    return { cells };
  }
}

/**
 * Project a field descriptor into a detached, immutable JSON-safe admin form
 * representation. Runtime schemas and callbacks are deliberately absent.
 */
export function toFieldMetadata(definition: FieldDefinition): FieldMetadata {
  return normalizeFieldDefinition(definition);
}

/** Reads own data properties without executing configuration accessors. */
function descriptorRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) fail(path, "must be a plain field-definition object.");
  const output: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") fail(path, "must not contain symbol keys.");
    const property = Object.getOwnPropertyDescriptor(value, key)!;
    if (!property.enumerable || !("value" in property))
      fail(`${path}.${key}`, "must be an enumerable data property.");
    Object.defineProperty(output, key, { value: property.value, enumerable: true });
  }
  return output;
}

function normalizeCompositeOptions(type: "group" | "list", value: unknown): FieldDefinition {
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
          return field.boolean(options as BooleanFieldOptions);
        case "date":
          return field.date(options as StringValueFieldOptions);
        case "datetime":
          return field.datetime(options as StringValueFieldOptions);
        case "media":
          return field.media(options as StringValueFieldOptions);
        case "number":
          return field.number(options as NumberFieldOptions);
        case "richText":
          return field.richText(options as RichTextFieldOptions);
        case "select":
          return field.select(options as { readonly options: readonly [string, ...string[]] });
        case "text":
          return field.text(options as StringFieldOptions);
        case "textarea":
          return field.textarea(options as StringFieldOptions);
        case "url":
          return field.url(options as StringValueFieldOptions);
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
    ...(type === "group" ? ["fields", "layout"] : ["item", "minItems", "maxItems", "itemLabel"]),
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
          !["text", "textarea", "select", "url"].includes(itemDefinition.fields[key]!.type)
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
      const portableDefault = normalizeJsonValue(
        defaultValue,
        `${path}.defaultValue`,
        new WeakSet<object>(),
      );
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

/** A mark permitted in Lace rich-text documents. */
export type SafeRichTextMark =
  | { readonly type: "bold" | "code" | "italic" | "strike" }
  | {
      readonly attrs: {
        readonly href: string;
        readonly target?: "_blank";
        readonly rel?: "nofollow";
      };
      readonly type: "link";
    };

/** A node permitted in Lace rich-text documents. */
export type SafeRichTextNode =
  | { readonly type: "hardBreak" | "horizontalRule" }
  | {
      readonly content?: readonly { readonly text: string; readonly type: "text" }[];
      readonly type: "codeBlock";
    }
  | { readonly marks?: readonly SafeRichTextMark[]; readonly text: string; readonly type: "text" }
  | { readonly content?: readonly SafeRichTextNode[]; readonly type: "paragraph" }
  | {
      readonly attrs: { readonly level: 1 | 2 | 3 | 4 };
      readonly content?: readonly SafeRichTextNode[];
      readonly type: "heading";
    }
  | { readonly content: readonly SafeRichTextNode[]; readonly type: "bulletList" | "orderedList" }
  | { readonly content: readonly SafeRichTextNode[]; readonly type: "listItem" }
  | { readonly content: readonly SafeRichTextNode[]; readonly type: "blockquote" };

/** The closed, safe Tiptap document representation supported by Lace. */
export interface SafeRichTextDocument {
  readonly content: readonly SafeRichTextNode[];
  readonly type: "doc";
}

/** A stable path segment for validation errors. */
export type ValidationPathSegment = number | string;

/** A portable validation error that callers can associate with form values. */
export interface ContentValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: readonly ValidationPathSegment[];
}

/** Thrown when submitted content fails a portable validation contract. */
export class ContentValidationError extends Error {
  public readonly issues: readonly ContentValidationIssue[];

  public constructor(issues: readonly ContentValidationIssue[]) {
    super(issues.map((issue) => `${formatValidationPath(issue.path)} ${issue.message}`).join("; "));
    this.name = "ContentValidationError";
    this.issues = issues;
  }
}

function formatValidationPath(path: readonly ValidationPathSegment[]): string {
  if (path.length === 0) {
    return "$";
  }

  return path.reduce<string>((result, segment) => {
    return typeof segment === "number" ? `${result}[${segment}]` : `${result}.${segment}`;
  }, "$");
}

function invalid(path: readonly ValidationPathSegment[], code: string, message: string): never {
  throw new ContentValidationError([{ code, message, path }]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === "object" && !Array.isArray(value) && isPlainObject(value)
  );
}

function assertExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  path: readonly ValidationPathSegment[],
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      invalid([...path, key], "unknown_key", "is not permitted.");
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      invalid([...path, key], "missing_key", "is required.");
    }
  }
}

/** Returns whether a URL is permitted in Lace URL fields and rich-text links. */
export function isSafeUrl(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    /\s/u.test(value) ||
    value.includes(String.fromCodePoint(0))
  ) {
    return false;
  }
  if (value.startsWith("#")) {
    return true;
  }
  if (value.startsWith("/")) {
    return !value.startsWith("//");
  }
  return /^(?:https?:\/\/[^/?#\s]+(?:[/?#][^\s]*)?|mailto:[^\s@]+@[^\s@]+|tel:\+?[0-9(). -]+)$/u.test(
    value,
  );
}

function assertMarks(value: unknown, path: readonly ValidationPathSegment[]): void {
  if (!Array.isArray(value)) {
    invalid(path, "invalid_marks", "must be an array.");
  }
  for (const [index, mark] of value.entries()) {
    const markPath = [...path, index];
    if (!isRecord(mark) || typeof mark.type !== "string") {
      invalid(markPath, "invalid_mark", "must be a mark object.");
    }
    if (mark.type === "link") {
      assertExactKeys(mark, ["attrs", "type"], [], markPath);
      if (!isRecord(mark.attrs)) {
        invalid([...markPath, "attrs"], "invalid_link_attributes", "must be an object.");
      }
      assertExactKeys(mark.attrs, ["href"], ["target", "rel"], [...markPath, "attrs"]);
      if (Object.hasOwn(mark.attrs, "target") && mark.attrs.target !== "_blank") {
        invalid([...markPath, "attrs", "target"], "invalid_link_target", 'must be "_blank".');
      }
      if (Object.hasOwn(mark.attrs, "rel") && mark.attrs.rel !== "nofollow") {
        invalid([...markPath, "attrs", "rel"], "invalid_link_rel", 'must be "nofollow".');
      }
      if (!isSafeUrl(mark.attrs.href)) {
        invalid([...markPath, "attrs", "href"], "unsafe_url", "must be an approved URL.");
      }
      continue;
    }
    if (
      mark.type === "bold" ||
      mark.type === "code" ||
      mark.type === "italic" ||
      mark.type === "strike"
    ) {
      assertExactKeys(mark, ["type"], [], markPath);
      continue;
    }
    invalid([...markPath, "type"], "unknown_mark", "is not permitted.");
  }
}

function assertRichTextChildren(
  value: unknown,
  path: readonly ValidationPathSegment[],
  allowed: readonly SafeRichTextNode["type"][],
): void {
  if (!Array.isArray(value)) {
    invalid(path, "invalid_content", "must be an array.");
  }
  for (const [index, child] of value.entries()) {
    assertRichTextNode(child, [...path, index]);
    if (!allowed.includes(child.type)) {
      invalid([...path, index, "type"], "invalid_child", "is not permitted in this node.");
    }
  }
}

function assertRichTextNode(
  value: unknown,
  path: readonly ValidationPathSegment[],
): asserts value is SafeRichTextNode {
  if (!isRecord(value) || typeof value.type !== "string") {
    invalid(path, "invalid_node", "must be a rich-text node object.");
  }

  if (value.type === "text") {
    assertExactKeys(value, ["text", "type"], ["marks"], path);
    if (typeof value.text !== "string") {
      invalid([...path, "text"], "invalid_text", "must be a string.");
    }
    if (Object.hasOwn(value, "marks")) {
      assertMarks(value.marks, [...path, "marks"]);
    }
    return;
  }

  if (value.type === "hardBreak" || value.type === "horizontalRule") {
    assertExactKeys(value, ["type"], [], path);
    return;
  }

  if (value.type === "codeBlock") {
    assertExactKeys(value, ["type"], ["content"], path);
    if (Object.hasOwn(value, "content")) {
      assertRichTextChildren(value.content, [...path, "content"], ["text"]);
      for (const [index, child] of (
        value.content as readonly Record<string, unknown>[]
      ).entries()) {
        assertExactKeys(child, ["type", "text"], [], [...path, "content", index]);
      }
    }
    return;
  }

  if (value.type === "paragraph") {
    assertExactKeys(value, ["type"], ["content"], path);
    if (Object.hasOwn(value, "content")) {
      assertRichTextChildren(value.content, [...path, "content"], ["hardBreak", "text"]);
    }
    return;
  }

  if (value.type === "heading") {
    assertExactKeys(value, ["attrs", "type"], ["content"], path);
    if (!isRecord(value.attrs)) {
      invalid([...path, "attrs"], "invalid_heading_attributes", "must be an object.");
    }
    assertExactKeys(value.attrs, ["level"], [], [...path, "attrs"]);
    if (
      value.attrs.level !== 1 &&
      value.attrs.level !== 2 &&
      value.attrs.level !== 3 &&
      value.attrs.level !== 4
    ) {
      invalid([...path, "attrs", "level"], "invalid_heading_level", "must be 1, 2, 3, or 4.");
    }
    if (Object.hasOwn(value, "content")) {
      assertRichTextChildren(value.content, [...path, "content"], ["hardBreak", "text"]);
    }
    return;
  }

  if (value.type === "bulletList" || value.type === "orderedList") {
    assertExactKeys(value, ["content", "type"], [], path);
    assertRichTextChildren(value.content, [...path, "content"], ["listItem"]);
    return;
  }

  if (value.type === "listItem") {
    assertExactKeys(value, ["content", "type"], [], path);
    assertRichTextChildren(
      value.content,
      [...path, "content"],
      ["bulletList", "orderedList", "paragraph", "horizontalRule", "codeBlock"],
    );
    return;
  }

  if (value.type === "blockquote") {
    assertExactKeys(value, ["content", "type"], [], path);
    assertRichTextChildren(
      value.content,
      [...path, "content"],
      ["bulletList", "orderedList", "paragraph", "horizontalRule", "codeBlock"],
    );
    return;
  }

  invalid([...path, "type"], "unknown_node", "is not permitted.");
}

/** Validates and returns a closed, safe rich-text document. */
export function validateRichTextDocument(value: unknown): SafeRichTextDocument {
  if (!isRecord(value) || value.type !== "doc") {
    invalid([], "invalid_document", "must be a doc node.");
  }
  assertExactKeys(value, ["content", "type"], [], []);
  assertRichTextChildren(
    value.content,
    ["content"],
    [
      "blockquote",
      "bulletList",
      "heading",
      "orderedList",
      "paragraph",
      "horizontalRule",
      "codeBlock",
    ],
  );
  return value as unknown as SafeRichTextDocument;
}

function isSafeRichTextDocument(value: unknown): value is SafeRichTextDocument {
  try {
    validateRichTextDocument(value);
    return true;
  } catch (error) {
    if (error instanceof ContentValidationError) {
      return false;
    }
    throw error;
  }
}

/** A total handler map for every supported field definition. */
export type FieldDefinitionVisitor<Result> = {
  readonly [Type in FieldType]: (
    definition: Extract<FieldDefinition, { readonly type: Type }>,
  ) => Result;
};

/** Visits a field descriptor exhaustively. */
export function visitFieldDefinition<Result>(
  definition: FieldDefinition,
  visitor: FieldDefinitionVisitor<Result>,
): Result {
  switch (definition.type) {
    case "group":
      return visitor.group(definition);
    case "list":
      return visitor.list(definition);
    case "boolean":
      return visitor.boolean(definition);
    case "date":
      return visitor.date(definition);
    case "datetime":
      return visitor.datetime(definition);
    case "media":
      return visitor.media(definition);
    case "number":
      return visitor.number(definition);
    case "richText":
      return visitor.richText(definition);
    case "select":
      return visitor.select(definition);
    case "text":
      return visitor.text(definition);
    case "textarea":
      return visitor.textarea(definition);
    case "url":
      return visitor.url(definition);
  }
}

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
      if (!isSafeUrl(value)) return false;
      if (descriptor.embedProviders === undefined) return true;
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

/** A model field map accepted by the draft and publish validators. */
export type ModelFieldDefinitions = Readonly<Record<string, FieldDefinition>>;

/** Portable normalized values, including incomplete draft groups. */
export type ModelFieldValues = JsonObject;

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

function normalizeFieldValue(
  definition: FieldDefinition,
  value: unknown,
  mode: ContentValidationMode,
  path: readonly ValidationPathSegment[],
  budget: ListBudget,
): JsonValue {
  if (definition.type === "group") {
    if (!isRecord(value)) invalid(path, "invalid_field_value", "must be a group object.");
    return normalizeFieldMap(definition.fields, value, mode, path, budget);
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
): ModelFieldValues {
  if (!isRecord(value)) invalid(path, "invalid_fields", "must be an object.");
  for (const key of Object.keys(value))
    if (!Object.hasOwn(definitions, key))
      invalid([...path, key], "unknown_field", "is not defined by this model.");
  const output: Record<string, JsonValue> = {};
  for (const [key, definition] of Object.entries(definitions)) {
    let present: unknown;
    if (Object.hasOwn(value, key)) present = value[key];
    else if (Object.hasOwn(definition, "defaultValue")) present = definition.defaultValue;
    else {
      if (mode === "publish" && definition.required)
        invalid([...path, key], "missing_required_field", "is required for publication.");
      continue;
    }
    Object.defineProperty(output, key, {
      value: normalizeFieldValue(definition, present, mode, [...path, key], budget),
      enumerable: true,
    });
  }
  return output;
}

/** Validates field data for either an incomplete draft or a publish candidate. */
export function validateModelFields(
  definitions: ModelFieldDefinitions,
  value: unknown,
  mode: ContentValidationMode,
  path: readonly ValidationPathSegment[] = [],
): ModelFieldValues {
  return normalizeFieldMap(definitions, value, mode, path, { count: 0 });
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

/** A declared media leaf with a typed relative path. */
export interface FieldMediaReference {
  readonly mediaId: string;
  readonly path: readonly ValidationPathSegment[];
}

/** Finds declared media leaves only; ordinary strings never become references. */
export function collectFieldMedia(
  definitions: ModelFieldDefinitions,
  values: JsonObject,
): readonly FieldMediaReference[] {
  const references: FieldMediaReference[] = [];
  function visit(
    definition: FieldDefinition,
    value: JsonValue | undefined,
    path: readonly ValidationPathSegment[],
  ): void {
    if (definition.type === "media" && typeof value === "string")
      references.push({ mediaId: value, path });
    else if (definition.type === "group" && isRecord(value))
      walk(definition.fields, value as JsonObject, path);
    else if (definition.type === "list" && Array.isArray(value))
      value.forEach((item, index) => visit(definition.item, item, [...path, index]));
  }
  function walk(
    fields: ModelFieldDefinitions,
    data: JsonObject,
    path: readonly ValidationPathSegment[],
  ): void {
    for (const [key, definition] of Object.entries(fields))
      visit(definition, data[key], [...path, key]);
  }
  walk(definitions, values, []);
  return references;
}

/**
 * Removes one media item from declared media leaves: a matching media value is
 * dropped from its object, and a matching element of a list of media is removed
 * from the list. Every other value is kept; the input is returned unchanged when
 * nothing matches.
 */
export function detachFieldMedia(
  definitions: ModelFieldDefinitions,
  values: JsonObject,
  mediaId: string,
): JsonObject {
  const matches = (definition: FieldDefinition, value: JsonValue | undefined): boolean =>
    definition.type === "media" && value === mediaId;
  function visit(definition: FieldDefinition, value: JsonValue | undefined): JsonValue | undefined {
    if (definition.type === "group" && isRecord(value))
      return walk(definition.fields, value as JsonObject);
    if (definition.type !== "list" || !Array.isArray(value)) return value;
    let changed = false;
    const items: JsonValue[] = [];
    for (const item of value) {
      if (matches(definition.item, item)) {
        changed = true;
        continue;
      }
      const next = visit(definition.item, item)!;
      changed ||= next !== item;
      items.push(next);
    }
    return changed ? items : value;
  }
  function walk(fields: ModelFieldDefinitions, data: JsonObject): JsonObject {
    let result: Record<string, JsonValue> | undefined;
    for (const [key, definition] of Object.entries(fields)) {
      const value = data[key];
      if (matches(definition, value)) {
        result ??= { ...data };
        delete result[key];
        continue;
      }
      const next = visit(definition, value);
      if (next !== value) {
        result ??= { ...data };
        result[key] = next!;
      }
    }
    return result ?? data;
  }
  return walk(definitions, values);
}

/** Keeps legacy scalar keys; nested locations are relative JSON Pointers. */
export function encodeFieldPath(path: readonly ValidationPathSegment[]): string {
  if (path.length === 1) return String(path[0]);
  return (
    "/" + path.map((part) => String(part).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")
  );
}

/** Reads a stored reference path; numeric tokens are list indices under the field-key grammar. */
export function decodeFieldPath(path: string): readonly ValidationPathSegment[] {
  if (!path.startsWith("/")) return [path];
  return path
    .slice(1)
    .split("/")
    .map((part) => {
      const decoded = part.replaceAll("~1", "/").replaceAll("~0", "~");
      return /^(?:0|[1-9][0-9]*)$/u.test(decoded) ? Number(decoded) : decoded;
    });
}

const BLOCK_TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9-]*$/u;
const BLOCK_KEY_PATTERN = /^(?:[A-Za-z][A-Za-z0-9-]*|[0-7][0-9A-HJKMNP-TV-Z]{25})$/u;
const FIELD_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/u;

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
export class BlockConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
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
  readonly label?: string;
  /** Data and settings migrations from earlier versions, keyed by target version. */
  readonly migrations?: BlockMigrations;
  /** Presentational settings: `select`, `boolean`, `number` or `text` fields with defaults. */
  readonly settings?: Settings;
  readonly type: string;
  readonly version: number;
}

/** The data shape inferred from a block's field definitions. */
export type BlockDataValues<Fields extends ModelFieldDefinitions> = Readonly<
  {
    [Key in keyof Fields as FieldIsRequired<Fields[Key]> extends true ? Key : never]: FieldValue<
      Fields[Key]
    >;
  } & {
    readonly [
      Key in keyof Fields as FieldIsRequired<Fields[Key]> extends true ? never : Key
    ]?: FieldValue<Fields[Key]>;
  }
>;

/** The settings record of a block; every setting has a default, so every key is present. */
export type BlockSettingsValues<Settings extends ModelFieldDefinitions> = Readonly<{
  [Key in keyof Settings]: FieldValue<Settings[Key]>;
}>;

/** A detached JSON-safe representation of a block definition. */
export interface BlockMetadata<
  Fields extends ModelFieldDefinitions = ModelFieldDefinitions,
  Settings extends ModelFieldDefinitions = ModelFieldDefinitions,
> {
  readonly defaultValue?: BlockDataValues<Fields>;
  readonly description?: string;
  readonly fields: Fields;
  readonly layout?: FormLayout<keyof Fields & string>;
  readonly settingsLayout?: FormLayout<keyof Settings & string>;
  readonly settingsVisibility?: SettingsVisibility<keyof Settings & string>;
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
> extends BlockMetadata<Fields, Settings> {
  /** Runtime-only migrations keyed by target version; never part of metadata. */
  readonly migrations?: BlockMigrations;
  readonly validate: (value: unknown, mode: ContentValidationMode) => BlockDataValues<Fields>;
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
>(input: BlockDefinitionInput<Fields, Settings>): BlockDefinition<Fields, Settings> {
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
  let defaultValue: BlockDataValues<Fields> | undefined;
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
        validateModelFields(fields, normalized, "draft"),
      ) as BlockDataValues<Fields>;
    } catch (error) {
      if (error instanceof ContentValidationError) {
        blockFail("defaultValue must conform to the block fields.");
      }
      throw error;
    }
  }
  const definition: BlockDefinition<Fields, Settings> = {
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
      if (!isRecord(value)) {
        return validateModelFields(fields, value, mode) as BlockDataValues<Fields>;
      }
      const withDefault = defaultValue === undefined ? value : { ...defaultValue, ...value };
      return validateModelFields(fields, withDefault, mode) as BlockDataValues<Fields>;
    },
    version: input.version,
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
  if (!isRecord(value)) {
    return validateModelFields(definition.fields, value, mode, path) as BlockDataValues<Fields>;
  }
  const withDefault =
    definition.defaultValue === undefined ? value : { ...definition.defaultValue, ...value };
  return validateModelFields(definition.fields, withDefault, mode, path) as BlockDataValues<Fields>;
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
export class BlockMigrationError extends Error {
  public constructor(
    public readonly code: BlockMigrationErrorCode,
    public readonly blockType: string,
    public readonly fromVersion: number,
    public readonly toVersion: number,
    message: string,
    /** Target version of the failing step, for failed or invalid steps. */
    public readonly step?: number,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
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

/**
 * Resolves the alt text of one media usage: a non-blank usage alt (such as the
 * `image` block's `alt`), then a non-blank media alt, then an empty string.
 */
export function effectiveAltText(
  usageAlt: string | null | undefined,
  mediaAlt: string | null | undefined,
): string {
  if (typeof usageAlt === "string" && usageAlt.trim().length > 0) return usageAlt;
  if (typeof mediaAlt === "string" && mediaAlt.trim().length > 0) return mediaAlt;
  return "";
}

/** Shared presentation rules for the independent scalar list settings. */
export function listLayoutSettingsVisibility(): SettingsVisibility<
  "layoutMode" | "layoutWrap" | "layoutPreset"
> {
  return deepFreeze({
    layoutWrap: { setting: "layoutMode", values: ["flex-row", "flex-column"] },
    layoutPreset: { setting: "layoutMode", values: ["grid"] },
  });
}

/** Shared scalar settings for one explicitly adopted list, in any block. */
export function listLayoutSettings() {
  const cells = (rects: readonly (readonly [number, number, number, number])[]): ChoiceDiagram => ({
    cells: rects.map(([x, y, width, height]) => ({ x, y, width, height })),
  });
  const columns = (count: number): ChoiceDiagram =>
    cells(
      Array.from({ length: count }, (_, i) => [i * (12 / count), 0, 12 / count - 1, 12] as const),
    );
  return deepFreeze({
    layoutMode: field.select({
      options: ["flex-row", "flex-column", "grid"],
      required: true,
      defaultValue: "grid",
      label: "Arrangement",
      presentation: {
        control: "cards",
        choices: [
          {
            value: "flex-row",
            label: "Horizontal",
            description: "Items flow across rows.",
            diagram: columns(3),
          },
          {
            value: "flex-column",
            label: "Vertical",
            description: "Items flow down columns. Wrapping needs a height set in site CSS.",
            diagram: cells([
              [0, 0, 12, 3],
              [0, 4, 12, 3],
              [0, 8, 12, 3],
            ]),
          },
          {
            value: "grid",
            label: "Grid",
            description: "Items use the selected grid preset.",
            diagram: cells([
              [0, 0, 5, 5],
              [6, 0, 5, 5],
              [0, 6, 5, 5],
              [6, 6, 5, 5],
            ]),
          },
        ],
      },
    }),
    layoutWrap: field.boolean({
      defaultValue: true,
      label: "Wrap items",
      description:
        "Applies to horizontal and vertical flex lists. Vertical wrapping requires a height set in site CSS.",
    }),
    layoutPreset: field.select({
      options: [
        "auto",
        "columns-2",
        "columns-3",
        "columns-4",
        "narrow-wide",
        "wide-narrow",
        "featured-first",
      ],
      required: true,
      defaultValue: "auto",
      label: "Grid preset",
      description:
        "Applies when Grid is selected. Schematics show composition; your site controls styling.",
      presentation: {
        control: "cards",
        choices: [
          {
            value: "auto",
            label: "Auto",
            description: "As many equal columns as fit.",
            diagram: cells([
              [0, 0, 3, 5],
              [4, 0, 3, 5],
              [8, 0, 3, 5],
              [0, 6, 3, 5],
              [4, 6, 3, 5],
            ]),
          },
          {
            value: "columns-2",
            label: "Two columns",
            description: "Two equal columns from 32rem.",
            diagram: columns(2),
          },
          {
            value: "columns-3",
            label: "Three columns",
            description: "Two from 32rem, three from 48rem.",
            diagram: columns(3),
          },
          {
            value: "columns-4",
            label: "Four columns",
            description: "Two from 32rem, three from 48rem, four from 64rem.",
            diagram: columns(4),
          },
          {
            value: "narrow-wide",
            label: "Narrow + wide",
            description: "Alternating 1:2 columns from 32rem.",
            diagram: cells([
              [0, 0, 3, 12],
              [4, 0, 8, 12],
            ]),
          },
          {
            value: "wide-narrow",
            label: "Wide + narrow",
            description: "Alternating 2:1 columns from 32rem.",
            diagram: cells([
              [0, 0, 8, 12],
              [9, 0, 3, 12],
            ]),
          },
          {
            value: "featured-first",
            label: "Featured first",
            description: "First item spans two columns from 32rem.",
            diagram: cells([
              [0, 0, 12, 5],
              [0, 6, 5, 5],
              [6, 6, 5, 5],
            ]),
          },
        ],
      },
    }),
  });
}

// The opt-in full-screen original of the `image` and `gallery` blocks.
const lightboxSetting = field.boolean({
  defaultValue: false,
  description: "Opens the original image full screen when it is selected.",
  label: "Open full screen",
});

// The optional link of an `image` block and of each `gallery` item.
const imageLinkField = field.url({
  description: "Selecting the image opens this link instead of the full-screen view.",
  label: "Link",
});

/** Starter blocks implemented exclusively through the public block and field DSL. */
export const builtInBlocks = deepFreeze({
  cta: defineBlock({
    description: "A heading and a link that prompts the reader to act.",
    fields: {
      actionLabel: field.text({ required: true }),
      actionUrl: field.url({ required: true }),
      body: field.richText(),
      heading: field.text({ required: true }),
    },
    label: "Call to action",
    type: "cta",
    version: 1,
  }),
  gallery: defineBlock({
    description: "A list of images with selectable layouts and optional captions.",
    fields: {
      images: field.list({
        defaultValue: [],
        item: field.group({
          // Media comes first so editors show the image before its overrides.
          fields: {
            media: field.media({ label: "Image", required: true }),
            alt: field.text({
              description: "Leave empty to use the media item's alt text.",
              label: "Alt text",
            }),
            caption: field.text({
              description: "Leave empty to use the media item's caption.",
              label: "Caption",
            }),
            link: imageLinkField,
          },
        }),
        itemLabel: "caption",
        label: "Images",
        maxItems: 50,
        minItems: 1,
      }),
      title: field.text({ label: "Title" }),
    },
    label: "Gallery",
    // Version 2 only added the lightbox setting and version 3 only the optional
    // item link. Version 4 adds scalar layout defaults; data stays valid.
    migrations: { 2: (block) => block, 3: (block) => block, 4: (block) => block },
    settings: { ...listLayoutSettings(), lightbox: lightboxSetting },
    settingsVisibility: listLayoutSettingsVisibility(),
    settingsLayout: {
      mode: "sections",
      groups: [
        { key: "layout", label: "Layout", fields: ["layoutMode", "layoutWrap", "layoutPreset"] },
        { key: "behavior", label: "Behavior", fields: ["lightbox"] },
      ],
    },
    type: "gallery",
    version: 4,
  }),
  hero: defineBlock({
    description: "Large heading with optional text, image, and action.",
    fields: {
      body: field.richText(),
      eyebrow: field.text(),
      heading: field.text({ required: true }),
      image: field.media(),
      primaryActionLabel: field.text(),
      primaryActionUrl: field.url(),
    },
    label: "Hero",
    type: "hero",
    version: 1,
  }),
  image: defineBlock({
    description:
      "A single image with an optional caption and alt text that overrides the media alt.",
    // Media comes first so editors show the image before its overrides.
    fields: {
      media: field.media({ required: true }),
      alt: field.text(),
      caption: field.text(),
      link: imageLinkField,
    },
    label: "Image",
    // Version 2 only made `alt` optional, version 3 only added the lightbox
    // setting and version 4 only the optional link, so earlier data is valid.
    migrations: { 2: (block) => block, 3: (block) => block, 4: (block) => block },
    settings: { lightbox: lightboxSetting },
    type: "image",
    version: 4,
  }),
  navigation: defineBlock({
    description: "A list of links with optional one-level submenus.",
    fields: {
      links: field.list({
        defaultValue: [],
        item: field.group({
          fields: {
            children: field.list({
              item: field.group({
                fields: {
                  label: field.text({ label: "Label", required: true }),
                  url: field.url({ label: "URL", required: true }),
                },
              }),
              itemLabel: "label",
              label: "Submenu links",
              maxItems: 20,
            }),
            label: field.text({ label: "Label", required: true }),
            url: field.url({
              description: "Optional when the link has submenu links.",
              label: "URL",
            }),
          },
        }),
        itemLabel: "label",
        label: "Links",
        maxItems: 20,
        minItems: 1,
      }),
      name: field.text({
        description: "Read by screen readers, for example Main or On this page.",
        label: "Navigation name",
      }),
    },
    label: "Navigation",
    type: "navigation",
    version: 1,
  }),
  quote: defineBlock({
    description: "A quotation with optional attribution.",
    fields: {
      attribution: field.text(),
      quote: field.text({ required: true }),
    },
    label: "Quote",
    type: "quote",
    version: 1,
  }),
  richText: defineBlock({
    description: "Formatted text with headings, lists, and links.",
    fields: { content: field.richText({ required: true }) },
    label: "Rich text",
    type: "richText",
    version: 1,
  }),
  videoEmbed: defineBlock({
    type: "videoEmbed",
    version: 1,
    label: "Video embed",
    description: "A YouTube or Vimeo video with an optional image preview.",
    fields: {
      url: field.url({
        required: true,
        embedProviders: ["youtube", "vimeo"],
        label: "Video URL",
        description: "Paste a YouTube or Vimeo video link, not iframe code.",
      }),
      title: field.text({
        required: true,
        minLength: 1,
        label: "Title",
        description: "Names the video for visitors using assistive technology.",
      }),
      poster: field.media({
        label: "Preview image",
        description: "Optional. Load the video player only when a visitor selects this preview.",
      }),
      caption: field.text({ label: "Caption" }),
    },
  }),
});

/** Maximum title length shared by draft, publish, REST, and admin validation. */
export const MAX_TITLE_LENGTH = 200;
/** Maximum slug length shared by publish, REST, and admin validation. */
export const MAX_SLUG_LENGTH = 100;
/** Maximum flat top-level block count for one entry. */
export const MAX_TOP_LEVEL_BLOCKS = 200;
/** Maximum UTF-8 bytes in fields JSON or a single block data JSON value. */
export const MAX_JSON_BYTES = 1_000_000;

/** Model kinds: routed singletons, routed lists, and route-less singletons. */
export type ContentModelKind = "collection" | "global" | "page";

/** A block-like value whose data can be limited before the Step 3 block registry exists. */
export interface EntryBlockData {
  readonly data: JsonValue;
}

/** System data validated alongside a model field record. */
export interface EntryPayloadInput {
  readonly blocks: readonly EntryBlockData[];
  readonly fields: JsonObject;
  readonly kind: ContentModelKind;
  readonly slug?: string;
  readonly title: string;
}

/** Returns canonical JSON with recursively sorted object keys. */
export function canonicalizeJson(value: JsonValue): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(",")}]`;
  }
  const object = value as JsonObject;
  const entries = Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(object[key]!)}`);
  return `{${entries.join(",")}}`;
}

interface TextEncoderLike {
  encode(input: string): Uint8Array;
}

interface TextEncoderConstructorLike {
  new (): TextEncoderLike;
}

/** Gets the UTF-8 byte count of portable JSON through canonical serialization. */
export function canonicalJsonByteLength(value: JsonValue): number {
  const TextEncoderConstructor = (
    globalThis as unknown as { readonly TextEncoder?: TextEncoderConstructorLike }
  ).TextEncoder;
  if (TextEncoderConstructor === undefined) {
    throw new Error("TextEncoder is required for canonical JSON byte measurement.");
  }
  return new TextEncoderConstructor().encode(canonicalizeJson(value)).byteLength;
}

/** Minimal portable shape used by the SHA-256 helper. */
export interface WebCryptoLike {
  readonly subtle: {
    digest(algorithm: "SHA-256", data: Uint8Array): Promise<ArrayBuffer>;
  };
}

function getWebCrypto(): WebCryptoLike {
  const crypto = (globalThis as unknown as { readonly crypto?: WebCryptoLike }).crypto;
  if (crypto === undefined) {
    throw new Error("Web Crypto is required for canonical JSON hashing.");
  }
  return crypto;
}

/** Hashes canonical JSON UTF-8 bytes with Web Crypto SHA-256 as lowercase hexadecimal. */
export async function sha256CanonicalJson(
  value: JsonValue,
  webCrypto: WebCryptoLike = getWebCrypto(),
): Promise<string> {
  const TextEncoderConstructor = (
    globalThis as unknown as { readonly TextEncoder?: TextEncoderConstructorLike }
  ).TextEncoder;
  if (TextEncoderConstructor === undefined) {
    throw new Error("TextEncoder is required for canonical JSON hashing.");
  }
  const digest = new Uint8Array(
    await webCrypto.subtle.digest(
      "SHA-256",
      new TextEncoderConstructor().encode(canonicalizeJson(value)),
    ),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function assertJsonSize(value: JsonValue, path: readonly ValidationPathSegment[]): void {
  if (canonicalJsonByteLength(value) > MAX_JSON_BYTES) {
    invalid(path, "json_too_large", `must not exceed ${MAX_JSON_BYTES} UTF-8 bytes.`);
  }
}

/** Validates system entry data and shared payload limits for a draft or publish candidate. */
export function validateEntryPayload(
  input: EntryPayloadInput,
  mode: ContentValidationMode,
): EntryPayloadInput {
  if (input.kind !== "collection" && input.kind !== "global" && input.kind !== "page") {
    invalid(["kind"], "invalid_model_kind", "must be page, collection, or global.");
  }
  if (typeof input.title !== "string" || input.title.length === 0) {
    invalid(["title"], "missing_title", "is required.");
  }
  if (input.title.length > MAX_TITLE_LENGTH) {
    invalid(["title"], "title_too_long", `must not exceed ${MAX_TITLE_LENGTH} characters.`);
  }
  if (
    input.slug !== undefined &&
    (typeof input.slug !== "string" || input.slug.length > MAX_SLUG_LENGTH)
  ) {
    invalid(["slug"], "slug_too_long", `must not exceed ${MAX_SLUG_LENGTH} characters.`);
  }
  if (input.kind === "global" && input.slug !== undefined) {
    invalid(["slug"], "slug_not_allowed", "is not allowed for a global.");
  }
  if (
    mode === "publish" &&
    input.kind === "collection" &&
    (input.slug === undefined || input.slug.length === 0)
  ) {
    invalid(["slug"], "missing_slug", "is required for collection publication.");
  }
  if (!Array.isArray(input.blocks)) {
    invalid(["blocks"], "invalid_blocks", "must be an array.");
  }
  if (input.blocks.length > MAX_TOP_LEVEL_BLOCKS) {
    invalid(
      ["blocks"],
      "too_many_blocks",
      `must not contain more than ${MAX_TOP_LEVEL_BLOCKS} blocks.`,
    );
  }
  assertJsonSize(input.fields, ["fields"]);
  for (const [index, block] of input.blocks.entries()) {
    if (!isRecord(block) || !Object.hasOwn(block, "data")) {
      invalid(["blocks", index], "invalid_block", "must contain JSON data.");
    }
    assertJsonSize(block.data as JsonValue, ["blocks", index, "data"]);
  }
  return input;
}

/** Model information required to validate a complete entry aggregate. */
export interface EntryAggregateModel {
  readonly blocks: readonly string[];
  readonly fields: ModelFieldDefinitions;
  readonly kind: ContentModelKind;
}

/** One ordered, typed block submitted as part of an entry aggregate. */
export interface EntryAggregateBlock {
  readonly anchor?: string;
  readonly className?: string;
  readonly data: JsonObject;
  readonly hidden?: boolean;
  readonly key: string;
  readonly schemaVersion: number;
  readonly settings?: JsonObject;
  readonly type: string;
}

/** A validated block: normalized data, settings with defaults, and the envelope. */
export interface ValidatedEntryAggregateBlock {
  readonly anchor?: string;
  readonly className?: string;
  readonly data: ModelFieldValues;
  readonly hidden: boolean;
  readonly key: string;
  readonly schemaVersion: number;
  readonly settings: JsonObject;
  readonly type: string;
}

/** A full draft or publish candidate validated against a model and its registry. */
export interface EntryAggregateInput {
  readonly blocks: readonly EntryAggregateBlock[];
  readonly fields: JsonObject;
  readonly kind: ContentModelKind;
  readonly slug?: string;
  readonly title: string;
}

/** The normalized form of a valid entry aggregate. */
export interface ValidatedEntryAggregate {
  readonly blocks: readonly ValidatedEntryAggregateBlock[];
  readonly fields: ModelFieldValues;
  readonly kind: ContentModelKind;
  readonly slug?: string;
  readonly title: string;
}

/** Validates all system, model-field, and ordered block data for one content entry. */
export function validateEntryAggregate(
  input: EntryAggregateInput,
  model: EntryAggregateModel,
  registry: BlockRegistry,
  mode: ContentValidationMode,
): ValidatedEntryAggregate {
  if (input.kind !== model.kind) {
    invalid(["kind"], "model_kind_mismatch", "must match the content model kind.");
  }
  validateEntryPayload(
    {
      blocks: input.blocks,
      fields: {},
      kind: input.kind,
      ...(input.slug === undefined ? {} : { slug: input.slug }),
      title: input.title,
    },
    mode,
  );
  const fields = validateModelFields(model.fields, input.fields, mode, ["fields"]);
  assertJsonSize(fields as JsonValue, ["fields"]);

  const keys = new Set<string>();
  const anchors = new Set<string>();
  const blocks: ValidatedEntryAggregateBlock[] = [];
  for (const [index, block] of input.blocks.entries()) {
    const path: readonly ValidationPathSegment[] = ["blocks", index];
    if (!isRecord(block)) {
      invalid(path, "invalid_block", "must be an object.");
    }
    assertExactKeys(
      block,
      ["data", "key", "schemaVersion", "type"],
      ["anchor", "className", "hidden", "settings"],
      path,
    );
    if (typeof block.key !== "string" || !BLOCK_KEY_PATTERN.test(block.key)) {
      invalid([...path, "key"], "invalid_block_key", "must be a stable block key.");
    }
    if (keys.has(block.key)) {
      invalid([...path, "key"], "duplicate_block_key", "must be unique within the entry.");
    }
    keys.add(block.key);
    if (typeof block.type !== "string") {
      invalid([...path, "type"], "invalid_block_type", "must be a string.");
    }
    if (!model.blocks.includes(block.type)) {
      invalid([...path, "type"], "disallowed_block_type", "is not allowed by this model.");
    }
    const definition = registry.get(block.type);
    if (definition === undefined) {
      invalid([...path, "type"], "unregistered_block_type", "is not registered.");
    }
    if (block.schemaVersion !== definition.version) {
      invalid(
        [...path, "schemaVersion"],
        "stale_block_version",
        "does not match the registered version.",
      );
    }
    if (block.anchor !== undefined) {
      if (!isBlockAnchor(block.anchor)) {
        invalid(
          [...path, "anchor"],
          "invalid_block_anchor",
          `must start with a lowercase letter and use only lowercase letters, digits and hyphens, up to ${MAX_BLOCK_ANCHOR_LENGTH} characters.`,
        );
      }
      if (anchors.has(block.anchor)) {
        invalid([...path, "anchor"], "duplicate_block_anchor", "must be unique within the entry.");
      }
      anchors.add(block.anchor);
    }
    let className: string | undefined;
    if (block.className !== undefined) {
      className = normalizeBlockClassName(block.className);
      if (className === undefined) {
        invalid(
          [...path, "className"],
          "invalid_block_class_name",
          `must hold 1 to ${MAX_BLOCK_CLASS_TOKENS} valid class tokens, up to ${MAX_BLOCK_CLASS_NAME_LENGTH} characters.`,
        );
      }
    }
    if (block.hidden !== undefined && typeof block.hidden !== "boolean") {
      invalid([...path, "hidden"], "invalid_block_hidden", "must be a boolean.");
    }
    const hidden = block.hidden === true;
    const settings = validateBlockSettings(definition, block.settings ?? {}, [...path, "settings"]);
    assertJsonSize(block.data as JsonValue, [...path, "data"]);
    // A hidden block is never delivered, so publication accepts it unfinished.
    const data = validateBlockData(definition, block.data, hidden ? "draft" : mode, [
      ...path,
      "data",
    ]);
    assertJsonSize(data as JsonValue, [...path, "data"]);
    blocks.push(
      deepFreeze({
        ...(block.anchor === undefined ? {} : { anchor: block.anchor }),
        ...(className === undefined ? {} : { className }),
        data: data as ModelFieldValues,
        hidden,
        key: block.key,
        schemaVersion: block.schemaVersion,
        settings,
        type: block.type,
      }),
    );
  }
  validateSnapshotListBudget(
    model.fields,
    fields,
    blocks.map((block, index) => ({
      fields: registry.get(block.type)!.fields,
      data: block.data,
      path: ["blocks", index, "data"],
    })),
  );
  return deepFreeze({
    blocks: deepFreeze(blocks),
    fields,
    kind: input.kind,
    ...(input.slug === undefined ? {} : { slug: input.slug }),
    title: input.title,
  });
}

export { parseSchemaPath, encodeSchemaPath, schemaFieldAt } from "./schema-path.js";

/** Raw UTF-16 units: the existing text/textarea length contract, without trimming. */
export function textLength(value: string): number {
  return value.length;
}

/** Trimmed Unicode code points: the existing SEO title/description contract. */
export function seoTextLength(value: string): number {
  return [...value.trim()].length;
}

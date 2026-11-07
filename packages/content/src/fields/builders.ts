import type { MutableJsonObject, MutableJsonValue } from "../shared/json.js";
import { normalizeJsonValue } from "../shared/json.js";
import { fail, FieldConfigurationError, ContentValidationError } from "../shared/errors.js";
import type { FieldType } from "./capabilities.js";
import { fieldTypeCapabilities } from "./capabilities.js";
import type {
  TextFieldDefinition,
  TextareaFieldDefinition,
  StringFieldOptions,
  DateFieldDefinition,
  DatetimeFieldDefinition,
  MediaFieldDefinition,
  UrlFieldDefinition,
  StringValueFieldOptions,
  FieldDefinition,
  ModelFieldDefinitions,
  CommonFieldOptions,
  DraftFieldValue,
  FormLayout,
  FieldVisibilityInput,
  CommonDefinition,
  PropertyFrom,
  ListItemDefinition,
  RichTextFieldOptions,
  RichTextFieldDefinition,
  NumberFieldOptions,
  NumberFieldDefinition,
  BooleanFieldOptions,
  BooleanFieldDefinition,
  SelectFieldOptions,
  SelectFieldDefinition,
  UrlFieldOptions,
  SelectPresentation,
  ChoiceDiagram,
  FieldMetadata,
  GroupFieldDefinition,
  ListFieldDefinition,
} from "./definitions.js";
import {
  MAX_FIELD_CONTAINER_DEPTH,
  MAX_CONSECUTIVE_GROUPS,
  FIELD_KEY_PATTERN,
  MAX_LIST_ITEMS,
} from "./definitions.js";
import { textLength, normalizeFieldValue } from "./validation.js";
import { deepFreeze, isRecord } from "../shared/objects.js";
import { parseVideoEmbed, VIDEO_EMBED_PROVIDERS } from "./video-embeds.js";
import { isSafeUrl, isSafeRichTextDocument } from "./rich-text.js";
import { normalizeFormLayout } from "./layout.js";
import { normalizeFieldVisibility } from "./visibility.js";

function normalizeOptions(options: unknown): MutableJsonObject {
  const normalized = normalizeJsonValue(options, "options");
  if (normalized === null || Array.isArray(normalized) || typeof normalized !== "object") {
    fail("options", "must be a plain object.");
  }

  return normalized;
}

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
    if (!FIELD_KEY_PATTERN.test(renamedFrom)) {
      fail("options.renamedFrom", "must be a valid field key.");
    }
    definition.renamedFrom = renamedFrom;
  }

  definition.required = readOptionalBoolean(options, "required") ?? false;
}

function assertAllowedOptions(
  options: MutableJsonObject,
  allowed: readonly string[],
  type?: FieldType,
): void {
  if (type !== undefined && fieldTypeCapabilities[type].placeholder)
    allowed = [...allowed, "placeholder"];
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

function buildStringField<
  Type extends TextFieldDefinition["type"] | TextareaFieldDefinition["type"],
  Options extends StringFieldOptions,
>(
  type: Type,
  input: Options | undefined,
): Type extends "text" ? TextFieldDefinition<Options> : TextareaFieldDefinition<Options> {
  const options = normalizeOptions(input ?? {});
  assertAllowedOptions(
    options,
    ["defaultValue", "description", "label", "maxLength", "minLength", "required"],
    type,
  );
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
  Type extends
    | DateFieldDefinition["type"]
    | DatetimeFieldDefinition["type"]
    | MediaFieldDefinition["type"]
    | UrlFieldDefinition["type"],
  Options extends StringValueFieldOptions,
>(type: Type, input: Options | undefined): FieldDefinition {
  const options = normalizeOptions(input ?? {});
  assertAllowedOptions(
    options,
    [
      "defaultValue",
      "description",
      "label",
      "required",
      ...(type === "url" ? ["embedProviders"] : []),
    ],
    type,
  );
  const definition: Record<string, unknown> = { type };
  addCommonOptions(definition, options);
  if (type === "url" && options.embedProviders !== undefined) {
    const providers = options.embedProviders;
    if (
      !Array.isArray(providers) ||
      providers.length === 0 ||
      providers.some(
        (provider) => !(VIDEO_EMBED_PROVIDERS as readonly MutableJsonValue[]).includes(provider),
      ) ||
      new Set(providers).size !== providers.length
    )
      fail("options.embedProviders", "must be a non-empty unique list of youtube and vimeo.");
    definition.embedProviders = VIDEO_EMBED_PROVIDERS.filter((provider) =>
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
      > & {
        readonly layout?: FormLayout<keyof Options["fields"] & string>;
        readonly visibility?: FieldVisibilityInput<Options["fields"], Options>;
      },
  ): CommonDefinition<"group", Options> &
    PropertyFrom<Options, "layout"> &
    PropertyFrom<Options, "visibility"> & { readonly fields: Options["fields"] } {
    return normalizeCompositeOptions("group", options) as unknown as CommonDefinition<
      "group",
      Options
    > &
      PropertyFrom<Options, "layout"> &
      PropertyFrom<Options, "visibility"> & { readonly fields: Options["fields"] };
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
    assertAllowedOptions(
      normalized,
      ["defaultValue", "description", "label", "required"],
      "richText",
    );
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
    assertAllowedOptions(
      normalized,
      ["defaultValue", "description", "label", "max", "min", "required"],
      "number",
    );
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
    assertAllowedOptions(
      normalized,
      ["defaultValue", "description", "label", "options", "presentation", "required"],
      "select",
    );
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

function normalizeCompositeOptions(
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

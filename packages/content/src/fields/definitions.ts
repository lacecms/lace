import type { EmbedProvider } from "./video-embeds.js";
import type { SafeRichTextDocument } from "./rich-text.js";
import type { FieldType } from "./capabilities.js";
import type { JsonObject, JsonValue } from "../shared/json.js";

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

export type PropertyFrom<Options, Key extends string> = Key extends keyof Options
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

export type CommonDefinition<Type extends FieldType, Options> = {
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

/** A sibling rule: its target applies only while `field` holds one of `values`. */
export interface FieldVisibilityRule<
  Controller extends string = string,
  Value extends boolean | string = boolean | string,
> {
  readonly field: Controller;
  readonly values: readonly Value[];
}

type VisibilityControllerValue<Definition> = Definition extends { readonly type: "boolean" }
  ? boolean
  : Definition extends {
        readonly type: "select";
        readonly options: readonly (infer Choice extends string)[];
      }
    ? Choice
    : never;

type VisibilityControllerKey<Fields> = {
  [Key in keyof Fields & string]: [VisibilityControllerValue<Fields[Key]>] extends [never]
    ? never
    : Key;
}[keyof Fields & string];

type VisibilityRuleFor<Fields, Target extends string> = {
  [Controller in Exclude<VisibilityControllerKey<Fields>, Target>]: FieldVisibilityRule<
    Controller,
    VisibilityControllerValue<Fields[Controller]>
  >;
}[Exclude<VisibilityControllerKey<Fields>, Target>];

/** Conditional-field rules of one field-map owner, keyed by target field. */
export type FieldVisibility<Fields = ModelFieldDefinitions> = string extends keyof Fields
  ? Readonly<Record<string, FieldVisibilityRule>>
  : Readonly<{
      [Target in keyof Fields & string]?: VisibilityRuleFor<Fields, Target>;
    }>;

/** Rejects rule targets outside `Fields` when the rules are part of an inferred input. */
export type FieldVisibilityInput<Fields, Options> = FieldVisibility<Fields> &
  (Options extends { readonly visibility: infer Given }
    ? { readonly [Key in Exclude<keyof Given, keyof Fields>]: never }
    : unknown);

/** A finite group of named child descriptors. */
export interface GroupFieldDefinition {
  readonly layout?: FormLayout;
  /** Conditional-field rules over the group's immediate children. */
  readonly visibility?: FieldVisibility;
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
            : Definition extends { readonly visibility: infer Visibility }
              ? BlockDataValues<Fields, Visibility>
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

/** A model field map accepted by the draft and publish validators. */
export type ModelFieldDefinitions = Readonly<Record<string, FieldDefinition>>;

/** Portable normalized values, including incomplete draft groups. */
export type ModelFieldValues = JsonObject;
/** Field key grammar without anchors, for OpenAPI strings and composed grammars. */
export const FIELD_KEY_SOURCE = "[A-Za-z][A-Za-z0-9]*";
/** Field keys: an ASCII letter followed by ASCII letters or digits. */
export const FIELD_KEY_PATTERN = new RegExp(`^${FIELD_KEY_SOURCE}$`, "u");

/**
 * The target keys of an owner's inferred conditional-field rules: keys the
 * inferred rules declare. Keys that are merely permitted (optional, as in a
 * wide `FieldVisibility<Fields>`) are not targets.
 */
export type FieldVisibilityTargets<Visibility> = [Visibility] extends [undefined]
  ? never
  : {
      [Key in keyof NonNullable<Visibility>]-?: {} extends Pick<NonNullable<Visibility>, Key>
        ? never
        : Key;
    }[keyof NonNullable<Visibility>];

/**
 * The data shape inferred from a block's field definitions. Conditional targets
 * named by `Visibility` are optional: they are absent while hidden.
 */
export type BlockDataValues<
  Fields extends ModelFieldDefinitions,
  Visibility = undefined,
> = Readonly<
  {
    [
      Key in keyof Fields as Key extends FieldVisibilityTargets<Visibility>
        ? never
        : FieldIsRequired<Fields[Key]> extends true
          ? Key
          : never
    ]: FieldValue<Fields[Key]>;
  } & {
    readonly [
      Key in keyof Fields as Key extends FieldVisibilityTargets<Visibility>
        ? Key
        : FieldIsRequired<Fields[Key]> extends true
          ? never
          : Key
    ]?: FieldValue<Fields[Key]>;
  }
>;

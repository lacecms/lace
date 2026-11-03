import { deepFreeze } from "../shared/objects.js";

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

/** Portable facts shared by configuration, queries, transport and admin support. */
export type FieldSortFamily = "string" | "number" | "boolean" | "date" | "datetime";
export type FieldFilterKind = "text" | "select" | "number" | "boolean" | "date" | "datetime";
export type FieldValueKind = "string" | "number" | "boolean" | "object" | "array";
export type FieldTypeCapability = {
  readonly searchable: boolean;
  readonly seoText: boolean;
  readonly itemLabel: boolean;
  readonly placeholder: boolean;
  readonly valueKind: FieldValueKind;
} & (
  | {
      readonly listQueryable: true;
      readonly sortableAs: FieldSortFamily;
      readonly filterKind: FieldFilterKind;
    }
  | { readonly listQueryable: false; readonly sortableAs?: never; readonly filterKind?: never }
);

const declaredFieldTypeCapabilities = deepFreeze({
  text: {
    listQueryable: true,
    sortableAs: "string",
    filterKind: "text",
    searchable: true,
    seoText: true,
    itemLabel: true,
    placeholder: true,
    valueKind: "string",
  },
  textarea: {
    listQueryable: true,
    sortableAs: "string",
    filterKind: "text",
    searchable: true,
    seoText: true,
    itemLabel: true,
    placeholder: true,
    valueKind: "string",
  },
  richText: {
    listQueryable: false,
    searchable: false,
    seoText: false,
    itemLabel: false,
    placeholder: true,
    valueKind: "object",
  },
  number: {
    listQueryable: true,
    sortableAs: "number",
    filterKind: "number",
    searchable: false,
    seoText: false,
    itemLabel: false,
    placeholder: true,
    valueKind: "number",
  },
  boolean: {
    listQueryable: true,
    sortableAs: "boolean",
    filterKind: "boolean",
    searchable: false,
    seoText: false,
    itemLabel: false,
    placeholder: false,
    valueKind: "boolean",
  },
  date: {
    listQueryable: true,
    sortableAs: "date",
    filterKind: "date",
    searchable: false,
    seoText: false,
    itemLabel: false,
    placeholder: false,
    valueKind: "string",
  },
  datetime: {
    listQueryable: true,
    sortableAs: "datetime",
    filterKind: "datetime",
    searchable: false,
    seoText: false,
    itemLabel: false,
    placeholder: false,
    valueKind: "string",
  },
  select: {
    listQueryable: true,
    sortableAs: "string",
    filterKind: "select",
    searchable: false,
    seoText: false,
    itemLabel: true,
    placeholder: true,
    valueKind: "string",
  },
  url: {
    listQueryable: true,
    sortableAs: "string",
    filterKind: "text",
    searchable: false,
    seoText: false,
    itemLabel: true,
    placeholder: true,
    valueKind: "string",
  },
  media: {
    listQueryable: false,
    searchable: false,
    seoText: false,
    itemLabel: false,
    placeholder: false,
    valueKind: "string",
  },
  group: {
    listQueryable: false,
    searchable: false,
    seoText: false,
    itemLabel: false,
    placeholder: false,
    valueKind: "object",
  },
  list: {
    listQueryable: false,
    searchable: false,
    seoText: false,
    itemLabel: false,
    placeholder: false,
    valueKind: "array",
  },
} as const satisfies { readonly [Type in FieldType]: FieldTypeCapability });

// Keep the public lookup total even while a newly introduced kind is missing
// its declaration: the resulting diagnostics belong at this source of truth.
export const fieldTypeCapabilities: typeof declaredFieldTypeCapabilities &
  Readonly<Record<FieldType, FieldTypeCapability>> = declaredFieldTypeCapabilities;

export const FIELD_FILTER_OPERATIONS = deepFreeze({
  text: ["contains", "eq"],
  select: ["in"],
  number: ["eq", "range"],
  boolean: ["eq"],
  date: ["range"],
  datetime: ["range"],
} as const satisfies Record<FieldFilterKind, readonly string[]>);

type DeclaredFieldType = keyof typeof declaredFieldTypeCapabilities;
type TypesWhere<
  Key extends keyof (typeof declaredFieldTypeCapabilities)[DeclaredFieldType],
  Value,
> = {
  [Type in DeclaredFieldType]: (typeof declaredFieldTypeCapabilities)[Type][Key] extends Value
    ? Type
    : never;
}[DeclaredFieldType];
export type ListQueryableFieldType = TypesWhere<"listQueryable", true>;
export type SearchableFieldType = TypesWhere<"searchable", true>;
export type SeoTextFieldType = TypesWhere<"seoText", true>;
export type ItemLabelFieldType = TypesWhere<"itemLabel", true>;
export type PlaceholderFieldType = TypesWhere<"placeholder", true>;

/** Field kinds with a boolean capability, in stable declaration order. */
export function fieldTypesWith<
  Key extends "listQueryable" | "searchable" | "seoText" | "itemLabel" | "placeholder",
>(capability: Key): readonly TypesWhere<Key, true>[] {
  return Object.freeze(
    (Object.keys(fieldTypeCapabilities) as FieldType[]).filter(
      (type) => fieldTypeCapabilities[type][capability],
    ),
  ) as TypesWhere<Key, true>[];
}

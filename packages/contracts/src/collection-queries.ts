import * as v from "valibot";
export {
  COLLECTION_MATCHING_VERSION,
  NODE_LIST_QUERY_LIMITS,
  CLOUDFLARE_LIST_QUERY_LIMITS,
  fitsListQueryLimits,
} from "@lacecms/content";
export type { ListQueryLimits } from "@lacecms/content";

export const listQueryLimitsSchema = v.strictObject({
  maxSearchLength: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(1),
    v.maxValue(200),
    v.description(
      "q/contains UTF-16-code-unit ceiling: Node/VPS 200; Cloudflare 48. q is trimmed before validation; contains preserves whitespace. Text eq retains 200.",
    ),
  ),
  maxLikePatternBytes: v.nullable(
    v.pipe(
      v.number(),
      v.integer(),
      v.minValue(2),
      v.maxValue(50),
      v.description(
        "Final literal LIKE UTF-8 byte ceiling after escaping backslash, percent and underscore and adding two substring wrappers. Cloudflare 50; Node/VPS null. ASCII case-insensitive, non-ASCII case-sensitive.",
      ),
    ),
  ),
});

export const MAX_COLLECTION_FILTERS = 16;
export const MAX_COLLECTION_FILTER_BYTES = 8192;
export const MAX_COLLECTION_SELECT_VALUES = 50;
export const MAX_COLLECTION_QUERY_TEXT = 200;
export const collectionQueryFieldSchema = v.pipe(v.string(), v.regex(/^[A-Za-z][A-Za-z0-9]*$/u));
const text = v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_COLLECTION_QUERY_TEXT));
const number = v.pipe(v.number(), v.finite());
const base = { field: collectionQueryFieldSchema };

function calendarDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
  );
}

/** Explicit-offset instants normalize before range checks and query identity. */
export const collectionDatetimeOperandSchema = v.pipe(
  v.string(),
  v.check(
    (value) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) &&
      calendarDate(value.slice(0, 10)) &&
      Number.isFinite(Date.parse(value)) &&
      Number(value.slice(11, 13)) < 24 &&
      Number(value.slice(14, 16)) < 60 &&
      Number(value.slice(17, 19)) < 60,
    "Expected an explicit-offset ISO datetime.",
  ),
  v.transform((value) => new Date(value).toISOString()),
);
const date = v.pipe(v.string(), v.check(calendarDate, "Expected a calendar date."));
const endpoint = v.union([date, collectionDatetimeOperandSchema]);

export const collectionFieldFilterSchema = v.union([
  v.strictObject({ ...base, op: v.literal("isSet") }),
  v.strictObject({ ...base, op: v.literal("isNotSet") }),
  v.strictObject({ ...base, op: v.literal("eq"), value: v.union([text, number, v.boolean()]) }),
  v.strictObject({ ...base, op: v.literal("contains"), value: text }),
  v.strictObject({
    ...base,
    op: v.literal("in"),
    values: v.pipe(
      v.array(v.pipe(v.string(), v.minLength(1))),
      v.minLength(1),
      v.maxLength(MAX_COLLECTION_SELECT_VALUES),
      v.check(
        (values) => new Set(values).size === values.length,
        "Select values must be distinct.",
      ),
    ),
  }),
  v.pipe(
    v.strictObject({
      ...base,
      op: v.literal("range"),
      min: v.optional(number),
      max: v.optional(number),
    }),
    v.check(
      (value) => value.min !== undefined || value.max !== undefined,
      "A range needs a bound.",
    ),
    v.forward(
      v.check(
        (value) => value.min === undefined || value.max === undefined || value.min <= value.max,
        "Range bounds are inverted.",
      ),
      ["max"],
    ),
  ),
  v.pipe(
    v.strictObject({
      ...base,
      op: v.literal("range"),
      from: v.optional(endpoint),
      to: v.optional(endpoint),
    }),
    v.check(
      (value) => value.from !== undefined || value.to !== undefined,
      "A range needs a bound.",
    ),
    v.forward(
      v.check(
        (value) =>
          value.from === undefined ||
          value.to === undefined ||
          (value.from.length === value.to.length && value.from <= value.to),
        "Range bounds must have the same type and order.",
      ),
      ["to"],
    ),
  ),
]);

export const collectionFieldFiltersSchema = v.pipe(
  v.array(collectionFieldFilterSchema),
  v.maxLength(MAX_COLLECTION_FILTERS),
  v.check(
    (filters) => new Set(filters.map((filter) => filter.field)).size === filters.length,
    "Filter fields must be distinct.",
  ),
);
export type CollectionFieldFilterDto = v.InferOutput<typeof collectionFieldFilterSchema>;

const targets = v.pipe(
  v.array(collectionQueryFieldSchema),
  v.minLength(1),
  v.maxLength(16),
  v.check((keys) => new Set(keys).size === keys.length, "Query targets must be distinct."),
);
export const collectionListOptionsSchema = v.pipe(
  v.strictObject({
    sortableFields: v.optional(targets),
    filterableFields: v.optional(targets),
    searchableFields: v.optional(targets),
  }),
  v.check(
    (options) => Object.values(options).some((value) => value !== undefined),
    "Empty options must be omitted.",
  ),
);
export type CollectionListOptionsDto = v.InferOutput<typeof collectionListOptionsSchema>;
export interface CollectionListOptionsSource {
  readonly sortableFields?: readonly string[] | undefined;
  readonly filterableFields?: readonly string[] | undefined;
  readonly searchableFields?: readonly string[] | undefined;
}

/** Set-like query operands have one identity independent of editor order. */
export function canonicalCollectionFilters(
  filters: readonly CollectionFieldFilterDto[],
): CollectionFieldFilterDto[] {
  return filters
    .map((filter) =>
      filter.op === "in" ? { ...filter, values: [...filter.values].sort() } : { ...filter },
    )
    .sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : 0));
}

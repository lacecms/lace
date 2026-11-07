import { field } from "@lacecms/content";
import type { ModelFieldDefinitions } from "@lacecms/content";

/** Fifty-one options, so the 50-value `in` bound is reachable with configured values. */
export const filterParityOptions: readonly string[] = Object.freeze(
  Array.from({ length: 51 }, (_, index) => `option${index}`),
);

/** One filterable field per filter kind and text-like type, shared by every layer under test. */
export const filterParityFields = Object.freeze({
  title: field.text(),
  summary: field.textarea(),
  link: field.url(),
  count: field.number(),
  flag: field.boolean(),
  day: field.date(),
  time: field.datetime(),
  category: field.select({ options: [...filterParityOptions] as [string, ...string[]] }),
} satisfies ModelFieldDefinitions);

/** The declared filterable fields: every key of `filterParityFields`. */
export const filterParityFilterableFields = Object.freeze(
  Object.keys(filterParityFields) as (keyof typeof filterParityFields)[],
);

/** A field that exists on the model but is not declared filterable. */
export const filterParityUnlistedField = "notes";

export interface FilterParityCase {
  readonly name: string;
  readonly filter: unknown;
  /** Whether every layer accepts the filter with Node list-query limits. */
  readonly accepted: boolean;
}

const values = (count: number) => filterParityOptions.slice(0, count);

/** Accept and reject results that the application and the admin must agree on. */
export const filterParityCases: readonly FilterParityCase[] = Object.freeze([
  // text kind: text, textarea and url fields
  { name: "text eq", filter: { field: "title", op: "eq", value: "Hello" }, accepted: true },
  { name: "text eq empty", filter: { field: "title", op: "eq", value: "" }, accepted: false },
  {
    name: "text eq 200 units",
    filter: { field: "title", op: "eq", value: "a".repeat(200) },
    accepted: true,
  },
  {
    name: "text eq 201 units",
    filter: { field: "title", op: "eq", value: "a".repeat(201) },
    accepted: false,
  },
  { name: "text eq number", filter: { field: "title", op: "eq", value: 5 }, accepted: false },
  { name: "text eq boolean", filter: { field: "title", op: "eq", value: true }, accepted: false },
  {
    name: "text contains",
    filter: { field: "title", op: "contains", value: "ell" },
    accepted: true,
  },
  {
    name: "text contains empty operand",
    filter: { field: "title", op: "contains", value: "" },
    accepted: false,
  },
  {
    name: "text contains 201 units",
    filter: { field: "title", op: "contains", value: "a".repeat(201) },
    accepted: false,
  },
  { name: "text in", filter: { field: "title", op: "in", values: ["a"] }, accepted: false },
  { name: "text range", filter: { field: "title", op: "range", min: 1 }, accepted: false },
  {
    name: "textarea contains",
    filter: { field: "summary", op: "contains", value: "x" },
    accepted: true,
  },
  {
    name: "url eq",
    filter: { field: "link", op: "eq", value: "https://example.com" },
    accepted: true,
  },
  {
    name: "url contains",
    filter: { field: "link", op: "contains", value: "example" },
    accepted: true,
  },
  {
    name: "text eq with an unknown member",
    filter: { field: "title", op: "eq", value: "a", extra: 1 },
    accepted: false,
  },
  { name: "text eq without value", filter: { field: "title", op: "eq" }, accepted: false },
  // number kind
  { name: "number eq zero", filter: { field: "count", op: "eq", value: 0 }, accepted: true },
  { name: "number eq negative", filter: { field: "count", op: "eq", value: -1.5 }, accepted: true },
  { name: "number eq string", filter: { field: "count", op: "eq", value: "1" }, accepted: false },
  { name: "number eq boolean", filter: { field: "count", op: "eq", value: true }, accepted: false },
  {
    name: "number range both bounds",
    filter: { field: "count", op: "range", min: 1, max: 2 },
    accepted: true,
  },
  {
    name: "number range min only",
    filter: { field: "count", op: "range", min: 1 },
    accepted: true,
  },
  {
    name: "number range max only",
    filter: { field: "count", op: "range", max: 2 },
    accepted: true,
  },
  {
    name: "number range equal bounds",
    filter: { field: "count", op: "range", min: 2, max: 2 },
    accepted: true,
  },
  { name: "number range without bounds", filter: { field: "count", op: "range" }, accepted: false },
  {
    name: "number range inverted",
    filter: { field: "count", op: "range", min: 3, max: 2 },
    accepted: false,
  },
  {
    name: "number range string bound",
    filter: { field: "count", op: "range", min: "1" },
    accepted: false,
  },
  {
    name: "number range date bound",
    filter: { field: "count", op: "range", from: "2025-01-01" },
    accepted: false,
  },
  {
    name: "number contains",
    filter: { field: "count", op: "contains", value: "1" },
    accepted: false,
  },
  // boolean kind
  { name: "boolean eq false", filter: { field: "flag", op: "eq", value: false }, accepted: true },
  { name: "boolean eq true", filter: { field: "flag", op: "eq", value: true }, accepted: true },
  {
    name: "boolean eq string",
    filter: { field: "flag", op: "eq", value: "true" },
    accepted: false,
  },
  { name: "boolean eq number", filter: { field: "flag", op: "eq", value: 0 }, accepted: false },
  { name: "boolean range", filter: { field: "flag", op: "range", min: 0 }, accepted: false },
  // date kind
  {
    name: "date range from",
    filter: { field: "day", op: "range", from: "2025-01-01" },
    accepted: true,
  },
  {
    name: "date range both bounds",
    filter: { field: "day", op: "range", from: "2025-01-01", to: "2025-12-31" },
    accepted: true,
  },
  {
    name: "date range impossible date",
    filter: { field: "day", op: "range", from: "2025-02-30" },
    accepted: false,
  },
  {
    name: "date range inverted",
    filter: { field: "day", op: "range", from: "2025-02-01", to: "2025-01-01" },
    accepted: false,
  },
  {
    name: "date range with an instant",
    filter: { field: "day", op: "range", from: "2025-01-01T00:00:00Z" },
    accepted: false,
  },
  { name: "date range without bounds", filter: { field: "day", op: "range" }, accepted: false },
  {
    name: "date range number bound",
    filter: { field: "day", op: "range", min: 1 },
    accepted: false,
  },
  { name: "date eq", filter: { field: "day", op: "eq", value: "2025-01-01" }, accepted: false },
  // datetime kind
  {
    name: "datetime range normalized order",
    filter: {
      field: "time",
      op: "range",
      from: "2025-01-01T10:00:00+02:00",
      to: "2025-01-01T09:00:00Z",
    },
    accepted: true,
  },
  {
    name: "datetime range inverted after normalization",
    filter: {
      field: "time",
      op: "range",
      from: "2025-01-01T10:00:00Z",
      to: "2025-01-01T11:00:00+02:00",
    },
    accepted: false,
  },
  {
    name: "datetime range with a date",
    filter: { field: "time", op: "range", from: "2025-01-01" },
    accepted: false,
  },
  {
    name: "datetime range hour 24",
    filter: { field: "time", op: "range", to: "2025-01-01T24:00:00Z" },
    accepted: false,
  },
  {
    name: "datetime range without offset",
    filter: { field: "time", op: "range", from: "2025-01-01T10:00:00" },
    accepted: false,
  },
  {
    name: "datetime range with milliseconds",
    filter: { field: "time", op: "range", from: "2025-01-01T10:00:00.123Z" },
    accepted: true,
  },
  // select kind
  {
    name: "select in one value",
    filter: { field: "category", op: "in", values: values(1) },
    accepted: true,
  },
  {
    name: "select in 50 values",
    filter: { field: "category", op: "in", values: values(50) },
    accepted: true,
  },
  {
    name: "select in 51 values",
    filter: { field: "category", op: "in", values: values(51) },
    accepted: false,
  },
  {
    name: "select in no values",
    filter: { field: "category", op: "in", values: [] },
    accepted: false,
  },
  {
    name: "select in duplicate values",
    filter: { field: "category", op: "in", values: ["option0", "option0"] },
    accepted: false,
  },
  {
    name: "select in unknown option",
    filter: { field: "category", op: "in", values: ["unknown"] },
    accepted: false,
  },
  {
    name: "select in empty string",
    filter: { field: "category", op: "in", values: [""] },
    accepted: false,
  },
  {
    name: "select in a bare string",
    filter: { field: "category", op: "in", values: "option0" },
    accepted: false,
  },
  {
    name: "select eq",
    filter: { field: "category", op: "eq", value: "option0" },
    accepted: false,
  },
  // presence operators on every kind
  ...Object.keys(filterParityFields).flatMap((key) => [
    { name: `${key} isSet`, filter: { field: key, op: "isSet" }, accepted: true },
    { name: `${key} isNotSet`, filter: { field: key, op: "isNotSet" }, accepted: true },
  ]),
  {
    name: "isSet with an operand",
    filter: { field: "title", op: "isSet", value: "a" },
    accepted: false,
  },
  // shape and field failures
  { name: "unknown field", filter: { field: "missing", op: "isSet" }, accepted: false },
  {
    name: "field that is not filterable",
    filter: { field: filterParityUnlistedField, op: "isSet" },
    accepted: false,
  },
  { name: "null filter", filter: null, accepted: false },
  { name: "array filter", filter: [], accepted: false },
  { name: "missing operation", filter: { field: "title", value: "a" }, accepted: false },
  {
    name: "unknown operation",
    filter: { field: "title", op: "startsWith", value: "a" },
    accepted: false,
  },
  { name: "non-string field", filter: { field: 1, op: "isSet" }, accepted: false },
]);

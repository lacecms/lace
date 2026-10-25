import type { NormalizedContentModel } from "@lacecms/config";
import { DomainError } from "@lacecms/domain";
import { fitsListQueryLimits, NODE_LIST_QUERY_LIMITS } from "@lacecms/content";
import type { ListQueryLimits } from "@lacecms/content";
export { NODE_LIST_QUERY_LIMITS, CLOUDFLARE_LIST_QUERY_LIMITS } from "@lacecms/content";
export type { ListQueryLimits } from "@lacecms/content";

/** Enforces runtime policy before any persistence operation; original indices stay intact. */
export function validateListQueryBudget(
  q: string | undefined,
  filters: readonly CollectionFieldFilter[],
  limits: ListQueryLimits = NODE_LIST_QUERY_LIMITS,
): void {
  if (q !== undefined && !fitsListQueryLimits(q, limits)) invalid("/q");
  for (const [index, filter] of filters.entries())
    if (filter.op === "contains" && !fitsListQueryLimits(filter.value, limits))
      invalid(`/filters/${index}/value`);
}

export type CollectionQueryFieldType =
  | "text"
  | "textarea"
  | "url"
  | "select"
  | "number"
  | "boolean"
  | "date"
  | "datetime";
export interface CollectionQueryField {
  readonly key: string;
  readonly type: CollectionQueryFieldType;
  readonly options?: readonly string[];
}
export type CollectionFieldFilter =
  | { readonly field: string; readonly op: "isSet" | "isNotSet" }
  | { readonly field: string; readonly op: "eq"; readonly value: boolean | number | string }
  | { readonly field: string; readonly op: "contains"; readonly value: string }
  | { readonly field: string; readonly op: "in"; readonly values: readonly string[] }
  | {
      readonly field: string;
      readonly op: "range";
      readonly min?: number;
      readonly max?: number;
      readonly from?: string;
      readonly to?: string;
    };
export interface ResolvedCollectionQuery {
  readonly filters: readonly CollectionFieldFilter[];
  readonly sortableFields: readonly CollectionQueryField[];
  readonly filterableFields: readonly CollectionQueryField[];
  readonly searchableFields: readonly CollectionQueryField[];
}
export class CollectionQueryValidationError extends DomainError {
  public constructor(public readonly pointer: string) {
    super("CONTENT_INVALID_STATE", "Collection query is invalid.");
  }
}
const invalid = (pointer: string): never => {
  throw new CollectionQueryValidationError(pointer);
};
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const text = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 200;
function date(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}
function instant(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) ||
    !date(value.slice(0, 10)) ||
    !Number.isFinite(Date.parse(value)) ||
    Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59 ||
    Number(value.slice(17, 19)) > 59
  )
    return undefined;
  return new Date(value).toISOString();
}

/** Resolves only active, declared draft targets before persistence is called. */
export function resolveCollectionQuery(
  model: NormalizedContentModel,
  sort: string | undefined,
  input: unknown,
  limits: ListQueryLimits = NODE_LIST_QUERY_LIMITS,
): ResolvedCollectionQuery | undefined {
  const options = model.kind === "collection" ? model.listOptions : undefined;
  const targets = (keys: readonly string[] | undefined): CollectionQueryField[] =>
    (keys ?? [])
      .map((key) => {
        const field = model.fields[key]!;
        return {
          key,
          type: field.type as CollectionQueryFieldType,
          ...(field.type === "select" ? { options: [...field.options].sort() } : {}),
        };
      })
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const sortableFields = targets(options?.sortableFields),
    filterableFields = targets(options?.filterableFields),
    searchableFields = targets(options?.searchableFields);
  if (
    sort?.replace(/^-/u, "").startsWith("field:") &&
    !sortableFields.some((field) => field.key === sort.replace(/^-/u, "").slice(6))
  )
    invalid("/sort");
  if (input !== undefined && (!Array.isArray(input) || input.length > 16)) invalid("/filters");
  const seen = new Set<string>();
  const filters: CollectionFieldFilter[] = [];
  for (const [index, raw] of ((input as unknown[] | undefined) ?? []).entries()) {
    const pointer = `/filters/${index}`;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) invalid(pointer);
    const filter = raw as Record<string, unknown>;
    const descriptor = filterableFields.find((field) => field.key === filter.field);
    if (descriptor === undefined || typeof filter.field !== "string" || seen.has(filter.field))
      invalid(`${pointer}/field`);
    const field = filter.field as string;
    seen.add(field);
    const type = descriptor!.type;
    const op = filter.op;
    let members: readonly string[] = [];
    let normalized: CollectionFieldFilter;
    if (op === "isSet" || op === "isNotSet") {
      normalized = { field, op };
    } else if (op === "eq" && ["text", "textarea", "url", "number", "boolean"].includes(type)) {
      if (
        !(type === "number"
          ? finite(filter.value)
          : type === "boolean"
            ? typeof filter.value === "boolean"
            : text(filter.value))
      )
        invalid(`${pointer}/value`);
      members = ["value"];
      normalized = { field, op, value: filter.value as string | number | boolean };
    } else if (op === "contains" && ["text", "textarea", "url"].includes(type)) {
      if (!text(filter.value)) invalid(`${pointer}/value`);
      if (!fitsListQueryLimits(filter.value as string, limits)) invalid(`${pointer}/value`);
      members = ["value"];
      normalized = { field, op, value: filter.value as string };
    } else if (op === "in" && type === "select") {
      const values = filter.values;
      if (
        !Array.isArray(values) ||
        values.length < 1 ||
        values.length > 50 ||
        new Set(values).size !== values.length ||
        values.some((value) => typeof value !== "string" || !descriptor!.options!.includes(value))
      )
        invalid(`${pointer}/values`);
      members = ["values"];
      normalized = { field, op, values: [...(values as string[])].sort() };
    } else if (op === "range" && type === "number") {
      members = ["min", "max"];
      for (const key of members)
        if (filter[key] !== undefined && !finite(filter[key])) invalid(`${pointer}/${key}`);
      if (filter.min === undefined && filter.max === undefined) invalid(pointer);
      if (finite(filter.min) && finite(filter.max) && filter.min > filter.max)
        invalid(`${pointer}/max`);
      normalized = {
        field,
        op,
        ...(filter.min === undefined ? {} : { min: filter.min as number }),
        ...(filter.max === undefined ? {} : { max: filter.max as number }),
      };
    } else if (op === "range" && (type === "date" || type === "datetime")) {
      members = ["from", "to"];
      const bounds: { from?: string; to?: string } = {};
      for (const key of ["from", "to"] as const) {
        if (filter[key] === undefined) continue;
        const bound =
          type === "date"
            ? date(filter[key])
              ? (filter[key] as string)
              : undefined
            : instant(filter[key]);
        if (bound === undefined) invalid(`${pointer}/${key}`);
        bounds[key] = bound!;
      }
      if (bounds.from === undefined && bounds.to === undefined) invalid(pointer);
      if (bounds.from !== undefined && bounds.to !== undefined && bounds.from > bounds.to)
        invalid(`${pointer}/to`);
      normalized = { field, op, ...bounds };
    } else invalid(`${pointer}/op`);
    for (const key of Object.keys(filter))
      if (!["field", "op", ...members].includes(key))
        invalid(`${pointer}/${key.replace(/~/gu, "~0").replace(/\//gu, "~1")}`);
    filters.push(normalized!);
  }
  filters.sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : 0));
  if (!options && !filters.length) return undefined;
  return { filters, sortableFields, filterableFields, searchableFields };
}

/** Canonical capability and operand input for cursor fingerprints. */
export function collectionQueryIdentity(query: ResolvedCollectionQuery | undefined): unknown {
  if (query === undefined) return null;
  const targets = (fields: readonly CollectionQueryField[]) =>
    fields
      .map((field) => [
        field.key,
        field.type,
        field.options === undefined ? null : [...field.options].sort(),
      ])
      .sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0));
  return [
    [...query.filters]
      .map((filter) =>
        filter.op === "in" ? { ...filter, values: [...filter.values].sort() } : filter,
      )
      .sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : 0)),
    targets(query.sortableFields),
    targets(query.filterableFields),
    targets(query.searchableFields),
  ];
}

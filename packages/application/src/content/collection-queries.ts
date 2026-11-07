import type {
  CollectionQueryFieldType,
  CollectionQueryField,
  CollectionFieldFilter,
  ResolvedCollectionQuery,
} from "../ports/content.js";
import type { NormalizedContentModel } from "@lacecms/config";
import { CollectionQueryValidationError } from "@lacecms/domain";
export { CollectionQueryValidationError } from "@lacecms/domain";
import {
  fieldFilterValueFailure,
  fieldTypeCapabilities,
  filterInstant,
  fitsListQueryLimits,
  NODE_LIST_QUERY_LIMITS,
} from "@lacecms/content";
import type { FieldFilterKind, ListQueryLimits } from "@lacecms/content";
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

const invalid = (pointer: string): never => {
  throw new CollectionQueryValidationError(pointer);
};
/** The canonical form of a filter that `fieldFilterValueFailure` accepted. */
function normalizedFilter(
  field: string,
  kind: FieldFilterKind,
  filter: Readonly<Record<string, unknown>>,
): CollectionFieldFilter {
  const op = filter.op;
  if (op === "isSet" || op === "isNotSet") return { field, op };
  if (op === "eq") return { field, op, value: filter.value as string | number | boolean };
  if (op === "contains") return { field, op, value: filter.value as string };
  if (op === "in") return { field, op, values: [...(filter.values as string[])].sort() };
  if (kind === "number")
    return {
      field,
      op: "range",
      ...(filter.min === undefined ? {} : { min: filter.min as number }),
      ...(filter.max === undefined ? {} : { max: filter.max as number }),
    };
  const bound = (value: unknown) => (kind === "date" ? (value as string) : filterInstant(value)!);
  return {
    field,
    op: "range",
    ...(filter.from === undefined ? {} : { from: bound(filter.from) }),
    ...(filter.to === undefined ? {} : { to: bound(filter.to) }),
  };
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
    const kind = fieldTypeCapabilities[descriptor!.type].filterKind;
    const failure = fieldFilterValueFailure(kind, filter, {
      selectOptions: descriptor!.options,
      fitsTextBudget: (value) => fitsListQueryLimits(value, limits),
    });
    if (failure !== undefined)
      invalid(
        failure.path === ""
          ? pointer
          : `${pointer}/${failure.path.replace(/~/gu, "~0").replace(/\//gu, "~1")}`,
      );
    filters.push(normalizedFilter(field, kind, filter));
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

import { fieldTypeCapabilities, FIELD_FILTER_OPERATIONS } from "@lacecms/content";
import type { FieldType } from "@lacecms/content";
import {
  canonicalCollectionFilters,
  collectionFieldFilterSchema,
  fitsListQueryLimits,
  NODE_LIST_QUERY_LIMITS,
  type CollectionFieldFilterDto,
  type ContentModelDto,
  type ContentEntrySortDto,
  type ContentEntryStatusDto,
  type ListQueryLimits,
} from "@lacecms/contracts";
import * as v from "valibot";

/** Shared order for filter controls and server operator validation. */
export function fieldFilterOperations(type: FieldType): readonly string[] {
  const capability = fieldTypeCapabilities[type];
  return capability.listQueryable
    ? [...FIELD_FILTER_OPERATIONS[capability.filterKind], "isSet", "isNotSet"]
    : [];
}

export interface CollectionListSearch {
  readonly q?: string | undefined;
  readonly sort?: ContentEntrySortDto | undefined;
  readonly status?: ContentEntryStatusDto | undefined;
  readonly filters?: readonly CollectionFieldFilterDto[] | undefined;
}

/** One metadata-aware check shared by stale URL recovery and the condition editor. */
export function collectionFilterProblem(
  model: ContentModelDto,
  input: unknown,
  limits: ListQueryLimits = NODE_LIST_QUERY_LIMITS,
): string | undefined {
  const parsed = v.safeParse(collectionFieldFilterSchema, input);
  if (!parsed.success) return "Enter valid values and ordered range bounds.";
  const filter = parsed.output;
  const field = model.fields[filter.field];
  if (!field || !model.listOptions?.filterableFields?.includes(filter.field))
    return "This field is no longer filterable.";
  const capability = fieldTypeCapabilities[field.type];
  if (!capability.listQueryable || !fieldFilterOperations(field.type).includes(filter.op))
    return "Choose an operation supported by this field.";
  const kind = capability.filterKind;
  if (filter.op === "isSet" || filter.op === "isNotSet") return undefined;
  if (
    filter.op === "in" &&
    field.type === "select" &&
    filter.values.every((value) => field.options.includes(value))
  )
    return undefined;
  if (filter.op === "eq") {
    if (kind === "boolean" && typeof filter.value === "boolean") return undefined;
    if (kind === "number" && typeof filter.value === "number") return undefined;
    if (kind === "text" && typeof filter.value === "string") return undefined;
  }
  if (filter.op === "contains" && kind === "text") {
    if (fitsListQueryLimits(filter.value, limits)) return undefined;
    return listQueryBudgetHint(limits);
  }
  if (filter.op === "range") {
    if (kind === "number" && ("min" in filter || "max" in filter)) return undefined;
    if ((kind === "date" || kind === "datetime") && ("from" in filter || "to" in filter)) {
      const endpoints = [filter.from, filter.to].filter((value) => value !== undefined);
      if (endpoints.every((value) => (kind === "date" ? value.length === 10 : value.length > 10)))
        return undefined;
    }
  }
  return "Choose an operation supported by this field.";
}

export function listQueryBudgetHint(limits: ListQueryLimits): string {
  return `Up to ${limits.maxSearchLength} UTF-16 characters${limits.maxLikePatternBytes === null ? "" : ` and ${limits.maxLikePatternBytes} UTF-8 bytes after escaping %, _ and backslash, including 2 substring bytes`}. ASCII case is ignored; Cyrillic and other non-ASCII case is retained.`;
}

/** Resolve only after model/runtime metadata arrives; retain each valid peer. */
export function resolveCollectionListSearch(
  search: CollectionListSearch,
  model: ContentModelDto,
  limits: ListQueryLimits = NODE_LIST_QUERY_LIMITS,
): CollectionListSearch {
  const sortField = search.sort?.replace(/^-/u, "");
  const sort =
    sortField?.startsWith("field:") &&
    !model.listOptions?.sortableFields?.includes(sortField.slice(6))
      ? undefined
      : search.sort;
  const filters = canonicalCollectionFilters(
    (search.filters ?? []).filter(
      (filter) => collectionFilterProblem(model, filter, limits) === undefined,
    ),
  );
  return {
    q: search.q && fitsListQueryLimits(search.q, limits) ? search.q : undefined,
    sort,
    status: search.status,
    filters: filters.length ? filters : undefined,
  };
}

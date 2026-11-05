import {
  fieldFilterValueFailure,
  fieldTypeCapabilities,
  FIELD_FILTER_OPERATIONS,
  FIELD_PRESENCE_OPERATIONS,
} from "@lacecms/content";
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
    ? [...FIELD_FILTER_OPERATIONS[capability.filterKind], ...FIELD_PRESENCE_OPERATIONS]
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
  const failure = fieldFilterValueFailure(capability.filterKind, filter, {
    selectOptions: field.type === "select" ? field.options : undefined,
    fitsTextBudget: (value) => fitsListQueryLimits(value, limits),
  });
  if (failure === undefined) return undefined;
  if (failure.reason === "budget") return listQueryBudgetHint(limits);
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

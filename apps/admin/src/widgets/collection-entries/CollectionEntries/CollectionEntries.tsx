import {
  canonicalCollectionFilters,
  collectionCapabilityIdentity,
  NODE_LIST_QUERY_LIMITS,
} from "@lacecms/contracts";
import type {
  ContentEntryListDto,
  ContentModelDto,
  ContentEntrySortDto,
  ContentEntryStatusDto,
  ListQueryLimits,
  CollectionFieldFilterDto,
} from "@lacecms/contracts";
import {
  type InfiniteData,
  keepPreviousData,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { can, useSession, useSessionRecovery } from "../../../entities/session/index.js";
import { CreateEntryDialog } from "../../../features/create-entry/index.js";
import {
  AdminClientError,
  adminQueryKeys,
  DEFAULT_ENTRY_SORT,
  errorDescription,
  technicalDetails,
  useAdminClient,
} from "../../../shared/api/index.js";
import { consumeFocusRequest } from "../../../shared/lib/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { EmptyState } from "../../../shared/ui/EmptyState/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { pageClass } from "../../../shared/ui/layout/index.js";
import { LoadingState } from "../../../shared/ui/LoadingState/index.js";
import { CollectionFilters } from "../CollectionFilters/index.js";
import { EntryListTable } from "../EntryListTable/index.js";
import { EntryListToolbar } from "../EntryListToolbar/index.js";
import { listFieldColumns } from "../list-columns.js";

/** The focus request that moves focus to a collection list's heading when it mounts. */
export function collectionFocusTarget(modelKey: string): string {
  return `collection-heading:${modelKey}`;
}

/** The search, status filter, and sort of a collection list, as carried in the URL. */
export type CollectionListQuery = {
  readonly filters?: readonly CollectionFieldFilterDto[] | undefined;
  readonly q?: string | undefined;
  readonly sort?: ContentEntrySortDto | undefined;
  readonly status?: ContentEntryStatusDto | undefined;
};

type CanonicalQuery = {
  readonly filters?: readonly CollectionFieldFilterDto[];
  readonly q?: string;
  readonly sort?: ContentEntrySortDto;
  readonly status?: ContentEntryStatusDto;
};

/** Drops blank and default values so equivalent lists share one URL and cache entry. */
function normalized(query: CollectionListQuery): CanonicalQuery {
  const q = query.q?.trim() ?? "";
  return {
    ...(query.filters?.length ? { filters: query.filters } : {}),
    ...(q.length > 0 ? { q } : {}),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.sort === undefined || query.sort === DEFAULT_ENTRY_SORT ? {} : { sort: query.sort }),
  };
}

/**
 * The server-searched, filtered, and sorted entry list of a collection with
 * cursor pagination and permission-aware entry actions. The query is owned by
 * the caller (the route URL); every change restarts at the first page.
 */
export function CollectionEntries({
  listQueryLimits = NODE_LIST_QUERY_LIMITS,
  model,
  onQueryChange,
  query: rawQuery,
}: {
  readonly listQueryLimits?: ListQueryLimits;
  readonly model: ContentModelDto;
  readonly onQueryChange: (query: CanonicalQuery) => void;
  readonly query: CollectionListQuery;
}) {
  const query = normalized(rawQuery);
  const client = useAdminClient();
  const queryClient = useQueryClient();
  const [filterField, setFilterField] = useState<string>();
  const [restarted, setRestarted] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const openFilters = (key: string) => {
    opener.current = document.activeElement as HTMLElement;
    setFilterField(key);
  };
  const session = useSession();
  const heading = useRef<HTMLHeadingElement>(null);
  const modelKey = model.key;
  const title = model.label ?? model.key;
  const queryKey = adminQueryKeys.entryList(modelKey, {
    ...query,
    listQueryLimits,
    capabilities: collectionCapabilityIdentity(model, listQueryLimits),
  });
  const queryIdentity = JSON.stringify(queryKey);
  useEffect(() => setRestarted(false), [queryIdentity]);
  const entries = useInfiniteQuery<
    ContentEntryListDto,
    Error,
    InfiniteData<ContentEntryListDto>,
    ReturnType<typeof adminQueryKeys.entryList>,
    string | undefined
  >({
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) => client.listEntries(modelKey, pageParam, query),
    queryKey,
    retry: false,
  });
  useSessionRecovery(entries.error);
  const listColumns = useMemo(() => listFieldColumns(model), [model]);
  const focusHeading = useCallback(() => heading.current?.focus(), []);
  useEffect(() => {
    // The editor asks for this after deleting an entry and returning here.
    if (consumeFocusRequest(collectionFocusTarget(modelKey))) heading.current?.focus();
  }, [modelKey]);
  const change = (next: CollectionListQuery) => onQueryChange(normalized({ ...query, ...next }));

  const items = entries.data?.pages.flatMap((page) => page.items) ?? [];
  const totals = entries.data?.pages[0]?.totals;
  const matching = totals === undefined ? 0 : totals[query.status ?? "all"];
  const filtered = query.q !== undefined || query.status !== undefined || !!query.filters?.length;
  const expired =
    entries.error instanceof AdminClientError &&
    entries.error.status === 422 &&
    entries.error.code === "VALIDATION_FAILED" &&
    entries.error.issues?.some((issue) => issue.path === "/after");
  const restart = async () => {
    await queryClient.cancelQueries({ queryKey, exact: true });
    // Remove every page and cursor before the first-page fetch. Previously visible rows
    // are kept until activation, then replaced; the old cursor is never retried.
    await queryClient.resetQueries({ queryKey, exact: true });
    if (!queryClient.getQueryState(queryKey)?.error) {
      setRestarted(true);
      heading.current?.focus();
    }
  };
  const clear = () => change({ q: undefined, status: undefined, filters: undefined });
  const canManage = can(session, "content:write");
  const empty = entries.data !== undefined && items.length === 0 && !filtered;

  return (
    <section className={pageClass} aria-labelledby="model-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="outline-none" id="model-title" ref={heading} tabIndex={-1}>
            {title}
          </h1>
          {model.route === undefined ? undefined : (
            <p className="m-0 font-mono text-xs text-muted-foreground">{model.route}</p>
          )}
        </div>
        {canManage && !empty ? (
          <CreateEntryDialog collectionLabel={title} modelKey={modelKey} />
        ) : undefined}
      </div>
      {model.listOptions?.sortableFields?.length ? (
        <label className="flex items-center gap-2 text-sm">
          Sort
          <select
            aria-label="Sort entries"
            className="h-9 rounded-md border border-input bg-background px-3"
            value={query.sort ?? DEFAULT_ENTRY_SORT}
            onChange={(event) => change({ sort: event.target.value as ContentEntrySortDto })}
          >
            {[
              ["updatedAt", "Updated"],
              ["title", "Title"],
              ["publishedAt", "Published"],
              ...model.listOptions.sortableFields.map((key) => [
                `field:${key}`,
                model.fields[key]?.label ?? key,
              ]),
            ].flatMap(([value, label]) => [
              <option key={value} value={value}>
                {label} — ascending
              </option>,
              <option key={`-${value}`} value={`-${value}`}>
                {label} — descending
              </option>,
            ])}
          </select>
        </label>
      ) : undefined}
      <EntryListToolbar
        limits={listQueryLimits}
        searchableLabels={
          model.listOptions?.searchableFields?.map((key) => model.fields[key]?.label ?? key) ?? []
        }
        hasFieldFilters={!!query.filters?.length}
        onClear={clear}
        onSearchChange={(q) => change({ q })}
        onStatusChange={(status) => change({ status })}
        search={query.q ?? ""}
        status={query.status}
        totals={totals}
      />
      {model.listOptions?.filterableFields?.length ? (
        <Button
          className="w-fit"
          variant="outline"
          onClick={() => openFilters(model.listOptions!.filterableFields![0]!)}
        >
          Filters
        </Button>
      ) : undefined}
      {filterField ? (
        <CollectionFilters
          key={filterField}
          fieldKey={filterField}
          filters={query.filters ?? []}
          limits={listQueryLimits}
          model={model}
          onApply={(filter) =>
            change({
              filters: canonicalCollectionFilters([
                ...(query.filters ?? []).filter((item) => item.field !== filter.field),
                filter,
              ]),
            })
          }
          onClose={() => setFilterField(undefined)}
          onRestoreFocus={() => opener.current?.focus()}
        />
      ) : undefined}
      {filtered ? (
        <div aria-label="Active conditions" className="flex flex-wrap gap-2">
          {query.q ? (
            <Button
              variant="outline"
              size="sm"
              aria-label="Remove search"
              onClick={() => change({ q: undefined })}
            >
              Search: {query.q} ×
            </Button>
          ) : undefined}
          {query.status ? (
            <Button
              variant="outline"
              size="sm"
              aria-label="Remove status"
              onClick={() => change({ status: undefined })}
            >
              Status: {query.status} ×
            </Button>
          ) : undefined}
          {query.filters?.map((filter) => (
            <Button
              key={filter.field}
              variant="outline"
              size="sm"
              aria-label={`Remove filter ${model.fields[filter.field]?.label ?? filter.field}`}
              onClick={() =>
                change({ filters: query.filters?.filter((item) => item.field !== filter.field) })
              }
            >
              {model.fields[filter.field]?.label ?? filter.field}: {filter.op}
              {"value" in filter
                ? ` ${String(filter.value)}`
                : "values" in filter
                  ? ` ${filter.values.join(" or ")}`
                  : filter.op === "range"
                    ? ` ${Object.entries(filter)
                        .filter(([key]) => !["op", "field"].includes(key))
                        .map(([key, value]) => `${key} ${value}`)
                        .join(" · ")}`
                    : ""}{" "}
              ×
            </Button>
          ))}
        </div>
      ) : undefined}
      {restarted ? (
        <p role="status" className="text-sm text-muted-foreground">
          List restarted with the current query.
        </p>
      ) : undefined}
      {entries.isPending ? <LoadingState label="Loading entries" lines={5} /> : undefined}
      {entries.data === undefined && entries.error !== null ? (
        <ErrorState
          description={errorDescription(entries.error)}
          onRetry={() => void entries.refetch()}
          retrying={entries.isFetching}
          technicalDetails={technicalDetails(entries.error)}
        />
      ) : undefined}
      {empty ? (
        <EmptyState
          action={
            canManage ? (
              <CreateEntryDialog collectionLabel={title} modelKey={modelKey} />
            ) : undefined
          }
          description={
            canManage
              ? "Create the first entry for this collection. If this is a new local model, run pnpm content:sync first."
              : "There are no entries in this collection yet."
          }
          title="No entries yet"
        />
      ) : undefined}
      {entries.data !== undefined && items.length === 0 && filtered ? (
        <EmptyState
          action={
            <Button onClick={clear} variant="outline">
              Clear filters
            </Button>
          }
          description="No entries match the current search and filters."
          title="No matching entries"
        />
      ) : undefined}
      {items.length > 0 ? (
        <div className="grid gap-3">
          <EntryListTable
            busy={entries.isPlaceholderData}
            canManage={canManage}
            canPublish={can(session, "content:publish")}
            items={items}
            label={title}
            listColumns={listColumns}
            modelKey={modelKey}
            onDeleted={focusHeading}
            onSortChange={(sort) => change({ sort })}
            onFilterField={openFilters}
            sort={query.sort ?? DEFAULT_ENTRY_SORT}
          />
          {entries.isFetchNextPageError && expired ? (
            <div role="alert" className="grid justify-items-start gap-2">
              <p className="m-0 text-sm">
                The continuation expired after the collection changed. Restart to refresh these
                results.
              </p>
              <Button onClick={() => void restart()} variant="outline">
                Restart list
              </Button>
            </div>
          ) : entries.isFetchNextPageError ? (
            <ErrorState
              description={errorDescription(entries.error)}
              technicalDetails={technicalDetails(entries.error)}
            />
          ) : undefined}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p aria-live="polite" className="m-0 text-sm text-muted-foreground">
              {`Showing ${items.length} of ${matching}`}
            </p>
            {entries.hasNextPage && !expired ? (
              <Button
                disabled={entries.isFetchingNextPage}
                onClick={() => entries.fetchNextPage()}
                variant="outline"
              >
                {entries.isFetchingNextPage ? "Loading more…" : "Load more entries"}
              </Button>
            ) : undefined}
          </div>
        </div>
      ) : undefined}
    </section>
  );
}

import type {
  ContentEntryListDto,
  ContentModelDto,
  ContentEntrySortDto,
  ContentEntryStatusDto,
} from "@lacecms/contracts";
import { type InfiniteData, keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
import { can, useSession, useSessionRecovery } from "../../../entities/session/index.js";
import { CreateEntryDialog } from "../../../features/create-entry/index.js";
import {
  adminQueryKeys,
  DEFAULT_ENTRY_SORT,
  errorDescription,
  technicalDetails,
  useAdminClient,
} from "../../../shared/api/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { EmptyState } from "../../../shared/ui/EmptyState/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { pageClass } from "../../../shared/ui/layout/index.js";
import { LoadingState } from "../../../shared/ui/LoadingState/index.js";
import { EntryListTable } from "../EntryListTable/index.js";
import { EntryListToolbar } from "../EntryListToolbar/index.js";
import { listFieldColumns } from "../list-columns.js";

/** The search, status filter, and sort of a collection list, as carried in the URL. */
export type CollectionListQuery = {
  readonly q?: string | undefined;
  readonly sort?: ContentEntrySortDto | undefined;
  readonly status?: ContentEntryStatusDto | undefined;
};

type CanonicalQuery = {
  readonly q?: string;
  readonly sort?: ContentEntrySortDto;
  readonly status?: ContentEntryStatusDto;
};

/** Drops blank and default values so equivalent lists share one URL and cache entry. */
function normalized(query: CollectionListQuery): CanonicalQuery {
  const q = query.q?.trim() ?? "";
  return {
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
  model,
  onQueryChange,
  query: rawQuery,
}: {
  readonly model: ContentModelDto;
  readonly onQueryChange: (query: CanonicalQuery) => void;
  readonly query: CollectionListQuery;
}) {
  const query = normalized(rawQuery);
  const client = useAdminClient();
  const session = useSession();
  const heading = useRef<HTMLHeadingElement>(null);
  const modelKey = model.key;
  const title = model.label ?? model.key;
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
    queryKey: adminQueryKeys.entryList(modelKey, query),
  });
  useSessionRecovery(entries.error);
  const listColumns = useMemo(() => listFieldColumns(model), [model]);
  const focusHeading = useCallback(() => heading.current?.focus(), []);
  const change = (next: CollectionListQuery) => onQueryChange(normalized({ ...query, ...next }));

  const items = entries.data?.pages.flatMap((page) => page.items) ?? [];
  const totals = entries.data?.pages[0]?.totals;
  const matching = totals === undefined ? 0 : totals[query.status ?? "all"];
  const filtered = query.q !== undefined || query.status !== undefined;
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
      <EntryListToolbar
        onClear={() => change({ q: undefined, status: undefined })}
        onSearchChange={(q) => change({ q })}
        onStatusChange={(status) => change({ status })}
        search={query.q ?? ""}
        status={query.status}
        totals={totals}
      />
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
            <Button onClick={() => change({ q: undefined, status: undefined })} variant="outline">
              Clear filters
            </Button>
          }
          description="No entries match the current search and status filter."
          title="No matching entries"
        />
      ) : undefined}
      {items.length > 0 ? (
        <div className="grid gap-3">
          <EntryListTable
            busy={entries.isPlaceholderData}
            canManage={canManage}
            items={items}
            label={title}
            listColumns={listColumns}
            modelKey={modelKey}
            onDeleted={focusHeading}
            onSortChange={(sort) => change({ sort })}
            sort={query.sort ?? DEFAULT_ENTRY_SORT}
          />
          {entries.isFetchNextPageError ? (
            <ErrorState
              description={errorDescription(entries.error)}
              technicalDetails={technicalDetails(entries.error)}
            />
          ) : undefined}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p aria-live="polite" className="m-0 text-sm text-muted-foreground">
              {`Showing ${items.length} of ${matching}`}
            </p>
            {entries.hasNextPage ? (
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

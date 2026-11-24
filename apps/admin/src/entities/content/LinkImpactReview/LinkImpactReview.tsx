import type { LinkImpactAcknowledgmentDto } from "@lacecms/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { errorDescription, useAdminClient } from "../../../shared/api/index.js";
import { Button } from "../../../shared/ui/Button/index.js";

import { IncomingImpactSource } from "../IncomingImpactSource.js";
import { isIncomingImpactChanged } from "../incoming-impact-error.js";

export const isLinkImpactChanged = (error: unknown) => isIncomingImpactChanged(error, "url");

export function useLinkImpactReview(
  entryId: string,
  action: "delete" | "unpublish",
  open: boolean,
) {
  const client = useAdminClient();
  const [review, setReview] = useState(() => ({
    entryId,
    action,
    open,
    sourceEpoch: 0,
    locationEpoch: 0,
    receipt: undefined as string | undefined,
    acknowledged: false,
    notice: false,
    blockedLocations: new Set<string>(),
  }));
  const { sourceEpoch, locationEpoch } = review;
  const reportLocations = useCallback(
    (id: string, blocked: boolean) =>
      setReview((current) => {
        if (current.locationEpoch !== locationEpoch || current.blockedLocations.has(id) === blocked)
          return current;
        const blockedLocations = new Set(current.blockedLocations);
        if (blocked) blockedLocations.add(id);
        else blockedLocations.delete(id);
        return { ...current, blockedLocations };
      }),
    [locationEpoch],
  );
  const refresh = useCallback((fromLocationEpoch?: number) => {
    setReview((current) => {
      if (fromLocationEpoch !== undefined && fromLocationEpoch !== current.locationEpoch)
        return current;
      return {
        ...current,
        sourceEpoch: current.sourceEpoch + 1,
        locationEpoch: current.locationEpoch + 1,
        receipt: undefined,
        acknowledged: false,
        notice: true,
        blockedLocations: new Set<string>(),
      };
    });
  }, []);
  const onLocationsChanged = useCallback(() => refresh(locationEpoch), [refresh, locationEpoch]);
  const query = useInfiniteQuery({
    queryKey: ["admin", "link-impact", entryId, action, sourceEpoch],
    enabled: open,
    initialPageParam: undefined as string | undefined,
    retry: false,
    queryFn: async ({ pageParam, signal }) => {
      const page = await client.linkImpact(
        entryId,
        { action, limit: 20, ...(pageParam === undefined ? {} : { after: pageParam }) },
        signal,
      );
      if (page.mode !== "sources")
        throw new Error("The impact response has the wrong pagination mode.");
      return page;
    },
    getNextPageParam: (page) => page.nextCursor,
  });
  const first = query.data?.pages[0];
  const consistent =
    query.data?.pages.every(
      (page) =>
        page.receipt === first?.receipt && page.hasPublishedUsages === first.hasPublishedUsages,
    ) === true;
  const receipt = open && query.isSuccess && consistent ? first?.receipt : undefined;
  const sameScope = review.open === open && review.entryId === entryId && review.action === action;
  if (!sameScope || (receipt !== undefined && receipt !== review.receipt)) {
    setReview({
      ...review,
      entryId,
      action,
      open,
      locationEpoch: locationEpoch + 1,
      receipt,
      acknowledged: false,
      notice: sameScope && (review.notice || review.receipt !== undefined),
      blockedLocations: new Set<string>(),
    });
  }
  const acknowledged =
    sameScope && receipt !== undefined && receipt === review.receipt && review.acknowledged;
  useEffect(() => {
    if (open && (isLinkImpactChanged(query.error) || (query.isSuccess && !consistent))) refresh();
  }, [open, query.error, query.isSuccess, consistent, refresh]);
  const settled =
    sameScope && receipt !== undefined && !query.isFetching && review.blockedLocations.size === 0;
  const setAcknowledged = (checked: boolean) => {
    if (!settled) return;
    setReview((current) =>
      current.locationEpoch === locationEpoch
        ? { ...current, acknowledged: checked, notice: !checked && current.notice }
        : current,
    );
  };
  const ready = settled && (!first?.hasPublishedUsages || acknowledged);
  const acknowledgment: LinkImpactAcknowledgmentDto | undefined = ready
    ? { receipt, acknowledgePublishedLinks: true }
    : undefined;
  return {
    query,
    entryId,
    action,
    locationEpoch,
    receipt,
    settled,
    acknowledged,
    setAcknowledged,
    refresh,
    ready,
    acknowledgment,
    notice: sameScope && review.notice,
    onLocationsChanged,
    reportLocations,
  };
}
export function LinkImpactReview({
  review,
}: {
  readonly review: ReturnType<typeof useLinkImpactReview>;
}) {
  const { query, entryId, action, locationEpoch, receipt } = review;
  const first = query.data?.pages[0];
  return (
    <section aria-label="Incoming links" className="grid gap-2 text-sm">
      <h3 className="m-0 font-medium">Incoming links</h3>
      {review.notice && (
        <p role="status">Incoming links changed. Review the current impact again.</p>
      )}
      {(query.isPending || (query.isSuccess && receipt === undefined)) && (
        <p role="status">Loading incoming links…</p>
      )}
      {query.isError && (
        <p role="alert">
          {errorDescription(query.error)}{" "}
          <Button onClick={() => void query.refetch()} variant="outline">
            Retry impact
          </Button>
        </p>
      )}
      {query.isSuccess && receipt !== undefined && (
        <>
          {query.data.pages.every((page) => page.sources.length === 0) ? (
            <p>No incoming links.</p>
          ) : (
            <>
              <p>
                After the next site build, these destinations become plain labels or unlinked
                images. Draft and hidden links are retained for later repair.
              </p>
              <ul className="grid max-h-64 gap-3 overflow-auto pl-4">
                {query.data.pages
                  .flatMap((page) => page.sources)
                  .map((source) => (
                    <IncomingImpactSource
                      purpose="url"
                      key={`${locationEpoch}:${source.snapshotId}`}
                      urlReview={{ receipt, locationEpoch }}
                      source={source}
                      entryId={entryId}
                      action={action}
                      onChanged={review.onLocationsChanged}
                      reportLocations={review.reportLocations}
                    />
                  ))}
              </ul>
            </>
          )}
          {query.hasNextPage && (
            <Button
              disabled={query.isFetchingNextPage}
              onClick={() => {
                void query.fetchNextPage();
              }}
              variant="outline"
            >
              More linked sources
            </Button>
          )}
          {first?.hasPublishedUsages && (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={review.acknowledged}
                disabled={!review.settled}
                onChange={(event) => review.setAcknowledged(event.currentTarget.checked)}
              />
              I understand that published links will stop navigating after the next site build.
            </label>
          )}
        </>
      )}
    </section>
  );
}

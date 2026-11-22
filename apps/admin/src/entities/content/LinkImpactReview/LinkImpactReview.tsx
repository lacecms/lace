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
  const [epoch, setEpoch] = useState(0);
  const [reviewedReceipt, setReviewedReceipt] = useState<string>();
  const [notice, setNotice] = useState(false);
  const [blockedLocations, setBlockedLocations] = useState<ReadonlySet<string>>(new Set());
  const reportLocations = useCallback(
    (id: string, blocked: boolean) =>
      setBlockedLocations((current) => {
        if (current.has(id) === blocked) return current;
        const next = new Set(current);
        if (blocked) next.add(id);
        else next.delete(id);
        return next;
      }),
    [],
  );
  const refresh = useCallback(() => {
    setBlockedLocations(new Set());
    setReviewedReceipt(undefined);
    setNotice(true);
    setEpoch((value) => value + 1);
  }, []);
  useEffect(() => {
    if (open) {
      setReviewedReceipt(undefined);
      setNotice(false);
      setBlockedLocations(new Set());
    }
  }, [open, entryId, action]);
  const query = useInfiniteQuery({
    queryKey: ["admin", "link-impact", entryId, action, epoch],
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
  useEffect(() => {
    if (isLinkImpactChanged(query.error)) refresh();
  }, [query.error]);
  const first = query.data?.pages[0];
  const acknowledged = reviewedReceipt !== undefined && reviewedReceipt === first?.receipt;
  const setAcknowledged = (checked: boolean) =>
    setReviewedReceipt(checked ? first?.receipt : undefined);
  const consistent = query.data?.pages.every((page) => page.receipt === first?.receipt) === true;
  useEffect(() => {
    if (query.isSuccess && !consistent) refresh();
  }, [query.isSuccess, consistent, refresh]);
  const ready =
    blockedLocations.size === 0 &&
    open &&
    query.isSuccess &&
    consistent &&
    !query.isFetching &&
    (!first?.hasPublishedUsages || acknowledged);
  const acknowledgment: LinkImpactAcknowledgmentDto | undefined =
    ready && first ? { receipt: first.receipt, acknowledgePublishedLinks: true } : undefined;
  return {
    query,
    entryId,
    action,
    epoch,
    acknowledged,
    setAcknowledged,
    refresh,
    ready,
    acknowledgment,
    notice,
    reportLocations,
  };
}
export function LinkImpactReview({
  review,
}: {
  readonly review: ReturnType<typeof useLinkImpactReview>;
}) {
  const { query, entryId, action, epoch } = review;
  const first = query.data?.pages[0];
  return (
    <section aria-label="Incoming links" className="grid gap-2 text-sm">
      <h3 className="m-0 font-medium">Incoming links</h3>
      {review.notice && (
        <p role="status">Incoming links changed. Review the current impact again.</p>
      )}
      {query.isPending && <p role="status">Loading incoming links…</p>}
      {query.isError && (
        <p role="alert">
          {errorDescription(query.error)}{" "}
          <Button onClick={review.refresh} variant="outline">
            Retry impact
          </Button>
        </p>
      )}
      {query.isSuccess && (
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
                      key={`${epoch}:${source.snapshotId}`}
                      source={source}
                      entryId={entryId}
                      action={action}
                      onChanged={review.refresh}
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

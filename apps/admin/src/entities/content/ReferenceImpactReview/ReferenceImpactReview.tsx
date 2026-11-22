import type { ReferenceImpactAcknowledgmentDto } from "@lacecms/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { errorDescription, useAdminClient } from "../../../shared/api/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { IncomingImpactSource } from "../IncomingImpactSource.js";
import { isIncomingImpactChanged } from "../incoming-impact-error.js";

export const isReferenceImpactChanged = (error: unknown) =>
  isIncomingImpactChanged(error, "reference");

export function useReferenceImpactReview(
  entryId: string,
  action: "delete" | "unpublish",
  open: boolean,
) {
  const client = useAdminClient();
  const [epoch, setEpoch] = useState(0);
  const [reviewedReceipt, setReviewedReceipt] = useState<string>();
  const [notice, setNotice] = useState(false);
  const [blockedLocations, setBlockedLocations] = useState<ReadonlySet<string>>(new Set());
  const reportLocations = useCallback((id: string, blocked: boolean) => {
    setBlockedLocations((current) => {
      if (current.has(id) === blocked) return current;
      const next = new Set(current);
      if (blocked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const refresh = useCallback(() => {
    setBlockedLocations(new Set());
    setReviewedReceipt(undefined);
    setNotice(true);
    setEpoch((value) => value + 1);
  }, []);
  useEffect(() => {
    setReviewedReceipt(undefined);
    setNotice(false);
    setBlockedLocations(new Set());
  }, [open, entryId, action]);
  const query = useInfiniteQuery({
    queryKey: ["admin", "reference-impact", entryId, action, epoch],
    enabled: open,
    initialPageParam: undefined as string | undefined,
    retry: false,
    queryFn: async ({ pageParam, signal }) => {
      const page = await client.referenceImpact(
        entryId,
        { action, ...(pageParam === undefined ? {} : { after: pageParam }) },
        signal,
      );
      if (page.mode !== "sources") throw new Error("Expected referencing entries.");
      return page;
    },
    getNextPageParam: (page) => page.nextCursor,
  });
  const first = query.data?.pages[0];
  const acknowledged = reviewedReceipt !== undefined && reviewedReceipt === first?.receipt;
  const setAcknowledged = (checked: boolean) =>
    setReviewedReceipt(checked ? first?.receipt : undefined);
  const consistent =
    query.data?.pages.every(
      (page) =>
        page.receipt === first?.receipt &&
        page.hasPublishedBlockers === first?.hasPublishedBlockers &&
        page.hasDraftUsages === first.hasDraftUsages,
    ) === true;
  useEffect(() => {
    if (isReferenceImpactChanged(query.error) || (query.isSuccess && !consistent)) refresh();
  }, [query.error, query.isSuccess, consistent, refresh]);
  const needsAcknowledgment =
    action === "delete" && !!first?.hasDraftUsages && !first.hasPublishedBlockers;
  const ready =
    open &&
    query.isSuccess &&
    consistent &&
    !query.isFetching &&
    blockedLocations.size === 0 &&
    !first?.hasPublishedBlockers &&
    (!needsAcknowledgment || (acknowledged && !!first?.receipt));
  const acknowledgment: ReferenceImpactAcknowledgmentDto | undefined =
    ready && needsAcknowledgment && first?.receipt
      ? { receipt: first.receipt, acknowledgeDraftReferences: true }
      : undefined;
  return {
    entryId,
    action,
    epoch,
    query,
    first,
    refresh,
    notice,
    acknowledged,
    setAcknowledged,
    needsAcknowledgment,
    ready,
    acknowledgment,
    reportLocations,
  };
}

export function ReferenceImpactReview({
  review,
  onNavigate,
  inspect = false,
}: {
  readonly review: ReturnType<typeof useReferenceImpactReview>;
  readonly onNavigate: () => void;
  readonly inspect?: boolean;
}) {
  const { query, first, entryId, action, epoch } = review;
  const sources = query.data?.pages.flatMap((page) => page.sources) ?? [];
  return (
    <section aria-label="Entry references" className="grid gap-2 text-sm">
      {!inspect && <h3 className="m-0 font-medium">Entry references</h3>}
      {review.notice && (
        <p role="status">Entry references changed. Review the current impact again.</p>
      )}
      {query.isPending && <p role="status">Loading entry references…</p>}
      {query.isError && (
        <div role="alert">
          {errorDescription(query.error)}{" "}
          <Button onClick={review.refresh} variant="outline">
            Retry reference impact
          </Button>
        </div>
      )}
      {first && (
        <>
          {first.hasPublishedBlockers && (
            <p className="m-0 font-medium">
              Published references block removal. Update and republish the referring entries first.
            </p>
          )}
          {sources.length === 0 ? (
            <p className="m-0">No incoming entry references.</p>
          ) : (
            <ul className="m-0 grid max-h-60 gap-3 overflow-y-auto pl-4">
              {sources.map((source) => (
                <IncomingImpactSource
                  key={`${epoch}:${source.snapshotId}`}
                  action={action}
                  entryId={entryId}
                  onChanged={review.refresh}
                  purpose="reference"
                  reportLocations={review.reportLocations}
                  source={source}
                  renderLocation={(location) => (
                    <>
                      <Link
                        className="font-medium wrap-anywhere underline underline-offset-2"
                        onClick={(event) => {
                          if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey)
                            onNavigate();
                        }}
                        to="/content/$modelKey/$entryId"
                        params={{ modelKey: source.modelKey, entryId: source.entryId }}
                        search={{
                          referenceUse: {
                            ...location,
                            phase: source.phase,
                            snapshotId: source.snapshotId,
                            targetId: entryId,
                          },
                        }}
                      >
                        {location.area === "data" ? "Block field" : "Field"} {location.pointer}
                      </Link>
                      <span className="text-muted-foreground">
                        {" · "}
                        {source.phase === "draft"
                          ? location.delivered
                            ? "Draft use"
                            : "Hidden draft use"
                          : location.delivered
                            ? "Published blocker"
                            : "Hidden in publication"}
                      </span>
                    </>
                  )}
                />
              ))}
            </ul>
          )}
          {query.hasNextPage && (
            <Button
              disabled={query.isFetchingNextPage}
              onClick={() => {
                void query.fetchNextPage();
              }}
              variant="outline"
            >
              More referring entries
            </Button>
          )}
          {!inspect && review.needsAcknowledgment && (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={review.acknowledged}
                onChange={(event) => review.setAcknowledged(event.currentTarget.checked)}
              />
              I understand that these drafts will keep missing selections after deletion.
            </label>
          )}
        </>
      )}
    </section>
  );
}

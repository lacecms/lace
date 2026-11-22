import type { SnapshotEntryReference } from "@lacecms/content";
import type { LinkUsageSourceDto } from "@lacecms/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { errorDescription, useAdminClient } from "../../shared/api/index.js";
import { Button } from "../../shared/ui/Button/index.js";
import { isIncomingImpactChanged } from "./incoming-impact-error.js";

export function IncomingImpactSource({
  source,
  entryId,
  action,
  onChanged,
  reportLocations,
  purpose,
  renderLocation,
}: {
  readonly source: LinkUsageSourceDto;
  readonly entryId: string;
  readonly action: "delete" | "unpublish";
  readonly onChanged: () => void;
  readonly reportLocations: (id: string, blocked: boolean) => void;
  readonly purpose: SnapshotEntryReference["purpose"];
  readonly renderLocation?: (location: LinkUsageSourceDto["locations"][number]) => ReactNode;
}) {
  const client = useAdminClient();
  const [expanded, setExpanded] = useState(false);
  const locations = useInfiniteQuery({
    queryKey: [
      "admin",
      "incoming-locations",
      purpose,
      entryId,
      action,
      source.snapshotId,
      source.nextLocationsCursor,
    ],
    enabled: expanded && source.nextLocationsCursor !== undefined,
    initialPageParam: source.nextLocationsCursor,
    retry: false,
    queryFn: async ({ pageParam, signal }) => {
      const fetchImpact = purpose === "reference" ? client.referenceImpact : client.linkImpact;
      const page = await fetchImpact(
        entryId,
        {
          action,
          sourceEntryId: source.entryId,
          snapshotId: source.snapshotId,
          ...(pageParam === undefined ? {} : { locationsAfter: pageParam }),
          limit: 50,
        },
        signal,
      );
      if (page.mode !== "locations")
        throw new Error("The impact response has the wrong pagination mode.");
      return page;
    },
    getNextPageParam: (page) => page.nextCursor,
  });
  useEffect(() => {
    if (isIncomingImpactChanged(locations.error, purpose)) onChanged();
  }, [locations.error, onChanged, purpose]);
  useEffect(() => {
    reportLocations(
      source.snapshotId,
      expanded && (locations.isPending || locations.isError || locations.isFetching),
    );
    return () => reportLocations(source.snapshotId, false);
  }, [
    expanded,
    locations.isPending,
    locations.isError,
    locations.isFetching,
    reportLocations,
    source.snapshotId,
  ]);
  const rows = [
    ...source.locations,
    ...(locations.data?.pages.flatMap((page) => page.locations) ?? []),
  ];
  return (
    <li>
      {purpose === "reference" ? (
        <span className="font-medium">{source.title}</span>
      ) : (
        <Link
          to="/content/$modelKey/$entryId"
          params={{ modelKey: source.modelKey, entryId: source.entryId }}
        >
          {source.title}
        </Link>
      )}
      <span>
        {" "}
        · {source.modelKey} · {source.phase === "draft" ? "Draft" : "Published"}
      </span>
      <ul>
        {rows.map((location) => (
          <li key={`${location.area}:${location.sourceKey}:${location.pointer}`}>
            {renderLocation ? (
              renderLocation(location)
            ) : (
              <>
                {location.sourceKey} · {location.area}
                {location.pointer} ·{" "}
                {source.phase === "draft"
                  ? "Draft (not public)"
                  : location.delivered
                    ? "Published and visible"
                    : "Hidden (not delivered)"}
              </>
            )}
          </li>
        ))}
      </ul>
      {source.nextLocationsCursor && !expanded && (
        <Button onClick={() => setExpanded(true)} size="sm" variant="ghost">
          More locations in {source.title}
        </Button>
      )}
      {expanded && locations.isPending && <p role="status">Loading locations…</p>}
      {locations.isError && (
        <p role="alert">
          {errorDescription(locations.error)}{" "}
          <Button
            onClick={() => {
              void locations.refetch();
            }}
          >
            Retry locations
          </Button>
        </p>
      )}
      {locations.hasNextPage && (
        <Button
          disabled={locations.isFetchingNextPage}
          onClick={() => {
            void locations.fetchNextPage();
          }}
          size="sm"
          variant="ghost"
        >
          More locations in {source.title}
        </Button>
      )}
    </li>
  );
}

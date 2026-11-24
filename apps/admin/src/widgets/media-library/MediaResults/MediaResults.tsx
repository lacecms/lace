import type { MediaMetadataDto } from "@lacecms/contracts";
import { ChevronDown } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { errorDescription, technicalDetails } from "../../../shared/api/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import type { useMediaBrowser } from "../media-browser.js";

interface Append {
  readonly scope: string;
  readonly previous: ReadonlySet<string>;
  readonly committedPages?: number;
}

/** Owns the continuation control and moves focus after the new results have rendered. */
export function MediaResults({
  children,
  items,
  media,
  scope,
}: ReturnType<typeof useMediaBrowser> & {
  readonly children: ReactNode;
  readonly items: readonly MediaMetadataDto[];
}) {
  const results = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const inFlight = useRef<Append | undefined>(undefined);
  const [append, setAppend] = useState<Append>();
  const [announcement, setAnnouncement] = useState<{ scope: string; added: number }>();
  const activeAppend = append?.scope === scope ? append : undefined;
  const pageCount = media.data?.pages.length ?? 0;
  const hasMore = media.hasNextPage && !media.isPlaceholderData;
  const busy = activeAppend !== undefined || media.isFetchingNextPage;

  async function loadMore() {
    if (busy || !hasMore || inFlight.current?.scope === scope) return;
    setAnnouncement(undefined);
    const request = { scope, previous: new Set(items.map(({ id }) => id)) };
    inFlight.current = request;
    setAppend(request);
    const next = await media.fetchNextPage();
    if (inFlight.current === request) inFlight.current = undefined;
    const committedPages = next.data?.pages.length ?? 0;
    setAppend((current) => {
      if (current !== request) return current;
      if (next.isFetchNextPageError || committedPages <= pageCount) return undefined;
      return { ...request, committedPages };
    });
  }

  useLayoutEffect(() => {
    if (activeAppend?.committedPages === undefined || pageCount < activeAppend.committedPages)
      return;
    const added = items.filter(({ id }) => !activeAppend.previous.has(id));
    setAnnouncement({ scope, added: added.length });
    // The trigger stays mounted through this commit, including on the final page.
    if (document.activeElement === trigger.current) {
      const first = Array.from(
        results.current?.querySelectorAll<HTMLElement>("[data-media-result]") ?? [],
      ).find((element) => element.dataset.mediaResult === added[0]?.id);
      if (first) first.focus();
      else if (!hasMore) status.current?.focus();
    }
    setAppend(undefined);
  }, [activeAppend, hasMore, items, pageCount, scope]);

  return (
    <div className="grid min-w-0 gap-3" ref={results}>
      {children}
      {media.isFetchNextPageError ? (
        <ErrorState
          description={errorDescription(media.error)}
          technicalDetails={technicalDetails(media.error)}
          title="Could not load more media"
        />
      ) : undefined}
      <div className="grid justify-items-center gap-2">
        {hasMore || activeAppend !== undefined ? (
          <Button
            aria-busy={busy || undefined}
            aria-disabled={busy || undefined}
            className="min-w-44 aria-disabled:cursor-wait aria-disabled:opacity-70"
            onClick={() => void loadMore()}
            ref={trigger}
            size="lg"
          >
            {busy
              ? "Loading more media…"
              : media.isFetchNextPageError
                ? "Retry loading more media"
                : "Load more media"}
            {busy ? undefined : <ChevronDown aria-hidden="true" />}
          </Button>
        ) : undefined}
        <p
          aria-label="Media results"
          className="m-0 text-sm text-muted-foreground"
          ref={status}
          role="status"
          tabIndex={-1}
        >
          {announcement?.scope === scope ? (
            <span className="sr-only">{`${announcement.added} ${announcement.added === 1 ? "item" : "items"} added. `}</span>
          ) : undefined}
          {`Showing ${items.length} ${items.length === 1 ? "item" : "items"}`}
        </p>
      </div>
    </div>
  );
}

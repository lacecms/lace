import type { MediaMetadataDto } from "@lacecms/contracts";
import { Check } from "lucide-react";
import { useId } from "react";
import { MediaStatusBadge, MediaThumbnail } from "../../../entities/media/index.js";
import { cn } from "../../../shared/lib/index.js";

/**
 * Media as square image tiles. In `open` mode activating a tile opens its
 * details; in `choose` mode it chooses the item, `currentId` marks the
 * current choice, and each tile shows the item's alt text as its description.
 * In `select` mode tiles are toggles: `selection` maps selected identifiers to
 * their one-based positions, `usedIds` get `usedNote`, and while `blocked`
 * names a reason, unselected tiles stay focusable but cannot be selected.
 */
export function MediaGrid({
  blocked,
  busy = false,
  currentId,
  items,
  label,
  mode = "open",
  onOpen,
  selection,
  usedIds,
  usedNote,
}: {
  readonly blocked?: string | undefined;
  readonly busy?: boolean;
  readonly currentId?: string | undefined;
  readonly items: readonly MediaMetadataDto[];
  readonly label: string;
  readonly mode?: "choose" | "open" | "select";
  readonly onOpen: (item: MediaMetadataDto, opener: HTMLElement) => void;
  readonly selection?: ReadonlyMap<string, number> | undefined;
  readonly usedIds?: ReadonlySet<string> | undefined;
  readonly usedNote?: string | undefined;
}) {
  const id = useId();
  return (
    <ul
      aria-busy={busy || undefined}
      aria-label={label}
      className={cn(
        "m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3 p-0 transition-opacity duration-(--duration-fast)",
        busy && "opacity-60",
      )}
    >
      {items.map((item, index) => {
        const current = mode === "choose" && item.id === currentId;
        const position = mode === "select" ? selection?.get(item.id) : undefined;
        const marked = current || position !== undefined;
        const used = mode === "select" && usedNote !== undefined && usedIds?.has(item.id) === true;
        const unavailable = mode === "select" && position === undefined && blocked !== undefined;
        const altId = `${id}-alt-${index}`;
        const usedId = `${id}-used-${index}`;
        const blockedId = `${id}-blocked-${index}`;
        const describedBy = [
          mode === "open" ? undefined : altId,
          used ? usedId : undefined,
          unavailable ? blockedId : undefined,
        ].filter(Boolean);
        return (
          <li key={item.id}>
            <button
              {...(mode === "open" ? { "aria-haspopup": "dialog" as const } : {})}
              {...(describedBy.length > 0 ? { "aria-describedby": describedBy.join(" ") } : {})}
              {...(current ? { "aria-current": "true" as const } : {})}
              {...(mode === "select" ? { "aria-pressed": position !== undefined } : {})}
              {...(unavailable ? { "aria-disabled": true } : {})}
              className={cn(
                "group grid w-full cursor-pointer gap-1.5 rounded-lg border border-border bg-card p-1.5 text-left text-card-foreground shadow-xs transition-colors duration-(--duration-fast) ease-standard hover:border-ring focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring",
                marked && "border-primary ring-2 ring-primary",
                unavailable && "cursor-not-allowed opacity-60 hover:border-border",
              )}
              onClick={(event) => {
                if (!unavailable) onOpen(item, event.currentTarget);
              }}
              type="button"
            >
              <span className="relative block">
                <MediaThumbnail className="aspect-square w-full rounded-md" mediaId={item.id} />
                {item.status === "active" ? undefined : (
                  <span className="absolute top-1.5 left-1.5">
                    <MediaStatusBadge status={item.status} />
                  </span>
                )}
                {current ? (
                  <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check aria-hidden="true" className="size-3.5" />
                  </span>
                ) : undefined}
                {position === undefined ? undefined : (
                  // The pressed state names the selection; the number shows its order.
                  <span
                    aria-hidden="true"
                    className="absolute top-1.5 right-1.5 flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full bg-primary px-1 text-xs font-medium text-primary-foreground tabular-nums"
                  >
                    <Check className="size-3" />
                    {position}
                  </span>
                )}
              </span>
              <span className="truncate px-0.5 text-xs font-medium" title={item.filename}>
                {item.filename}
              </span>
              {mode === "open" ? undefined : (
                // Described rather than named, so the tile keeps the filename as its name.
                <span
                  aria-hidden="true"
                  className={cn(
                    "truncate px-0.5 text-xs",
                    item.alt === undefined ? "text-muted-foreground italic" : "text-foreground",
                  )}
                  id={altId}
                  title={item.alt}
                >
                  {item.alt ?? "No alt text"}
                </span>
              )}
              {used ? (
                <span
                  aria-hidden="true"
                  className="truncate px-0.5 text-xs text-muted-foreground"
                  id={usedId}
                >
                  {usedNote}
                </span>
              ) : undefined}
              {unavailable ? (
                <span hidden id={blockedId}>
                  {blocked}
                </span>
              ) : undefined}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

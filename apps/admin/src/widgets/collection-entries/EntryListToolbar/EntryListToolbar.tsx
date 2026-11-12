import type {
  ContentEntryStatusDto,
  ContentEntryStatusTotalsDto,
  ListQueryLimits,
} from "@lacecms/contracts";
import { NODE_LIST_QUERY_LIMITS, fitsListQueryLimits } from "@lacecms/contracts";
import { Info, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { listQueryBudgetHint } from "../../../entities/content/index.js";
import { cn } from "../../../shared/lib/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { Input } from "../../../shared/ui/Input/index.js";
import { Popover, PopoverContent, PopoverTrigger } from "../../../shared/ui/Popover/index.js";

const SEARCH_DEBOUNCE_MS = 300;

const statusOptions = [
  { label: "All", total: "all", value: undefined },
  { label: "Draft", total: "draft", value: "draft" },
  { label: "Published", total: "published", value: "published" },
  { label: "Changed", total: "changed", value: "changed" },
] as const;

/**
 * Search box and status filter of a collection list. Typing updates the
 * search after a pause; the status buttons show the totals for the search.
 */
export function EntryListToolbar({
  onClear,
  onSearchChange,
  onStatusChange,
  search,
  status,
  totals,
  limits = NODE_LIST_QUERY_LIMITS,
  searchableLabels = [],
  hasFieldFilters = false,
}: {
  readonly limits?: ListQueryLimits;
  readonly searchableLabels?: readonly string[];
  readonly hasFieldFilters?: boolean;
  readonly onClear: () => void;
  readonly onSearchChange: (search: string) => void;
  readonly onStatusChange: (status: ContentEntryStatusDto | undefined) => void;
  readonly search: string;
  readonly status: ContentEntryStatusDto | undefined;
  readonly totals: ContentEntryStatusTotalsDto | undefined;
}) {
  const [draft, setDraft] = useState(search);
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(onSearchChange);
  latest.current = onSearchChange;
  const policy = useRef(limits);
  policy.current = limits;
  const hintId = useId();
  const invalid = !fitsListQueryLimits(draft.trim(), limits);

  // Adopt searches applied from outside (clear filters, history navigation)
  // without trimming what the user is still typing.
  useEffect(() => {
    clearTimeout(pending.current);
    setDraft((current) => (current.trim() === search ? current : search));
  }, [search]);
  useEffect(() => () => clearTimeout(pending.current), []);

  function changeDraft(next: string) {
    setDraft(next);
    clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      if (fitsListQueryLimits(next.trim(), policy.current)) latest.current(next);
    }, SEARCH_DEBOUNCE_MS);
  }

  return (
    <div className="contents">
      <form
        className="w-full sm:w-72"
        onSubmit={(event) => {
          event.preventDefault();
          clearTimeout(pending.current);
          if (!invalid) onSearchChange(draft);
        }}
        role="search"
      >
        <div className="flex items-center gap-1">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Search entries"
              aria-describedby={invalid ? hintId : undefined}
              aria-invalid={invalid}
              className="pl-8"
              maxLength={limits.maxSearchLength}
              onChange={(event) => changeDraft(event.currentTarget.value)}
              placeholder={searchableLabels.length ? "Search entries" : "Search title or slug"}
              type="search"
              value={draft}
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button aria-label="Search information" size="icon" type="button" variant="ghost">
                <Info aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              aria-label="Search information"
              className="max-w-[calc(100vw-2rem)] text-sm"
            >
              <p className="m-0">
                Search title, slug
                {searchableLabels.length ? ` and ${searchableLabels.join(", ")}` : ""}.
              </p>
              <p className="mt-2 mb-0">{listQueryBudgetHint(limits)}</p>
            </PopoverContent>
          </Popover>
        </div>
        {invalid ? (
          <p id={hintId} className="mt-1 mb-0 text-xs text-destructive" role="alert">
            Search is too long. Shorten it. {listQueryBudgetHint(limits)}
          </p>
        ) : undefined}
      </form>
      <div
        aria-label="Filter by status"
        className="flex min-h-8 flex-wrap items-center gap-1"
        role="group"
      >
        {statusOptions.map((option) => {
          const pressed = status === option.value;
          return (
            <Button
              aria-pressed={pressed}
              className={cn(pressed ? "bg-accent text-accent-foreground" : "text-muted-foreground")}
              key={option.label}
              onClick={() => onStatusChange(option.value)}
              size="sm"
              variant="ghost"
            >
              {option.label}
              {totals === undefined ? undefined : (
                <>
                  {" "}
                  <span className="text-xs tabular-nums">{totals[option.total]}</span>
                </>
              )}
            </Button>
          );
        })}
      </div>
      {search.length > 0 || status !== undefined || hasFieldFilters ? (
        <Button className="h-8" onClick={onClear} size="sm" variant="ghost">
          <X aria-hidden="true" />
          Clear filters
        </Button>
      ) : undefined}
    </div>
  );
}

import {
  MAX_MEDIA_SEARCH_LENGTH,
  type MediaMimeTypeDto,
  type MediaSortDto,
} from "@lacecms/contracts";
import { LayoutGrid, List, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MAX_MEDIA_TAG_FILTERS, MediaTagInput } from "../../../entities/media/index.js";
import { cn } from "../../../shared/lib/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { Input } from "../../../shared/ui/Input/index.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../shared/ui/Select/index.js";
import { mediaSortOptions, mediaTypeOptions, type MediaView } from "../library-query.js";

const SEARCH_DEBOUNCE_MS = 300;

const viewOptions = [
  { icon: LayoutGrid, label: "Grid view", value: "grid" },
  { icon: List, label: "List view", value: "list" },
] as const;

/**
 * Filename search, type and tag filters, sort, and grid/list toggle of the
 * media library. Typing updates the search after a pause. Tags combine with
 * AND, up to the API's filter limit. The toggle renders only when the caller
 * handles view changes.
 */
export function MediaToolbar({
  onClear,
  onSearchChange,
  onSortChange,
  onTagsChange,
  onTypeChange,
  onViewChange,
  search,
  sort,
  tags,
  type,
  view,
}: {
  readonly onClear: () => void;
  readonly onSearchChange: (search: string) => void;
  readonly onSortChange: (sort: MediaSortDto) => void;
  readonly onTagsChange: (tags: readonly string[]) => void;
  readonly onTypeChange: (type: MediaMimeTypeDto | undefined) => void;
  readonly onViewChange?: ((view: MediaView) => void) | undefined;
  readonly search: string;
  readonly sort: MediaSortDto;
  readonly tags: readonly string[];
  readonly type: MediaMimeTypeDto | undefined;
  readonly view?: MediaView | undefined;
}) {
  const [draft, setDraft] = useState(search);
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(onSearchChange);
  latest.current = onSearchChange;

  // Adopt searches applied from outside (clear filters, history navigation)
  // without trimming what the user is still typing.
  useEffect(() => {
    setDraft((current) => (current.trim() === search ? current : search));
  }, [search]);
  useEffect(() => () => clearTimeout(pending.current), []);

  function changeDraft(next: string) {
    setDraft(next);
    clearTimeout(pending.current);
    pending.current = setTimeout(() => latest.current(next), SEARCH_DEBOUNCE_MS);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form
        className="relative w-full sm:w-64"
        onSubmit={(event) => {
          event.preventDefault();
          clearTimeout(pending.current);
          onSearchChange(draft);
        }}
        role="search"
      >
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label="Search media"
          className="pl-8"
          maxLength={MAX_MEDIA_SEARCH_LENGTH}
          onChange={(event) => changeDraft(event.currentTarget.value)}
          placeholder="Search filename"
          type="search"
          value={draft}
        />
      </form>
      <div aria-label="Filter by type" className="flex flex-wrap gap-1" role="group">
        {mediaTypeOptions.map((option) => {
          const pressed = type === option.value;
          return (
            <Button
              aria-pressed={pressed}
              className={cn(pressed ? "bg-accent text-accent-foreground" : "text-muted-foreground")}
              key={option.label}
              onClick={() => onTypeChange(option.value)}
              size="sm"
              variant="ghost"
            >
              {option.label}
            </Button>
          );
        })}
      </div>
      <MediaTagInput
        className="w-full sm:w-72"
        label="Filter by tags (all must match)"
        limit={MAX_MEDIA_TAG_FILTERS}
        limitMessage={`At most ${MAX_MEDIA_TAG_FILTERS} tags can be combined.`}
        onChange={onTagsChange}
        tags={tags}
      />
      {search.length > 0 || type !== undefined || tags.length > 0 ? (
        <Button onClick={onClear} size="sm" variant="ghost">
          <X aria-hidden="true" />
          Clear filters
        </Button>
      ) : undefined}
      <div className="ml-auto flex items-center gap-2">
        <Select onValueChange={(value) => onSortChange(value as MediaSortDto)} value={sort}>
          <SelectTrigger aria-label="Sort media" className="w-40" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {mediaSortOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {onViewChange === undefined ? undefined : (
          <div
            aria-label="Layout"
            className="flex rounded-md border border-border p-0.5"
            role="group"
          >
            {viewOptions.map((option) => {
              const pressed = view === option.value;
              const Icon = option.icon;
              return (
                <Button
                  aria-label={option.label}
                  aria-pressed={pressed}
                  className={cn(
                    pressed ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                  )}
                  key={option.value}
                  onClick={() => onViewChange(option.value)}
                  size="icon-xs"
                  variant="ghost"
                >
                  <Icon aria-hidden="true" />
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

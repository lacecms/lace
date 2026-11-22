import type { ReferenceTargetPageDto } from "@lacecms/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { adminQueryKeys, errorDescription, useAdminClient } from "../../../shared/api/index.js";
import { Badge } from "../../../shared/ui/Badge/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "../../../shared/ui/Dialog/index.js";
import { Input } from "../../../shared/ui/Input/index.js";
import type { ReferenceListPickerProps } from "../../../entities/field-editor/index.js";

type Target = ReferenceTargetPageDto["items"][number];

export function ReferencePublicationBadge({ state }: { readonly state: Target["state"] }) {
  return (
    <Badge variant={state === "published" ? "secondary" : "warning"}>
      {state === "published" ? "Published" : "Draft only"}
    </Badge>
  );
}

export function ReferencePicker({
  label,
  models,
  capacity,
  limitMessage,
  onConfirm,
  onCancel,
  onCloseAutoFocus,
  multiple = true,
}: ReferenceListPickerProps & { readonly multiple?: boolean }) {
  const client = useAdminClient();
  const [modelKey, setModelKey] = useState(models[0]!);
  const [search, setSearch] = useState("");
  const [prefix, setPrefix] = useState("");
  const [selected, setSelected] = useState<Target[]>([]);
  const settled = prefix === search.trim();
  useEffect(() => {
    const timer = setTimeout(() => setPrefix(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useInfiniteQuery({
    queryKey: [...adminQueryKeys.referenceTargets, modelKey, settled ? prefix : null],
    enabled: settled,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      client.listReferenceTargets(
        { modelKey, search: prefix, ...(pageParam === undefined ? {} : { after: pageParam }) },
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor,
  });
  const results = [
    ...new Map(
      query.data?.pages.flatMap((page) => page.items).map((item) => [item.id, item]),
    ).values(),
  ];
  const remaining = capacity - selected.length;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogTitle>
          {multiple ? `Add entries to ${label}` : `Choose entry for ${label}`}
        </DialogTitle>
        <DialogDescription>
          {multiple
            ? "Add entries in the order you want them to appear."
            : "Search by the beginning of an entry title."}
        </DialogDescription>
        {models.length > 1 && (
          <div aria-label="Target model" role="group" className="flex flex-wrap gap-1">
            {models.map((model) => (
              <Button
                key={model}
                aria-pressed={modelKey === model}
                onClick={() => setModelKey(model)}
                size="sm"
                variant="outline"
              >
                {model}
              </Button>
            ))}
          </div>
        )}
        <Input
          aria-label="Search entries by title prefix"
          maxLength={100}
          onChange={(event) => setSearch(event.currentTarget.value)}
          type="search"
          value={search}
        />
        <div className="grid max-h-56 gap-1 overflow-y-auto">
          {(!settled || query.isPending) && <p role="status">Searching entries…</p>}
          {settled && query.isError && (
            <div className="text-sm" role="alert">
              {errorDescription(query.error)}
              <Button
                onClick={() => {
                  void query.refetch();
                }}
                size="sm"
                variant="ghost"
              >
                Retry search
              </Button>
            </div>
          )}
          {settled && query.isSuccess && !results.length && <p role="status">No entries found.</p>}
          {settled &&
            results.map((entry) => (
              <Button
                className="h-auto justify-between gap-2 whitespace-normal text-left"
                disabled={remaining <= 0}
                key={entry.id}
                onClick={() => {
                  if (multiple)
                    setSelected((items) => (items.length < capacity ? [...items, entry] : items));
                  else onConfirm([entry.id]);
                }}
                variant="ghost"
              >
                <span className="min-w-0 wrap-anywhere">
                  {entry.title}
                  <small className="block text-muted-foreground">{entry.modelKey}</small>
                </span>
                <ReferencePublicationBadge state={entry.state} />
              </Button>
            ))}
          {settled && query.hasNextPage && (
            <Button
              disabled={query.isFetchingNextPage}
              onClick={() => {
                void query.fetchNextPage();
              }}
              variant="outline"
            >
              More entries
            </Button>
          )}
        </div>
        {multiple && (
          <>
            <p className="m-0 text-sm" role="status">
              {remaining} {remaining === 1 ? "slot" : "slots"} remaining.{" "}
              {remaining === 0 && limitMessage}
            </p>
            {selected.length > 0 && (
              <ol
                aria-label="Entries to add"
                className="m-0 grid max-h-32 gap-1 overflow-y-auto pl-6 text-sm"
              >
                {selected.map((entry, index) => (
                  <li key={index}>
                    <span className="wrap-anywhere">{entry.title}</span>
                    <Button
                      aria-label={`Remove ${entry.title} from selection at position ${index + 1}`}
                      onClick={() =>
                        setSelected((items) => items.filter((_, choice) => choice !== index))
                      }
                      size="sm"
                      variant="ghost"
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
        <DialogFooter>
          <Button onClick={onCancel} variant="outline">
            Cancel
          </Button>
          {multiple && (
            <Button
              disabled={!selected.length}
              onClick={() => onConfirm(selected.map((entry) => entry.id))}
            >
              Add selected entries
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import type { MediaListDto, MediaMetadataDto } from "@lacecms/contracts";
import { type InfiniteData, keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { type ComponentProps, useEffect, useMemo, useRef, useState } from "react";
import { isOpenTagCombobox, mediaConstraintsText } from "../../../entities/media/index.js";
import { can, useSession, useSessionRecovery } from "../../../entities/session/index.js";
import {
  DropOverlay,
  UploadQueue,
  useMediaDropzone,
  useMediaUploads,
} from "../../../features/upload-media/index.js";
import {
  adminQueryKeys,
  DEFAULT_MEDIA_SORT,
  errorDescription,
  technicalDetails,
  useAdminClient,
} from "../../../shared/api/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/Dialog/index.js";
import { EmptyState } from "../../../shared/ui/EmptyState/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { LoadingState } from "../../../shared/ui/LoadingState/index.js";
import {
  type CanonicalMediaQuery,
  type MediaLibraryQuery,
  normalizedMediaQuery,
} from "../library-query.js";
import { MediaGrid } from "../MediaGrid/index.js";
import { MediaToolbar } from "../MediaToolbar/index.js";

/** Multiple mode: an ordered selection confirmed once, for adding list items. */
export interface MediaPickerSelection {
  /** At most this many items can be selected (at least one). */
  readonly capacity: number;
  /** Names what stops the selection once it reaches `capacity`. */
  readonly limitMessage: string;
  /** Media already in the target, marked on their tiles but still selectable. */
  readonly existingIds: ReadonlySet<string>;
  /** Receives the selected items in selection order; the caller closes the dialog. */
  readonly onConfirm: (items: readonly MediaMetadataDto[]) => void;
}

type PickerMode =
  | {
      readonly currentId: string | undefined;
      readonly onChoose: (item: MediaMetadataDto) => void;
      readonly selection?: undefined;
    }
  | {
      readonly currentId?: undefined;
      readonly onChoose?: undefined;
      readonly selection: MediaPickerSelection;
    };

/**
 * The media field picker: a modal around the library grid with local search,
 * type and tag filters, and sort, cursor pagination, and in-dialog upload for writers.
 * In single mode activating a tile or an upload row's Use chooses that item.
 * With `selection` (multiple mode) tiles and uploaded rows toggle an ordered
 * selection, confirmed uploads join it while capacity remains, and the footer
 * hands it over at once. Either way the caller closes the dialog. The body
 * mounts only while open, so each opening starts from the default query with
 * an empty upload queue and selection.
 */
export function MediaPickerDialog({
  label,
  onCloseAutoFocus,
  onOpenChange,
  open,
  ...mode
}: PickerMode & {
  readonly label: string;
  readonly onCloseAutoFocus: ComponentProps<typeof DialogContent>["onCloseAutoFocus"];
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="flex max-h-[85vh] flex-col gap-4 sm:max-w-4xl"
        onCloseAutoFocus={onCloseAutoFocus}
        // Escape in an open tag suggestion list closes only that list.
        onEscapeKeyDown={(event) => {
          if (isOpenTagCombobox(event.target)) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {mode.selection === undefined ? `Choose media for ${label}` : `Add media to ${label}`}
          </DialogTitle>
          <DialogDescription>
            {mode.selection === undefined
              ? "Activate an image to use it."
              : "Activate images to select them. They are added in the order selected."}
          </DialogDescription>
        </DialogHeader>
        <PickerBody {...mode} label={label} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

const countText = (count: number) => `${count} ${count === 1 ? "item" : "items"}`;

function PickerBody({
  currentId,
  label,
  onCancel,
  onChoose,
  selection,
}: PickerMode & { readonly label: string; readonly onCancel: () => void }) {
  const client = useAdminClient();
  const session = useSession();
  const canWrite = can(session, "media:write");
  const [query, setQuery] = useState<CanonicalMediaQuery>({});
  const uploads = useMediaUploads();
  const dropzone = useMediaDropzone({
    disabled: !canWrite,
    onFiles: (files) => uploads.add(files, { tags: query.tag }),
  });
  const listQuery = {
    ...(query.q === undefined ? {} : { q: query.q }),
    ...(query.sort === undefined ? {} : { sort: query.sort }),
    ...(query.tag === undefined ? {} : { tags: query.tag }),
    ...(query.type === undefined ? {} : { type: query.type }),
  };
  const media = useInfiniteQuery<
    MediaListDto,
    Error,
    InfiniteData<MediaListDto>,
    ReturnType<typeof adminQueryKeys.mediaList>,
    string | undefined
  >({
    getNextPageParam: (page) => page.nextCursor,
    initialPageParam: undefined as string | undefined,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) => client.listMedia(pageParam, listQuery),
    queryKey: adminQueryKeys.mediaList(listQuery),
  });
  useSessionRecovery(media.error);
  const change = (next: MediaLibraryQuery) =>
    setQuery((current) => normalizedMediaQuery({ ...current, ...next }));
  const items = (media.data?.pages.flatMap((page) => page.items) ?? []).filter(
    (item) => item.status === "active",
  );
  const filtered = query.q !== undefined || query.type !== undefined || query.tag !== undefined;
  // A page may hold only items pending deletion; stay quiet while more pages exist.
  const empty = media.data !== undefined && items.length === 0 && !media.hasNextPage;
  const clear = () => change({ q: undefined, tag: undefined, type: undefined });

  const [selected, setSelected] = useState<readonly MediaMetadataDto[]>([]);
  const positions = useMemo(
    () => new Map(selected.map((item, index) => [item.id, index + 1])),
    [selected],
  );
  const capacity = selection?.capacity ?? 0;
  const blocked = selected.length >= capacity ? selection?.limitMessage : undefined;
  const toggle = (item: MediaMetadataDto) =>
    setSelected((current) =>
      current.some((entry) => entry.id === item.id)
        ? current.filter((entry) => entry.id !== item.id)
        : current.length < capacity
          ? [...current, item]
          : current,
    );
  // Confirmed uploads join the selection once, in queue order, while capacity remains.
  const seenUploads = useRef(new Set<string>());
  useEffect(() => {
    if (selection === undefined) return;
    const confirmed = uploads.uploads.filter(
      (upload) => upload.state === "uploaded" && !seenUploads.current.has(upload.key),
    );
    if (confirmed.length === 0) return;
    for (const upload of confirmed) seenUploads.current.add(upload.key);
    setSelected((current) => {
      const next = [...current];
      for (const { item } of confirmed)
        if (item !== undefined && next.length < capacity && !next.some(({ id }) => id === item.id))
          next.push(item);
      return next;
    });
  }, [capacity, selection, uploads.uploads]);

  return (
    <>
      <div
        className="relative -mx-6 grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-6 pb-1"
        {...(canWrite ? dropzone.getRootProps() : {})}
      >
        {canWrite && dropzone.isDragActive ? <DropOverlay /> : undefined}
        {canWrite ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <p className="m-0 text-sm text-muted-foreground">
                {`Drop images here or choose files. ${mediaConstraintsText}`}
              </p>
              {query.tag === undefined ? undefined : (
                <p className="m-0 text-sm text-muted-foreground">
                  {`New uploads are tagged ${query.tag.join(", ")}.`}
                </p>
              )}
            </div>
            <div>
              <input {...dropzone.getInputProps()} />
              <Button onClick={dropzone.open} size="sm" variant="outline">
                <Upload aria-hidden="true" />
                Upload images
              </Button>
            </div>
          </div>
        ) : undefined}
        <UploadQueue
          onChoose={onChoose}
          selection={
            selection === undefined
              ? undefined
              : { blocked, isSelected: (item) => positions.has(item.id), onToggle: toggle }
          }
          onClearFinished={uploads.clearFinished}
          onDismiss={uploads.dismiss}
          onRetry={uploads.retry}
          uploads={uploads.uploads}
        />
        <MediaToolbar
          onClear={clear}
          onSearchChange={(q) => change({ q })}
          onSortChange={(sort) => change({ sort })}
          onTagsChange={(tag) => change({ tag })}
          onTypeChange={(type) => change({ type })}
          search={query.q ?? ""}
          sort={query.sort ?? DEFAULT_MEDIA_SORT}
          tags={query.tag ?? []}
          type={query.type}
        />
        {media.isPending ? <LoadingState label="Loading media" lines={3} /> : undefined}
        {media.data === undefined && media.error !== null ? (
          <ErrorState
            description={errorDescription(media.error)}
            onRetry={() => void media.refetch()}
            retrying={media.isFetching}
            technicalDetails={technicalDetails(media.error)}
          />
        ) : undefined}
        {empty && !filtered ? (
          <EmptyState
            description={
              canWrite
                ? "Upload an image to use it here."
                : "No active images are available to choose."
            }
            title="No media yet"
          />
        ) : undefined}
        {empty && filtered ? (
          <EmptyState
            action={
              <Button onClick={clear} variant="outline">
                Clear filters
              </Button>
            }
            description="No active media matches the current search, type, and tag filters."
            title="No matching media"
          />
        ) : undefined}
        {items.length === 0 ? undefined : (
          <MediaGrid
            blocked={blocked}
            busy={media.isPlaceholderData}
            currentId={currentId}
            items={items}
            label={`Media choices for ${label}`}
            mode={selection === undefined ? "choose" : "select"}
            onOpen={(item) => (selection === undefined ? onChoose(item) : toggle(item))}
            selection={positions}
            usedIds={selection?.existingIds}
            usedNote={`Already in ${label}`}
          />
        )}
        {media.isFetchNextPageError ? (
          <ErrorState
            description={errorDescription(media.error)}
            technicalDetails={technicalDetails(media.error)}
          />
        ) : undefined}
        {media.data === undefined ? undefined : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p aria-live="polite" className="m-0 text-sm text-muted-foreground">
              {`Showing ${items.length} ${items.length === 1 ? "item" : "items"}`}
            </p>
            {media.hasNextPage ? (
              <Button
                disabled={media.isFetchingNextPage}
                onClick={() => media.fetchNextPage()}
                variant="outline"
              >
                {media.isFetchingNextPage ? "Loading more…" : "Load more media"}
              </Button>
            ) : undefined}
          </div>
        )}
      </div>
      {selection === undefined ? undefined : (
        <DialogFooter className="items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p aria-live="polite" className="m-0 text-sm" role="status">
              {selected.length === 0
                ? `No items selected. You can select up to ${countText(capacity)}.`
                : blocked === undefined
                  ? `${countText(selected.length)} selected. ${capacity - selected.length} more can be selected.`
                  : `${countText(selected.length)} selected. Limit reached: ${blocked}`}
            </p>
            {selected.length === 0 ? undefined : (
              <Button onClick={() => setSelected([])} size="sm" variant="ghost">
                Clear selection
              </Button>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button onClick={onCancel} variant="outline">
              Cancel
            </Button>
            <Button disabled={selected.length === 0} onClick={() => selection.onConfirm(selected)}>
              {`Add ${selected.length} ${selected.length === 1 ? "image" : "images"}`}
            </Button>
          </div>
        </DialogFooter>
      )}
    </>
  );
}

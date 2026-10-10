import type { MediaListDto, MediaMetadataDto } from "@lacecms/contracts";
import { type InfiniteData, keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { type ComponentProps, useState } from "react";
import { mediaConstraintsText } from "../../../entities/media/index.js";
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

/**
 * The media field picker: a modal around the library grid with local search,
 * type filter, and sort, cursor pagination, and in-dialog upload for writers.
 * Activating a tile or an upload row's Use chooses that item; the caller
 * closes the dialog. The body mounts only while open, so each opening starts
 * from the default query with an empty upload queue.
 */
export function MediaPickerDialog({
  currentId,
  label,
  onChoose,
  onCloseAutoFocus,
  onOpenChange,
  open,
}: {
  readonly currentId: string | undefined;
  readonly label: string;
  readonly onChoose: (item: MediaMetadataDto) => void;
  readonly onCloseAutoFocus: ComponentProps<typeof DialogContent>["onCloseAutoFocus"];
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="flex max-h-[85vh] flex-col gap-4 sm:max-w-4xl"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{`Choose media for ${label}`}</DialogTitle>
          <DialogDescription>Activate an image to use it.</DialogDescription>
        </DialogHeader>
        <PickerBody currentId={currentId} label={label} onChoose={onChoose} />
      </DialogContent>
    </Dialog>
  );
}

function PickerBody({
  currentId,
  label,
  onChoose,
}: {
  readonly currentId: string | undefined;
  readonly label: string;
  readonly onChoose: (item: MediaMetadataDto) => void;
}) {
  const client = useAdminClient();
  const session = useSession();
  const canWrite = can(session, "media:write");
  const [query, setQuery] = useState<CanonicalMediaQuery>({});
  const uploads = useMediaUploads();
  const dropzone = useMediaDropzone({ disabled: !canWrite, onFiles: uploads.add });
  const listQuery = {
    ...(query.q === undefined ? {} : { q: query.q }),
    ...(query.sort === undefined ? {} : { sort: query.sort }),
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
  const filtered = query.q !== undefined || query.type !== undefined;
  // A page may hold only items pending deletion; stay quiet while more pages exist.
  const empty = media.data !== undefined && items.length === 0 && !media.hasNextPage;
  const clear = () => change({ q: undefined, type: undefined });

  return (
    <div
      className="relative -mx-6 grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-6 pb-1"
      {...(canWrite ? dropzone.getRootProps() : {})}
    >
      {canWrite && dropzone.isDragActive ? <DropOverlay /> : undefined}
      {canWrite ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-sm text-muted-foreground">
            {`Drop images here or choose files. ${mediaConstraintsText}`}
          </p>
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
        onClearFinished={uploads.clearFinished}
        onDismiss={uploads.dismiss}
        onRetry={uploads.retry}
        uploads={uploads.uploads}
      />
      <MediaToolbar
        onClear={clear}
        onSearchChange={(q) => change({ q })}
        onSortChange={(sort) => change({ sort })}
        onTypeChange={(type) => change({ type })}
        search={query.q ?? ""}
        sort={query.sort ?? DEFAULT_MEDIA_SORT}
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
          description="No active media matches the current search and type filter."
          title="No matching media"
        />
      ) : undefined}
      {items.length === 0 ? undefined : (
        <MediaGrid
          busy={media.isPlaceholderData}
          currentId={currentId}
          items={items}
          label={`Media choices for ${label}`}
          mode="choose"
          onOpen={(item) => onChoose(item)}
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
  );
}

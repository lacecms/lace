import type { MediaMetadataDto } from "@lacecms/contracts";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { mediaConstraintsText } from "../../../entities/media/index.js";
import { can, useSession } from "../../../entities/session/index.js";
import {
  DropOverlay,
  UploadQueue,
  useMediaDropzone,
  useMediaUploads,
} from "../../../features/upload-media/index.js";
import {
  DEFAULT_MEDIA_SORT,
  errorDescription,
  technicalDetails,
} from "../../../shared/api/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { EmptyState } from "../../../shared/ui/EmptyState/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { pageClass } from "../../../shared/ui/layout/index.js";
import { LoadingState } from "../../../shared/ui/LoadingState/index.js";
import {
  type CanonicalMediaQuery,
  type MediaLibraryQuery,
  normalizedMediaQuery,
} from "../library-query.js";
import { MediaDetailsPanel } from "../MediaDetailsPanel/index.js";
import { MediaGrid } from "../MediaGrid/index.js";
import { MediaListTable } from "../MediaListTable/index.js";
import { MediaResults } from "../MediaResults/index.js";
import { MediaToolbar } from "../MediaToolbar/index.js";
import { useMediaBrowser } from "../media-browser.js";

/**
 * The `/media` library: a searched, filtered, and sorted grid or list with
 * cursor pagination, drop-zone and multi-file upload for writers (tagged
 * with the active tag filter), and a details panel. The query is owned by the caller (the route URL); every
 * change restarts at the first page.
 */
export function MediaLibrary({
  onQueryChange,
  query: rawQuery,
}: {
  readonly onQueryChange: (query: CanonicalMediaQuery) => void;
  readonly query: MediaLibraryQuery;
}) {
  const query = normalizedMediaQuery(rawQuery);
  const session = useSession();
  const canWrite = can(session, "media:write");
  const [updates, setUpdates] = useState<Readonly<Record<string, MediaMetadataDto>>>({});
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const opener = useRef<HTMLElement | null>(null);
  const uploads = useMediaUploads();
  const dropzone = useMediaDropzone({
    disabled: !canWrite,
    onFiles: (files) => uploads.add(files, { tags: query.tag }),
  });
  const { media, scope } = useMediaBrowser(query);
  const change = (next: MediaLibraryQuery) =>
    onQueryChange(normalizedMediaQuery({ ...query, ...next }));

  const items = (media.data?.pages.flatMap((page) => page.items) ?? []).map(
    (item) => updates[item.id] ?? item,
  );
  const selected =
    selectedId === undefined
      ? undefined
      : (items.find((item) => item.id === selectedId) ?? updates[selectedId]);
  const filtered = query.q !== undefined || query.type !== undefined || query.tag !== undefined;
  const empty =
    media.data !== undefined &&
    !media.isPlaceholderData &&
    items.length === 0 &&
    !media.hasNextPage;
  const open = (item: MediaMetadataDto, element: HTMLElement) => {
    opener.current = element;
    setSelectedId(item.id);
  };
  const changed = (item: MediaMetadataDto) =>
    setUpdates((current) => ({ ...current, [item.id]: item }));
  const view = query.view ?? "grid";
  const busy = media.isPlaceholderData;

  return (
    <section
      aria-labelledby="media-title"
      className={`${pageClass} relative`}
      {...(canWrite ? dropzone.getRootProps({ role: "region" }) : {})}
    >
      {canWrite && dropzone.isDragActive ? <DropOverlay /> : undefined}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 id="media-title">Media</h1>
          {canWrite ? (
            <p className="m-0 text-sm text-muted-foreground">
              {`Drop images anywhere here or choose files. ${mediaConstraintsText}`}
            </p>
          ) : undefined}
          {canWrite && query.tag !== undefined ? (
            <p className="m-0 text-sm text-muted-foreground">
              {`New uploads are tagged ${query.tag.join(", ")}.`}
            </p>
          ) : undefined}
        </div>
        {canWrite ? (
          <div>
            <input {...dropzone.getInputProps()} />
            <Button onClick={dropzone.open}>
              <Upload aria-hidden="true" />
              Upload images
            </Button>
          </div>
        ) : undefined}
      </div>
      <UploadQueue
        onClearFinished={uploads.clearFinished}
        onDismiss={uploads.dismiss}
        onRetry={uploads.retry}
        uploads={uploads.uploads}
      />
      <MediaToolbar
        onClear={() => change({ q: undefined, tag: undefined, type: undefined })}
        onSearchChange={(q) => change({ q })}
        onSortChange={(sort) => change({ sort })}
        onTagsChange={(tag) => change({ tag })}
        onTypeChange={(type) => change({ type })}
        onViewChange={(next) => change({ view: next === "list" ? "list" : undefined })}
        search={query.q ?? ""}
        sort={query.sort ?? DEFAULT_MEDIA_SORT}
        tags={query.tag ?? []}
        type={query.type}
        view={view}
      />
      {media.isPending ? <LoadingState label="Loading media" lines={4} /> : undefined}
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
              ? "Drop images here or use Upload images to add the first ones."
              : "No images have been uploaded yet."
          }
          title="No media yet"
        />
      ) : undefined}
      {empty && filtered ? (
        <EmptyState
          action={
            <Button
              onClick={() => change({ q: undefined, tag: undefined, type: undefined })}
              variant="outline"
            >
              Clear filters
            </Button>
          }
          description="No media matches the current search, type, and tag filters."
          title="No matching media"
        />
      ) : undefined}
      {media.data === undefined || (empty && media.data.pages.length === 1) ? undefined : (
        <MediaResults items={items} media={media} scope={scope}>
          {items.length === 0 ? undefined : view === "grid" ? (
            <MediaGrid busy={busy} items={items} label="Media library" onOpen={open} />
          ) : (
            <MediaListTable busy={busy} items={items} label="Media library" onOpen={open} />
          )}
        </MediaResults>
      )}
      <MediaDetailsPanel
        canWrite={canWrite}
        item={selected}
        onChanged={changed}
        onClose={() => setSelectedId(undefined)}
        returnFocus={() => opener.current?.focus()}
      />
    </section>
  );
}

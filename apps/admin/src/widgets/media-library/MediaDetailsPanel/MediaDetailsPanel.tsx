import type { MediaMetadataDto } from "@lacecms/contracts";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Copy, RotateCcw } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { EntryStatusBadge } from "../../../entities/content/index.js";
import {
  formatMediaDimensions,
  MediaStatusBadge,
  mediaTypeLabel,
} from "../../../entities/media/index.js";
import { can, useSession, useSessionRecovery } from "../../../entities/session/index.js";
import {
  DeleteMediaDialog,
  mediaDeletionDescription,
  useMediaDeletion,
} from "../../../features/delete-media/index.js";
import {
  FocalPointControl,
  MediaMetadataForm,
  MissingAltWarning,
} from "../../../features/edit-media-metadata/index.js";
import {
  adminQueryKeys,
  errorDescription,
  technicalDetails,
  useAdminClient,
} from "../../../shared/api/index.js";
import { formatAbsoluteTime, formatBytes } from "../../../shared/lib/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/Dialog/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { LoadingState } from "../../../shared/ui/LoadingState/index.js";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../../shared/ui/Sheet/index.js";
import { usageDeletion, type UsageDeletion } from "./usage-deletion.js";
import { usageLocationLabel } from "./usage-labels.js";

const sectionHeadingClass = "m-0 text-sm font-semibold";

/**
 * The side panel describing one media item: preview, descriptive metadata
 * (editable for writers), facts, where it is used, the public URL, and (for
 * writers) confirmed, usage-aware deletion. Closing with unsaved metadata asks
 * first. Focus returns to `returnFocus` because the panel opens without a trigger.
 */
export function MediaDetailsPanel({
  canWrite,
  item,
  onChanged,
  onClose,
  returnFocus,
}: {
  readonly canWrite: boolean;
  readonly item: MediaMetadataDto | undefined;
  readonly onChanged: (item: MediaMetadataDto) => void;
  readonly onClose: () => void;
  readonly returnFocus: () => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const close = () => {
    setDirty(false);
    setConfirming(false);
    onClose();
  };
  return (
    <>
      <Sheet
        onOpenChange={(open) => {
          if (open) return;
          if (dirty) setConfirming(true);
          else close();
        }}
        open={item !== undefined}
      >
        {item === undefined ? undefined : (
          <SheetContent
            className="w-full gap-0 overflow-y-auto sm:max-w-md"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              returnFocus();
            }}
            // Focus the panel itself rather than its first control.
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              (event.currentTarget as HTMLElement | null)?.focus();
            }}
            ref={content}
          >
            <MediaDetails
              canWrite={canWrite}
              item={item}
              key={item.id}
              onChanged={onChanged}
              onDirtyChange={setDirty}
            />
          </SheetContent>
        )}
      </Sheet>
      <Dialog onOpenChange={setConfirming} open={confirming}>
        <DialogContent
          onCloseAutoFocus={(event) => {
            // Keeping the edits returns to the still-open panel.
            if (item === undefined) return;
            event.preventDefault();
            content.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogDescription>
              The alt text, caption, or focal point changes of this media are not saved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Keep editing</Button>
            </DialogClose>
            <Button onClick={close} variant="destructive">
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MediaDetails({
  canWrite,
  item,
  onChanged,
  onDirtyChange,
}: {
  readonly canWrite: boolean;
  readonly item: MediaMetadataDto;
  readonly onChanged: (item: MediaMetadataDto) => void;
  readonly onDirtyChange: (dirty: boolean) => void;
}) {
  const client = useAdminClient();
  const [copyStatus, setCopyStatus] = useState<string | undefined>();
  const detail = useQuery({
    queryFn: () => client.getMedia(item.id),
    queryKey: adminQueryKeys.mediaDetail(item.id),
  });
  const retry = useMediaDeletion(onChanged);
  useSessionRecovery(detail.error ?? retry.error);
  const latest = detail.data ?? item;
  const { refetch } = detail;
  const reload = useCallback(() => void refetch(), [refetch]);
  const usage = detail.data?.usage;
  const usageCount = detail.data?.usageCount ?? item.usageCount;
  const canEditContent = can(useSession(), "content:write");

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopyStatus("URL copied.");
    } catch {
      setCopyStatus("The URL could not be copied. Copy it from the field instead.");
    }
  }

  return (
    <>
      <SheetHeader className="pr-10">
        <SheetTitle className="break-all">{item.filename}</SheetTitle>
        <SheetDescription>
          {mediaTypeLabel(item.mimeType)} · {formatBytes(item.size)}
        </SheetDescription>
      </SheetHeader>
      <div className="grid gap-5 px-4 pb-6">
        {canWrite && latest.status === "active" ? (
          <MediaMetadataForm
            latest={latest}
            onDirtyChange={onDirtyChange}
            onReload={reload}
            onSaved={onChanged}
          />
        ) : (
          <MediaDescription item={latest} />
        )}
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm [&_dd]:m-0 [&_dt]:text-muted-foreground">
          <dt>Type</dt>
          <dd>{mediaTypeLabel(item.mimeType)}</dd>
          <dt>Dimensions</dt>
          <dd className="tabular-nums">{formatMediaDimensions(item)}</dd>
          <dt>Size</dt>
          <dd className="tabular-nums">{formatBytes(item.size)}</dd>
          <dt>Uploaded by</dt>
          <dd>{item.createdBy.displayName}</dd>
          <dt>Uploaded</dt>
          <dd>
            <time dateTime={item.createdAt}>{formatAbsoluteTime(item.createdAt)}</time>
          </dd>
          <dt>Status</dt>
          <dd>
            <MediaStatusBadge status={item.status} />
          </dd>
        </dl>

        <section aria-labelledby="media-usage-heading" className="grid gap-2">
          <h2 className={sectionHeadingClass} id="media-usage-heading">
            Used in
          </h2>
          {detail.isPending ? <LoadingState label="Loading usage" lines={2} /> : undefined}
          {detail.error === null ? undefined : (
            <ErrorState
              description={errorDescription(detail.error)}
              technicalDetails={technicalDetails(detail.error)}
              title="Usage could not be loaded"
            />
          )}
          {usage !== undefined && usage.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">Not used by any entry.</p>
          ) : undefined}
          {usage === undefined || usage.length === 0 ? undefined : (
            <ul aria-label="Entries using this media" className="m-0 grid list-none gap-2 p-0">
              {usage.map((entry) => (
                <li
                  className="grid gap-1 rounded-md border border-border p-2.5 text-sm"
                  key={entry.entryId}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                      params={{ entryId: entry.entryId, modelKey: entry.modelKey }}
                      to="/content/$modelKey/$entryId"
                    >
                      {entry.title}
                    </Link>
                    <EntryStatusBadge status={entry.status} />
                    <span className="font-mono text-xs text-muted-foreground">
                      {entry.modelKey}
                    </span>
                  </div>
                  <ul className="m-0 grid list-none gap-0.5 p-0 text-xs text-muted-foreground">
                    {entry.locations.map((location, index) => (
                      <li key={`${location.source}-${index}`}>{usageLocationLabel(location)}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          {usage !== undefined && usageCount > usage.length ? (
            <p className="m-0 text-sm text-muted-foreground">
              {`Used by ${usageCount} entries; only the ${usage.length} most recently edited are shown.`}
            </p>
          ) : undefined}
        </section>

        <section aria-labelledby="media-url-heading" className="grid gap-2">
          <h2 className={sectionHeadingClass} id="media-url-heading">
            Public URL
          </h2>
          <div className="flex gap-2">
            <input
              aria-label="Public URL"
              className="min-h-8 min-w-0 flex-1 rounded-md border border-input bg-muted px-2.5 font-mono text-xs text-foreground"
              onFocus={(event) => event.currentTarget.select()}
              readOnly
              value={item.url}
            />
            <Button onClick={() => void copyUrl()} variant="outline">
              <Copy aria-hidden="true" />
              Copy URL
            </Button>
          </div>
          <p className="m-0 text-xs text-muted-foreground">
            The public URL serves the file only once published content uses it.
          </p>
          <p aria-live="polite" className="m-0 text-xs" role="status">
            {copyStatus}
          </p>
        </section>

        {canWrite && item.status !== "deleting" ? (
          <section aria-labelledby="media-delete-heading" className="grid gap-2">
            <h2 className={sectionHeadingClass} id="media-delete-heading">
              Deletion
            </h2>
            {item.status === "delete_failed" ? (
              <>
                <p className="m-0 text-sm text-muted-foreground">
                  Removing the file from storage failed. Retry to queue the removal again.
                </p>
                <Button
                  className="justify-self-start"
                  disabled={retry.isPending}
                  onClick={() => retry.mutate({ id: item.id, retry: true })}
                  variant="outline"
                >
                  <RotateCcw aria-hidden="true" />
                  Retry deletion
                </Button>
                {retry.error === null ? undefined : (
                  <p className="m-0 text-sm text-destructive" role="alert">
                    {mediaDeletionDescription(retry.error)}
                  </p>
                )}
              </>
            ) : (
              <MediaDeletionActions
                canEditContent={canEditContent}
                deletion={usageDeletion(usageCount, usage)}
                item={item}
                onChanged={onChanged}
              />
            )}
          </section>
        ) : undefined}
      </div>
    </>
  );
}

/** The deletion action of an active item, or why it is unavailable. */
function MediaDeletionActions({
  canEditContent,
  deletion,
  item,
  onChanged,
}: {
  readonly canEditContent: boolean;
  readonly deletion: UsageDeletion;
  readonly item: MediaMetadataDto;
  readonly onChanged: (item: MediaMetadataDto) => void;
}) {
  const hint = "m-0 text-sm text-muted-foreground";
  const unavailable = (
    <Button className="justify-self-start" disabled variant="outline">
      Delete media
    </Button>
  );
  switch (deletion.kind) {
    case "unused":
      return (
        <div className="justify-self-start">
          <DeleteMediaDialog item={item} onChanged={onChanged} />
        </div>
      );
    case "unknown":
      return (
        <>
          <p className={hint}>Deletion is available once the usage of this media has loaded.</p>
          {unavailable}
        </>
      );
    case "published":
      return (
        <>
          <p className={hint}>
            Published versions still use this media. It can be deleted once they no longer do:
          </p>
          <ul
            aria-label="Published entries using this media"
            className="m-0 grid list-none gap-1.5 p-0 text-sm"
          >
            {deletion.entries.map(({ entry, releasedByPublishing }) => (
              <li key={entry.entryId}>
                <Link
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                  params={{ entryId: entry.entryId, modelKey: entry.modelKey }}
                  to="/content/$modelKey/$entryId"
                >
                  {entry.title}
                </Link>
                <span className="text-muted-foreground">
                  {releasedByPublishing
                    ? " — its draft no longer uses this media. Publish or unpublish the entry to release it."
                    : " — remove the media from the draft, then publish the entry."}
                </span>
              </li>
            ))}
          </ul>
          {unavailable}
        </>
      );
    case "truncated":
      return (
        <>
          <p className={hint}>
            More entries use this media than can be changed at once. Remove it from some of them
            before deleting it.
          </p>
          {unavailable}
        </>
      );
    case "drafts":
      return canEditContent ? (
        <>
          <p className={hint}>
            Only drafts use this media. Deleting it removes it from those drafts first.
          </p>
          <div className="justify-self-start">
            <DeleteMediaDialog detachFrom={deletion.entries} item={item} onChanged={onChanged} />
          </div>
        </>
      ) : (
        <>
          <p className={hint}>
            Only drafts use this media. Someone who can edit content must remove it from them first.
          </p>
          {unavailable}
        </>
      );
  }
}

/** Descriptive metadata for readers who cannot change it, or items pending deletion. */
function MediaDescription({ item }: { readonly item: MediaMetadataDto }) {
  return (
    <section aria-labelledby="media-description-heading" className="grid gap-3">
      <h2 className={sectionHeadingClass} id="media-description-heading">
        Description
      </h2>
      {item.alt === undefined ? <MissingAltWarning /> : undefined}
      <FocalPointControl
        filename={item.filename}
        mediaId={item.id}
        value={item.focalPoint ?? null}
      />
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm [&_dd]:m-0 [&_dd]:break-words [&_dd]:whitespace-pre-line [&_dt]:text-muted-foreground">
        <dt>Alt text</dt>
        <dd>{item.alt ?? "None"}</dd>
        <dt>Caption</dt>
        <dd>{item.caption ?? "None"}</dd>
      </dl>
    </section>
  );
}

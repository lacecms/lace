import type { MediaDetailDto, MediaMetadataDto } from "@lacecms/contracts";
import { useQuery } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";
import type { Ref } from "react";
import {
  formatMediaDimensions,
  MediaStatusBadge,
  MediaThumbnail,
  mediaTypeLabel,
} from "../../../entities/media/index.js";
import { useSessionRecovery } from "../../../entities/session/index.js";
import {
  AdminClientError,
  adminQueryKeys,
  errorDescription,
  useAdminClient,
} from "../../../shared/api/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { Skeleton } from "../../../shared/ui/Skeleton/index.js";

const unavailableText = {
  delete_failed: "This media is marked for deletion and cannot be published.",
  deleting: "This media is being deleted and cannot be published.",
} as const;

function facts(item: MediaMetadataDto): string {
  const dimensions = formatMediaDimensions(item);
  return dimensions === "Unknown"
    ? mediaTypeLabel(item.mimeType)
    : `${mediaTypeLabel(item.mimeType)} · ${dimensions}`;
}

/**
 * A media field's value, resolved through the single-item media read: a
 * thumbnail with filename, facts and alt text, or an explicit pending-deletion, missing,
 * or unreadable state. The stored identifier is never shown; Replace and
 * Remove stay available in every state unless the field is read-only.
 */
export function SelectedMedia({
  actionRef,
  label,
  mediaId,
  onRemove,
  onReplace,
  placeholder,
  readOnly = false,
}: {
  readonly actionRef?: Ref<HTMLButtonElement>;
  readonly label: string;
  readonly mediaId: string;
  readonly onRemove: () => void;
  readonly onReplace: () => void;
  /** The item just chosen for this field, shown while its read is pending. */
  readonly placeholder?: MediaMetadataDto | undefined;
  /** Hides Replace and Remove for view-only editors. */
  readonly readOnly?: boolean;
}) {
  const client = useAdminClient();
  const detail = useQuery<MediaDetailDto>({
    ...(placeholder?.id === mediaId ? { placeholderData: { ...placeholder, usage: [] } } : {}),
    queryFn: () => client.getMedia(mediaId),
    queryKey: adminQueryKeys.mediaDetail(mediaId),
    retry: false,
  });
  useSessionRecovery(detail.error);
  const item = detail.data;
  const missing = detail.error instanceof AdminClientError && detail.error.code === "NOT_FOUND";

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-2 text-card-foreground">
      {item === undefined ? (
        detail.isPending ? (
          <Skeleton className="size-16 shrink-0" />
        ) : (
          <span className="flex size-16 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <ImageOff aria-hidden="true" className="size-6" />
          </span>
        )
      ) : (
        <MediaThumbnail className="size-16 shrink-0 rounded-md" mediaId={item.id} />
      )}
      <div className="grid min-w-0 flex-1 gap-0.5 text-sm">
        {item === undefined ? undefined : (
          <span className="flex min-w-0 items-center gap-2">
            <strong className="truncate font-medium" title={item.filename}>
              {item.filename}
            </strong>
            {item.status === "active" ? undefined : <MediaStatusBadge status={item.status} />}
          </span>
        )}
        <p className="m-0 text-xs text-muted-foreground" role="status">
          {item === undefined
            ? detail.isPending
              ? "Loading selected media…"
              : missing
                ? "Selected media no longer exists."
                : "Selected media could not be loaded."
            : item.status === "active"
              ? facts(item)
              : unavailableText[item.status]}
        </p>
        {item?.status === "active" ? (
          <p
            className={`m-0 truncate text-xs ${item.alt === undefined ? "text-muted-foreground italic" : ""}`}
            title={item.alt}
          >
            {item.alt === undefined ? "No alt text" : `Alt text: ${item.alt}`}
          </p>
        ) : undefined}
        {item === undefined && detail.error !== null && !missing ? (
          <p className="m-0 text-xs text-destructive">{errorDescription(detail.error)}</p>
        ) : undefined}
      </div>
      <div className="flex flex-wrap gap-2">
        {item === undefined && detail.error !== null && !missing ? (
          <Button onClick={() => detail.refetch()} size="sm" variant="ghost">
            Try again
          </Button>
        ) : undefined}
        {readOnly ? undefined : (
          <>
            <Button
              aria-haspopup="dialog"
              aria-label={`Replace media for ${label}`}
              onClick={onReplace}
              ref={actionRef}
              size="sm"
              variant="outline"
            >
              Replace
            </Button>
            <Button
              aria-label={`Remove media from ${label}`}
              onClick={onRemove}
              size="sm"
              variant="ghost"
            >
              Remove
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

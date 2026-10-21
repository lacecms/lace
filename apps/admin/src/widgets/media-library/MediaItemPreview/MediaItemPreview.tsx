import { ImageOff } from "lucide-react";
import { mediaAltPair, type FieldPreviewProps } from "../../../entities/content/index.js";
import { MediaThumbnail, useMediaItem } from "../../../entities/media/index.js";
import { AdminClientError } from "../../../shared/api/index.js";
import { Skeleton } from "../../../shared/ui/Skeleton/index.js";
import { mediaFacts } from "../SelectedMedia/index.js";

const blank = (value: unknown) => typeof value !== "string" || value.trim() === "";

/**
 * The collapsed-row preview of a media leaf: a small thumbnail, the filename
 * and facts, and a "No alt" note when neither the item group's `alt` override
 * nor the media item has alt text. Unresolved media shows a placeholder and an
 * accessible state, and leaves the row's text to the generic summary.
 */
export function MediaItemPreview({ value, group, children }: FieldPreviewProps) {
  const detail = useMediaItem(typeof value === "string" ? value : undefined);
  const item = detail.data;
  if (item === undefined) {
    const missing = detail.error instanceof AdminClientError && detail.error.code === "NOT_FOUND";
    return children({
      visual: detail.isPending ? (
        <Skeleton className="size-8 shrink-0" />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
          <ImageOff aria-hidden className="size-4" />
          <span className="sr-only">
            {missing ? "Selected media no longer exists." : "Selected media could not be loaded."}
          </span>
        </span>
      ),
    });
  }
  const groupValue = group?.value as Readonly<Record<string, unknown>> | undefined;
  const altShape = group !== undefined && mediaAltPair(group.definition.fields) !== undefined;
  const noAlt = altShape && blank(groupValue?.alt) && item.alt === undefined;
  return children({
    detail: item.status === "active" ? mediaFacts(item) : "Marked for deletion",
    indicators: noAlt ? ["No alt"] : [],
    title: item.filename,
    visual:
      item.status === "active" ? (
        <MediaThumbnail className="size-8 shrink-0 rounded-sm" mediaId={item.id} />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
          <ImageOff aria-hidden className="size-4" />
          <span className="sr-only">This media is marked for deletion.</span>
        </span>
      ),
  });
}

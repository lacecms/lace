import { ImageOff } from "lucide-react";
import { useState } from "react";
import { cn } from "../../../shared/lib/index.js";
import { mediaThumbnailPath } from "../media-limits.js";

/**
 * A decorative, lazily loaded thumbnail read through the admin thumbnail
 * boundary. The surrounding control carries the filename, so a failed image
 * falls back to an icon without losing the item's name.
 */
export function MediaThumbnail({
  className,
  mediaId,
}: {
  readonly className?: string;
  readonly mediaId: string;
}) {
  const [failedId, setFailedId] = useState<string>();
  return (
    <span
      className={cn(
        "flex items-center justify-center overflow-hidden bg-muted text-muted-foreground",
        className,
      )}
    >
      {failedId === mediaId ? (
        <ImageOff aria-hidden="true" className="size-6" data-testid="thumbnail-fallback" />
      ) : (
        <img
          alt=""
          className="size-full object-cover"
          decoding="async"
          loading="lazy"
          onError={() => setFailedId(mediaId)}
          src={mediaThumbnailPath(mediaId)}
        />
      )}
    </span>
  );
}

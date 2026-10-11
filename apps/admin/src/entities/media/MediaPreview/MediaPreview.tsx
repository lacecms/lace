import { cn } from "../../../shared/lib/index.js";
import { buttonVariants } from "../../../shared/ui/Button/index.js";
import { useMediaPreview } from "../media-preview.js";

export function MediaPreview({
  className,
  filename,
  mediaId,
}: {
  readonly className?: string;
  readonly filename: string;
  readonly mediaId: string;
}) {
  const preview = useMediaPreview(mediaId);
  return (
    <div className="grid gap-2">
      {preview.state === "loading" ? (
        <span role="status">Loading preview for {filename}…</span>
      ) : undefined}
      {preview.state === "failed" ? (
        <div role="status">
          Preview unavailable for {filename}.{" "}
          <button
            className={buttonVariants({ size: "sm", variant: "outline" })}
            onClick={preview.retry}
            type="button"
          >
            Retry preview
          </button>
        </div>
      ) : (
        <img
          alt={`Preview of ${filename}`}
          className={cn("block h-auto max-h-64 max-w-full rounded-md object-contain", className)}
          onError={preview.onError}
          onLoad={preview.onLoad}
          src={preview.source}
        />
      )}
    </div>
  );
}

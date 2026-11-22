import type { RefObject } from "react";
import type { VerifiedReferenceUse } from "../../entities/content/index.js";
import { Button } from "../../shared/ui/Button/index.js";

export function ReferenceOccurrenceNotice({
  occurrence,
  banner,
  onDismiss,
  onPublish,
  busy,
}: {
  readonly occurrence: VerifiedReferenceUse;
  readonly banner: RefObject<HTMLDivElement | null>;
  readonly onDismiss: () => void;
  readonly onPublish: (() => void) | undefined;
  readonly busy: boolean;
}) {
  if (!occurrence.hidden && !occurrence.stale && !occurrence.pendingPublication) return null;
  return (
    <div
      className="grid gap-2 rounded-md border border-border bg-card p-3 text-sm"
      ref={banner}
      tabIndex={-1}
    >
      {occurrence.stale && (
        <p className="m-0" role="status">
          This location has changed. Open Where used again to find the current reference.
        </p>
      )}
      {occurrence.hidden && (
        <p className="m-0" role="status">
          The reference is hidden in the current draft. It is shown here for inspection.
        </p>
      )}
      {occurrence.pendingPublication && (
        <p className="m-0" role="status">
          The saved draft removes this published dependency. The blocker stays in place until this
          entry is republished.
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        {occurrence.pendingPublication && onPublish && (
          <Button disabled={busy} onClick={onPublish} size="sm" variant="outline">
            Review publication
          </Button>
        )}
        <Button onClick={onDismiss} size="sm" variant="ghost">
          Dismiss reference notice
        </Button>
      </div>
    </div>
  );
}

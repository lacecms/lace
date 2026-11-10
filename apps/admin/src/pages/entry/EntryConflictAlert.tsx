import { TriangleAlert } from "lucide-react";
import { Button } from "../../shared/ui/Button/index.js";

/** Revision-conflict recovery: local values stay until the writer explicitly reloads. */
export function EntryConflictAlert({
  conflict,
  copyError,
  onCopy,
  onReload,
  reloadError,
  reloading,
}: {
  readonly conflict: "publish" | "save";
  readonly copyError: string | undefined;
  readonly onCopy: () => void;
  readonly onReload: () => void;
  readonly reloadError: string | undefined;
  readonly reloading: boolean;
}) {
  return (
    <section
      aria-labelledby="conflict-title"
      className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-lg border border-destructive/50 bg-card p-4 text-sm text-card-foreground"
      role="alert"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 text-destructive" />
      <div className="grid gap-2">
        <h2 className="m-0 text-sm font-semibold text-destructive" id="conflict-title">
          Draft changed elsewhere
        </h2>
        <p className="m-0 text-muted-foreground">
          Your local {conflict} values are still available. Reloading is the only action that
          replaces them.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={reloading} onClick={onReload} size="sm">
            {reloading ? "Reloading…" : "Reload server draft"}
          </Button>
          <Button onClick={onCopy} size="sm" variant="outline">
            Copy my JSON
          </Button>
        </div>
        {copyError === undefined ? undefined : (
          <p className="m-0 text-destructive" role="alert">
            {copyError}
          </p>
        )}
        {reloadError === undefined ? undefined : (
          <p className="m-0 text-destructive" role="alert">
            {reloadError}
          </p>
        )}
      </div>
    </section>
  );
}

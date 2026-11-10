import type { ReactNode } from "react";
import { cn, saveShortcutKeys, saveShortcutLabel } from "../../shared/lib/index.js";
import { Button } from "../../shared/ui/Button/index.js";

export type SaveState =
  | { readonly kind: "dirty" }
  | { readonly kind: "failed" }
  | { readonly kind: "saved"; readonly revision: number }
  | { readonly kind: "saving" }
  | { readonly kind: "view-only" };

const indicator = {
  dirty: { dot: "bg-warning-foreground", text: "Unsaved changes" },
  failed: { dot: "bg-destructive", text: "Not saved" },
  saved: { dot: "bg-success-foreground", text: "Saved" },
  saving: { dot: "bg-muted-foreground", text: "Saving…" },
  "view-only": { dot: "bg-muted-foreground", text: "View only" },
} as const;

/**
 * The editor's header actions: the save-state indicator, Save (bound to the
 * draft form and the save shortcut), and an optional publish control.
 */
export function EntryEditorActions({
  form,
  publish,
  saveDisabled,
  state,
}: {
  readonly form: string;
  readonly publish?: ReactNode;
  readonly saveDisabled: boolean;
  readonly state: SaveState;
}) {
  const { dot, text } = indicator[state.kind];
  return (
    <>
      <p className="m-0 flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
        <span aria-hidden="true" className={cn("size-2 rounded-full", dot)} />
        {state.kind === "saved" ? `Saved revision ${state.revision}` : text}
      </p>
      {state.kind === "view-only" ? undefined : (
        <Button
          aria-keyshortcuts={saveShortcutKeys}
          aria-label="Save draft"
          disabled={saveDisabled}
          form={form}
          type="submit"
          variant="outline"
        >
          {state.kind === "saving" ? "Saving…" : "Save"}
          <kbd
            aria-hidden="true"
            className="hidden rounded-sm border border-border bg-muted px-1 font-sans text-xs text-muted-foreground sm:inline"
          >
            {saveShortcutLabel()}
          </kbd>
        </Button>
      )}
      {publish}
    </>
  );
}

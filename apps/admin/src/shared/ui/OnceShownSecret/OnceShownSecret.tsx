import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "../Button/index.js";
import { DialogClose, DialogFooter } from "../Dialog/index.js";

type CopyState = "copied" | "failed" | "idle";

/**
 * The body of a dialog step that shows a secret exactly once: the value, a
 * Copy action with announced feedback, the reminder that it cannot be shown
 * again, and Done. The caller keeps the value only in its own transient state.
 */
export function OnceShownSecret({
  name,
  value,
  valueTestId,
}: {
  /** What the secret is, in lower case, e.g. "token" or "link". */
  readonly name: string;
  readonly value: string;
  readonly valueTestId?: string;
}) {
  const [copy, setCopy] = useState<CopyState>("idle");
  return (
    <>
      <code
        className="block rounded-md border border-border bg-muted p-3 font-mono text-xs wrap-anywhere select-all"
        data-testid={valueTestId}
      >
        {value}
      </code>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          // The step replaces the control that had focus, so focus moves to its main action.
          autoFocus
          onClick={() => {
            void navigator.clipboard
              .writeText(value)
              .then(() => setCopy("copied"))
              .catch(() => setCopy("failed"));
          }}
          variant="outline"
        >
          {copy === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {`Copy ${name}`}
        </Button>
        <p aria-live="polite" className="m-0 text-xs text-muted-foreground" role="status">
          {copy === "copied"
            ? "Copied to the clipboard."
            : copy === "failed"
              ? `Copy failed. Select the ${name} text and copy it manually.`
              : ""}
        </p>
      </div>
      <p className="m-0 text-sm text-muted-foreground">
        {`This ${name} cannot be shown again after you close this dialog.`}
      </p>
      <DialogFooter>
        <DialogClose asChild>
          <Button>Done</Button>
        </DialogClose>
      </DialogFooter>
    </>
  );
}

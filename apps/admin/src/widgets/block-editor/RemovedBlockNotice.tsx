import { Undo2Icon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "../../shared/ui/Button/index.js";

/**
 * Stands in for a just-removed block. Undo is focused on arrival so keyboard
 * users can restore the block at once.
 */
export function RemovedBlockNotice({
  label,
  onDismiss,
  onUndo,
}: {
  readonly label: string;
  readonly onDismiss: () => void;
  readonly onUndo: () => void;
}) {
  const undo = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    undo.current?.focus();
  }, []);
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
      role="status"
    >
      <span className="min-w-0 flex-1">Removed {label} block.</span>
      <Button onClick={onUndo} ref={undo} size="sm" variant="outline">
        <Undo2Icon aria-hidden />
        Undo
      </Button>
      <Button aria-label="Dismiss" onClick={onDismiss} size="icon-sm" variant="ghost">
        <XIcon aria-hidden />
      </Button>
    </div>
  );
}

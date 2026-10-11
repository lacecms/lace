import type { AdminContentEntryDto } from "@lacecms/contracts";
import { useMutation } from "@tanstack/react-query";
import type { RefObject } from "react";
import { errorDescription, technicalDetails, useAdminClient } from "../../../shared/api/index.js";
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

/**
 * Confirms replacing the draft with the published version and lists what is
 * lost. Saved draft changes are reverted by the API; when only the form has
 * unsaved changes, confirming discards them locally without a request.
 */
export function RevertEntryDialog({
  entryId,
  expectedRevision,
  onDiscardUnsaved,
  onOpenChange,
  onReverted,
  open,
  returnFocus,
  savedChanges,
  unsavedChanges,
}: {
  readonly entryId: string;
  readonly expectedRevision: number;
  readonly onDiscardUnsaved: () => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly onReverted: (entry: AdminContentEntryDto) => void;
  readonly open: boolean;
  readonly returnFocus?: RefObject<HTMLElement | null>;
  readonly savedChanges: boolean;
  readonly unsavedChanges: boolean;
}) {
  const client = useAdminClient();
  const revert = useMutation({
    mutationFn: () => client.revertEntry(entryId, expectedRevision),
    onSuccess: (entry) => {
      onOpenChange(false);
      onReverted(entry);
    },
  });
  const losses = [
    ...(savedChanges ? ["The saved draft changes since the last publication"] : []),
    ...(unsavedChanges ? ["Your unsaved changes"] : []),
  ];
  return (
    <Dialog
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) revert.reset();
      }}
      open={open}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus?.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Revert to published?</DialogTitle>
          <DialogDescription>
            The draft is replaced with the published version. The public site does not change.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1 text-sm">
          <p className="m-0 font-medium">This discards:</p>
          <ul className="m-0 grid gap-1 pl-5">
            {losses.map((loss) => (
              <li key={loss}>{loss}</li>
            ))}
          </ul>
        </div>
        {revert.error === null ? undefined : (
          <ErrorState
            description={errorDescription(revert.error)}
            technicalDetails={technicalDetails(revert.error)}
          />
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={revert.isPending}
            onClick={() => {
              if (savedChanges) {
                revert.mutate();
                return;
              }
              onOpenChange(false);
              onDiscardUnsaved();
            }}
            variant="destructive"
          >
            {revert.isPending ? "Reverting…" : "Revert to published"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

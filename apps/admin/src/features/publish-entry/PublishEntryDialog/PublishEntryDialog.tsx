import { Send } from "lucide-react";
import { Button } from "../../../shared/ui/Button/index.js";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../shared/ui/Dialog/index.js";

/**
 * Asks the administrator to confirm publishing the current draft. With unsaved
 * changes the action becomes "Save and publish": the caller saves first and
 * publishes the saved revision.
 */
export function PublishEntryDialog({
  disabled,
  onConfirm,
  onOpenChange,
  open,
  pending,
  publicPath,
  revision,
  unsavedChanges = false,
}: {
  readonly disabled: boolean;
  readonly onConfirm: () => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly pending: boolean;
  readonly publicPath?: string | undefined;
  readonly revision?: number | undefined;
  readonly unsavedChanges?: boolean;
}) {
  const target = publicPath === undefined ? "" : ` at ${publicPath}`;
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <Send aria-hidden="true" />
          {unsavedChanges ? "Save and publish" : "Publish"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {unsavedChanges ? "Save and publish this entry?" : "Publish this entry?"}
          </DialogTitle>
          <DialogDescription>
            {unsavedChanges
              ? `Your unsaved changes are saved as a new draft revision, which then becomes the public version${target}. If the draft cannot be saved, nothing is published.`
              : `${revision === undefined ? "The current draft" : `Draft revision ${revision}`} becomes the public version${target}. A later draft save will not change it.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled={pending} onClick={onConfirm}>
            {pending ? "Publishing…" : unsavedChanges ? "Save and publish" : "Confirm publication"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

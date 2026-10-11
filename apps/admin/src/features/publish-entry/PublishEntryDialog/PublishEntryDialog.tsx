import type { ContentModelDto } from "@lacecms/contracts";
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
 * publishes the saved revision. A global is site content without a path that
 * every page may show, so its confirmation names that reach instead.
 */
export function PublishEntryDialog({
  disabled,
  kind,
  onConfirm,
  onOpenChange,
  open,
  pending,
  publicPath,
  revision,
  unsavedChanges = false,
}: {
  readonly disabled: boolean;
  readonly kind?: ContentModelDto["kind"] | undefined;
  readonly onConfirm: () => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly pending: boolean;
  readonly publicPath?: string | undefined;
  readonly revision?: number | undefined;
  readonly unsavedChanges?: boolean;
}) {
  const global = kind === "global";
  const subject = global ? "this site content" : "this entry";
  const target = global || publicPath === undefined ? "" : ` at ${publicPath}`;
  const reach = global ? " It affects every page that shows it after the next site build." : "";
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
            {unsavedChanges ? `Save and publish ${subject}?` : `Publish ${subject}?`}
          </DialogTitle>
          <DialogDescription>
            {unsavedChanges
              ? `Your unsaved changes are saved as a new draft revision, which then becomes the public version${target}.${reach} If the draft cannot be saved, nothing is published.`
              : `${revision === undefined ? "The current draft" : `Draft revision ${revision}`} becomes the public version${target}.${reach} A later draft save will not change it.`}
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

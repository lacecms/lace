import type { MediaMetadataDto, MediaUsageEntryDto } from "@lacecms/contracts";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { technicalDetails } from "../../../shared/api/index.js";
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
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { mediaDeletionDescription, useMediaDeletion } from "../useMediaDeletion.js";

/**
 * Requests deletion of one active media item after explicit confirmation.
 * With `detachFrom`, the confirmation names the entries whose drafts lose the
 * item and the request detaches it from them first. The accepted item (now
 * `deleting`) is reported through `onChanged`; a refusal keeps the dialog open
 * with an explanation.
 */
export function DeleteMediaDialog({
  detachFrom,
  item,
  onChanged,
}: {
  readonly detachFrom?: readonly MediaUsageEntryDto[];
  readonly item: MediaMetadataDto;
  readonly onChanged: (item: MediaMetadataDto) => void;
}) {
  const detaching = detachFrom !== undefined && detachFrom.length > 0;
  const [open, setOpen] = useState(false);
  const deletion = useMediaDeletion((changed) => {
    setOpen(false);
    onChanged(changed);
  });
  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) deletion.reset();
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Trash2 aria-hidden="true" />
          Delete media
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Delete ${item.filename}?`}</DialogTitle>
          <DialogDescription>
            {detaching
              ? "The media is first removed from the drafts of the entries below; published versions are not changed. "
              : ""}
            The file is removed from storage in the background. It stays listed as pending deletion
            until removal completes, and a failed removal can be retried.
          </DialogDescription>
        </DialogHeader>
        {detaching ? (
          <div className="grid gap-2 text-sm">
            <ul aria-label="Drafts that lose this media" className="m-0 grid list-disc gap-1 pl-5">
              {detachFrom.map((entry) => (
                <li key={entry.entryId}>{entry.title}</li>
              ))}
            </ul>
            <p className="m-0 text-muted-foreground">
              A required field left empty blocks publishing that entry until a new value is chosen.
              Anyone editing one of these entries now has to reload it before saving.
            </p>
          </div>
        ) : undefined}
        {deletion.error === null ? undefined : (
          <ErrorState
            description={mediaDeletionDescription(deletion.error, { detached: detaching })}
            technicalDetails={technicalDetails(deletion.error)}
          />
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={deletion.isPending}
            onClick={() =>
              deletion.mutate({
                ...(detaching ? { detachFrom } : {}),
                id: item.id,
                retry: false,
              })
            }
            variant="destructive"
          >
            {deletion.isPending
              ? "Deleting…"
              : detaching
                ? "Remove from drafts and delete"
                : "Delete media"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

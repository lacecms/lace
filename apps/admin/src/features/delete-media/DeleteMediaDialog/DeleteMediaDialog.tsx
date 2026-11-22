import type { MediaMetadataDto, MediaUsageEntryDto } from "@lacecms/contracts";
import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { can, useSession, useSessionRecovery } from "../../../entities/session/index.js";
import {
  checkpointKey,
  clearCheckpoint,
  readCheckpoint,
  type Checkpoint,
} from "../detach-checkpoint.js";
import { AdminClientError, technicalDetails } from "../../../shared/api/index.js";
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
  disabled = false,
  item,
  onChanged,
}: {
  readonly disabled?: boolean;
  readonly detachFrom?: readonly MediaUsageEntryDto[];
  readonly item: MediaMetadataDto;
  readonly onChanged: (item: MediaMetadataDto) => void;
}) {
  const session = useSession();
  const key = checkpointKey(session.id, item.id);
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<Checkpoint | null>(null);
  const [attempted, setAttempted] = useState(false);
  const running = useRef<AbortController | null>(null);
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = (event: StorageEvent) => {
      if (event.key === null || event.key === key) refresh((v) => v + 1);
    };
    window.addEventListener("storage", update);
    return () => {
      running.current?.abort();
      window.removeEventListener("storage", update);
    };
  }, [key]);
  const saved = can(session, "content:write") ? readCheckpoint(key) : null;
  const deletion = useMediaDeletion((changed) => {
    setOpen(false);
    onChanged(changed);
  });
  useSessionRecovery(deletion.error);
  const detaching = !!detachFrom?.length;
  const shown = deletion.isPending ? progress : saved;
  const denied =
    deletion.error instanceof AdminClientError && [401, 403].includes(deletion.error.status ?? 0);
  function submit() {
    const controller = new AbortController();
    running.current = controller;
    setAttempted(saved !== null);
    setProgress(saved);
    deletion.mutate({
      id: item.id,
      retry: false,
      ...(detaching || saved
        ? {
            detach: {
              key,
              confirmed: detachFrom ?? [],
              resume: saved,
              active: () => !controller.signal.aborted,
              progress: setProgress,
              attempt: () => setAttempted(true),
            },
          }
        : {}),
    });
  }
  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          running.current?.abort();
          deletion.reset();
          setProgress(null);
          setAttempted(false);
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Trash2 aria-hidden="true" />
          {saved ? "Continue deletion" : "Delete media"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Delete ${item.filename}?`}</DialogTitle>
          <DialogDescription>
            {detaching && !shown
              ? "The media is first removed from the drafts of the entries below; published versions are not changed. "
              : ""}
            The file is removed from storage in the background. It stays listed as pending deletion
            until removal completes, and a failed removal can be retried.
          </DialogDescription>
        </DialogHeader>
        {detaching && !shown ? (
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
        {shown && (
          <p role="status" aria-live="polite">
            {shown.next} of {shown.drafts.length} drafts completed.
          </p>
        )}
        {deletion.error === null ? undefined : (
          <ErrorState
            description={mediaDeletionDescription(deletion.error, { detached: attempted })}
            technicalDetails={technicalDetails(deletion.error)}
          />
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{deletion.isPending && shown ? "Pause" : "Cancel"}</Button>
          </DialogClose>
          {saved && !deletion.isPending && (
            <Button
              variant="outline"
              onClick={() => {
                clearCheckpoint(key, saved.token);
                deletion.reset();
                setOpen(false);
              }}
            >
              Review current usage
            </Button>
          )}
          <Button
            disabled={disabled || deletion.isPending || denied}
            onClick={submit}
            variant="destructive"
          >
            {deletion.isPending
              ? "Deleting…"
              : saved
                ? "Continue"
                : detaching
                  ? "Remove from drafts and delete"
                  : "Delete media"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

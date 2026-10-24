import {
  useLinkImpactReview,
  LinkImpactReview,
  isLinkImpactChanged,
} from "../../../entities/content/index.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type RefObject, useRef, useState } from "react";
import {
  adminQueryKeys,
  errorDescription,
  technicalDetails,
  useAdminClient,
} from "../../../shared/api/index.js";
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
import { TextField } from "../../../shared/ui/TextField/index.js";
import { toast } from "../../../shared/ui/Toaster/index.js";

/**
 * Deletes one entry after explicit confirmation. A published entry also needs
 * its saved title typed, because the page leaves the site. The dialog is
 * controlled and has no trigger: menus open it. A cancelled dialog returns
 * focus to `returnFocus`; after a deletion the trigger's context is gone, so
 * focus is left to `onDeleted`.
 */
export function DeleteEntryDialog({
  entryId,
  expectedRevision,
  modelKey,
  onDeleted,
  onOpenChange,
  open,
  published,
  returnFocus,
  title,
}: {
  readonly entryId: string;
  readonly expectedRevision: number;
  readonly modelKey: string;
  readonly onDeleted?: () => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly published: boolean;
  readonly returnFocus?: RefObject<HTMLElement | null>;
  readonly title: string;
}) {
  const client = useAdminClient();
  const queryClient = useQueryClient();
  const impact = useLinkImpactReview(entryId, "delete", open);
  const [typed, setTyped] = useState("");
  const deleted = useRef(false);
  const remove = useMutation({
    mutationFn: () => client.deleteEntry(entryId, expectedRevision, impact.acknowledgment),
    onError: (error) => {
      if (isLinkImpactChanged(error)) impact.refresh();
    },
    onSuccess: async () => {
      deleted.current = true;
      setTyped("");
      onOpenChange(false);
      toast.success(`Deleted “${title}”.`);
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.modelEntries(modelKey) });
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.models });
    },
  });
  const confirmed = impact.ready && (!published || typed.trim() === title);
  return (
    <Dialog
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          remove.reset();
          setTyped("");
        }
      }}
      open={open}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (deleted.current) {
            deleted.current = false;
            onDeleted?.();
            return;
          }
          returnFocus?.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Delete entry?</DialogTitle>
          <DialogDescription>
            {published
              ? `“${title}” will be permanently deleted and its page disappears from the site after the next build. This cannot be undone.`
              : `“${title}” will be permanently deleted. This cannot be undone.`}
          </DialogDescription>
        </DialogHeader>
        <LinkImpactReview review={impact} />
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (confirmed && !remove.isPending) remove.mutate();
          }}
        >
          {published ? (
            <TextField
              autoComplete="off"
              label={`Type “${title}” to confirm`}
              onChange={(event) => setTyped(event.currentTarget.value)}
              spellCheck={false}
              value={typed}
            />
          ) : undefined}
          {remove.error === null ? undefined : (
            <ErrorState
              description={errorDescription(remove.error)}
              technicalDetails={technicalDetails(remove.error)}
            />
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button disabled={!confirmed || remove.isPending} type="submit" variant="destructive">
              {remove.isPending ? "Deleting…" : "Delete entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

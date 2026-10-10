import type { AccountSessionDto } from "@lacecms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
  DialogTrigger,
} from "../../../shared/ui/Dialog/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { toast } from "../../../shared/ui/Toaster/index.js";
import { sessionLabel } from "../session-label.js";

/** Signs out one of the user's other sessions after confirmation. */
export function EndSessionDialog({
  lastActive,
  session,
}: {
  readonly lastActive: string;
  readonly session: AccountSessionDto;
}) {
  const client = useAdminClient();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const label = sessionLabel(session);
  const end = useMutation({
    mutationFn: () => client.deleteSession(session.id),
    onSuccess: async () => {
      setOpen(false);
      toast.success(`Signed out ${label}.`);
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.accountSessions });
    },
  });
  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        end.reset();
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button
          aria-label={`Sign out ${label}, last active ${lastActive}`}
          size="sm"
          variant="outline"
        >
          Sign out
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign out this session?</DialogTitle>
          <DialogDescription>
            {`${label}, last active ${lastActive}, will be signed out and must sign in again.`}
          </DialogDescription>
        </DialogHeader>
        {end.error === null ? undefined : (
          <ErrorState
            description={errorDescription(end.error)}
            technicalDetails={technicalDetails(end.error)}
            title="Session not signed out"
          />
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled={end.isPending} onClick={() => end.mutate()} variant="destructive">
            {end.isPending ? "Signing out…" : "Sign out session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

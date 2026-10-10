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

function otherSessions(revoked: number): string {
  return revoked === 1 ? "1 other session" : `${revoked} other sessions`;
}

/** Signs out every session of the user except this one, after confirmation. */
export function EndOtherSessionsDialog() {
  const client = useAdminClient();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const end = useMutation({
    mutationFn: client.revokeOtherSessions,
    onSuccess: async ({ revoked }) => {
      setOpen(false);
      toast.success(`Signed out ${otherSessions(revoked)}.`);
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
        <Button variant="outline">Sign out all other sessions</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign out all other sessions?</DialogTitle>
          <DialogDescription>
            Every other browser and device signed in to your account will be signed out. This device
            stays signed in.
          </DialogDescription>
        </DialogHeader>
        {end.error === null ? undefined : (
          <ErrorState
            description={errorDescription(end.error)}
            technicalDetails={technicalDetails(end.error)}
            title="Sessions not signed out"
          />
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled={end.isPending} onClick={() => end.mutate()} variant="destructive">
            {end.isPending ? "Signing out…" : "Sign out other sessions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

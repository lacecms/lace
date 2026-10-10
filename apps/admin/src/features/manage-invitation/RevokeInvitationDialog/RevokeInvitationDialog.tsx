import type { InvitationDto } from "@lacecms/contracts";
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

/** Revokes an unaccepted invitation after confirmation; its link stops working. */
export function RevokeInvitationDialog({ invitation }: { readonly invitation: InvitationDto }) {
  const client = useAdminClient();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const revoke = useMutation({
    mutationFn: () => client.revokeInvitation(invitation.id),
    onSuccess: async () => {
      setOpen(false);
      toast.success(`Revoked the invitation for ${invitation.email}.`);
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.invitations });
    },
  });
  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        revoke.reset();
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button
          aria-label={`Revoke invitation for ${invitation.email}`}
          size="sm"
          variant="outline"
        >
          Revoke
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke invitation?</DialogTitle>
          <DialogDescription>
            {`The invitation link sent to ${invitation.email} will stop working. You can invite the address again later.`}
          </DialogDescription>
        </DialogHeader>
        {revoke.error === null ? undefined : (
          <ErrorState
            description={errorDescription(revoke.error)}
            technicalDetails={technicalDetails(revoke.error)}
            title="Invitation not revoked"
          />
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled={revoke.isPending} onClick={() => revoke.mutate()} variant="destructive">
            {revoke.isPending ? "Revoking…" : "Revoke invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

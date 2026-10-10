import type { ManagedUserDto } from "@lacecms/contracts";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
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
  DialogTrigger,
} from "../../../shared/ui/Dialog/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { toast } from "../../../shared/ui/Toaster/index.js";

function sessionCount(revoked: number): string {
  return revoked === 1 ? "1 session" : `${revoked} sessions`;
}

/** Ends every session of another account after confirmation and reports how many ended. */
export function SignOutUserDialog({ account }: { readonly account: ManagedUserDto }) {
  const client = useAdminClient();
  const [open, setOpen] = useState(false);
  const signOut = useMutation({
    mutationFn: () => client.signOutUser(account.id),
    onSuccess: ({ revoked }) => {
      setOpen(false);
      toast.success(`Signed out ${account.email} everywhere. Ended ${sessionCount(revoked)}.`);
    },
  });
  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        signOut.reset();
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button aria-label={`Sign out ${account.email} everywhere`} size="sm" variant="outline">
          Sign out everywhere
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign out everywhere?</DialogTitle>
          <DialogDescription>
            {`${account.email} will be signed out on every device and must sign in again. Their password and role do not change.`}
          </DialogDescription>
        </DialogHeader>
        {signOut.error === null ? undefined : (
          <ErrorState
            description={errorDescription(signOut.error)}
            technicalDetails={technicalDetails(signOut.error)}
            title="Sessions not ended"
          />
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={signOut.isPending}
            onClick={() => signOut.mutate()}
            variant="destructive"
          >
            {signOut.isPending ? "Signing out…" : "Sign out everywhere"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

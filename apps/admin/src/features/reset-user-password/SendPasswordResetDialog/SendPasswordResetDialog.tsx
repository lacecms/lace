import type { EmailFailureReasonDto, ManagedUserDto } from "@lacecms/contracts";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { UndeliveredLink } from "../../../entities/email-delivery/index.js";
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

interface Undelivered {
  readonly link: string;
  readonly reason: EmailFailureReasonDto;
}

/**
 * Sends another user a password reset link after confirmation. When the email
 * is not sent, the link is shown once and lives only in this component's state.
 */
export function SendPasswordResetDialog({ account }: { readonly account: ManagedUserDto }) {
  const client = useAdminClient();
  const [open, setOpen] = useState(false);
  const [undelivered, setUndelivered] = useState<Undelivered>();
  const send = useMutation({
    // The link goes straight to component state; the mutation result never holds it.
    mutationFn: async () => {
      const result = await client.sendPasswordReset(account.id);
      if (result.delivery.status === "sent" || result.link === undefined) return true;
      setUndelivered({ link: result.link, reason: result.delivery.reason });
      return false;
    },
    onSuccess: (sent) => {
      if (!sent) return;
      changeOpen(false);
      toast.success(`Password reset email sent to ${account.email}.`);
    },
  });
  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setUndelivered(undefined);
      send.reset();
    }
  }
  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogTrigger asChild>
        <Button aria-label={`Send password reset to ${account.email}`} size="sm" variant="outline">
          Send password reset
        </Button>
      </DialogTrigger>
      <DialogContent
        onInteractOutside={(event) => {
          if (undelivered !== undefined) event.preventDefault();
        }}
      >
        {undelivered === undefined ? (
          <>
            <DialogHeader>
              <DialogTitle>Send password reset?</DialogTitle>
              <DialogDescription>
                {`${account.email} will get a link to choose a new password. The link expires after one hour, and their current password keeps working until they use it.`}
              </DialogDescription>
            </DialogHeader>
            {send.error === null ? undefined : (
              <ErrorState
                description={errorDescription(send.error)}
                technicalDetails={technicalDetails(send.error)}
                title="Password reset not sent"
              />
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button disabled={send.isPending} onClick={() => send.mutate()}>
                {send.isPending ? "Sending…" : "Send reset link"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Share the reset link</DialogTitle>
              <DialogDescription>
                {`A password reset link for ${account.email} was created, but its email was not sent. The link expires after one hour.`}
              </DialogDescription>
            </DialogHeader>
            <UndeliveredLink
              link={undelivered.link}
              reason={undelivered.reason}
              recipient={account.email}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

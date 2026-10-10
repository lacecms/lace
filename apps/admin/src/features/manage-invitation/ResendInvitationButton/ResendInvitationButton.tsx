import type { EmailFailureReasonDto, InvitationDto } from "@lacecms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { UndeliveredLink } from "../../../entities/email-delivery/index.js";
import { useSessionRecovery } from "../../../entities/session/index.js";
import { adminQueryKeys, errorDescription, useAdminClient } from "../../../shared/api/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/Dialog/index.js";
import { toast } from "../../../shared/ui/Toaster/index.js";

interface Undelivered {
  readonly link: string;
  readonly reason: EmailFailureReasonDto;
}

/**
 * Resends an invitation with a new link and a fresh expiry, which invalidates
 * the previous link. A sent email is announced; otherwise the new link is
 * shown once in a dialog and lives only in this component's state.
 */
export function ResendInvitationButton({ invitation }: { readonly invitation: InvitationDto }) {
  const client = useAdminClient();
  const queryClient = useQueryClient();
  const opener = useRef<HTMLButtonElement>(null);
  const [undelivered, setUndelivered] = useState<Undelivered>();
  const resend = useMutation({
    // The link goes straight to component state; the mutation result never holds it.
    mutationFn: async () => {
      const result = await client.resendInvitation(invitation.id);
      if (result.delivery.status === "sent" || result.link === undefined) return true;
      setUndelivered({ link: result.link, reason: result.delivery.reason });
      return false;
    },
    onError: (error) => {
      toast.error(`Invitation to ${invitation.email} not resent. ${errorDescription(error)}`);
    },
    onSuccess: async (sent) => {
      if (sent) toast.success(`Invitation resent to ${invitation.email}.`);
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.invitations });
    },
  });
  useSessionRecovery(resend.error);
  return (
    <>
      <Button
        aria-label={`Resend invitation to ${invitation.email}`}
        disabled={resend.isPending}
        onClick={() => resend.mutate()}
        ref={opener}
        size="sm"
        variant="outline"
      >
        {resend.isPending ? "Resending…" : "Resend"}
      </Button>
      <Dialog
        onOpenChange={(next) => {
          if (!next) setUndelivered(undefined);
        }}
        open={undelivered !== undefined}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Share the invitation link</DialogTitle>
            <DialogDescription>
              {`A new invitation link for ${invitation.email} was created and the previous link no longer works, but the email was not sent.`}
            </DialogDescription>
          </DialogHeader>
          {undelivered === undefined ? undefined : (
            <UndeliveredLink
              link={undelivered.link}
              reason={undelivered.reason}
              recipient={invitation.email}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

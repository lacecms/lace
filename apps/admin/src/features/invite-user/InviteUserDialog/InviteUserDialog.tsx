import type { EmailFailureReasonDto } from "@lacecms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { UndeliveredLink } from "../../../entities/email-delivery/index.js";
import { RoleSelect, type AdminRole } from "../../../entities/session/index.js";
import {
  AdminClientError,
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
import { TextField } from "../../../shared/ui/TextField/index.js";
import { toast } from "../../../shared/ui/Toaster/index.js";

interface Undelivered {
  readonly email: string;
  readonly link: string;
  readonly reason: EmailFailureReasonDto;
}

function invitationErrorDescription(error: unknown): string {
  return error instanceof AdminClientError && error.code === "CONFLICT"
    ? "This address already has an account or a pending invitation."
    : errorDescription(error);
}

/**
 * Invites an email address with a role; the invitee chooses their own
 * password. When the email is not sent, the accept link is shown once and
 * lives only in this component's state, never in the query or mutation cache.
 */
export function InviteUserDialog() {
  const client = useAdminClient();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("viewer");
  const [undelivered, setUndelivered] = useState<Undelivered>();
  const invite = useMutation({
    // The link goes straight to component state; the mutation result never holds it.
    mutationFn: async () => {
      const result = await client.createInvitation({ email: email.trim(), role });
      if (result.delivery.status === "sent" || result.link === undefined)
        return { sentTo: result.invitation.email };
      setUndelivered({
        email: result.invitation.email,
        link: result.link,
        reason: result.delivery.reason,
      });
      return undefined;
    },
    onSuccess: async (sent) => {
      if (sent !== undefined) {
        changeOpen(false);
        toast.success(`Invitation sent to ${sent.sentTo}.`);
      }
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.invitations });
    },
  });
  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setEmail("");
      setRole("viewer");
      setUndelivered(undefined);
      invite.reset();
    }
  }
  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus aria-hidden="true" />
          Invite user
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
              <DialogTitle>Invite user</DialogTitle>
              <DialogDescription>
                Lace emails an invitation link. The invited person chooses their own password, and
                the link expires after 72 hours.
              </DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                invite.mutate();
              }}
            >
              <TextField
                autoComplete="off"
                label="Email"
                maxLength={320}
                onChange={(event) => setEmail(event.currentTarget.value)}
                required
                type="email"
                value={email}
              />
              <RoleSelect disabled={invite.isPending} onValueChange={setRole} value={role} />
              {invite.error === null ? undefined : (
                <ErrorState
                  description={invitationErrorDescription(invite.error)}
                  technicalDetails={technicalDetails(invite.error)}
                  title="Invitation not sent"
                />
              )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button disabled={invite.isPending} type="submit">
                  {invite.isPending ? "Inviting…" : "Send invitation"}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Share the invitation link</DialogTitle>
              <DialogDescription>
                {`The invitation for ${undelivered.email} was created, but its email was not sent.`}
              </DialogDescription>
            </DialogHeader>
            <UndeliveredLink
              link={undelivered.link}
              reason={undelivered.reason}
              recipient={undelivered.email}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

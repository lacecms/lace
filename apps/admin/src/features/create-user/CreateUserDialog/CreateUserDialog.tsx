import type { EmailFailureReasonDto } from "@lacecms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { UndeliveredLink } from "../../../entities/email-delivery/index.js";
import { RoleSelect, useSessionRecovery, type AdminRole } from "../../../entities/session/index.js";
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

interface FirstPasswordLink {
  readonly email: string;
  readonly link: string;
  readonly reason: EmailFailureReasonDto;
}

export function CreateUserDialog() {
  const client = useAdminClient();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("viewer");
  const [handoff, setHandoff] = useState<FirstPasswordLink>();
  const create = useMutation({
    mutationFn: async () => {
      const result = await client.createUser({ email: email.trim(), role });
      // Keep the link in the dialog, outside the mutation cache.
      if (result.delivery.status === "failed" && result.link !== undefined) {
        setHandoff({ email: result.user.email, link: result.link, reason: result.delivery.reason });
      }
      return { email: result.user.email, sent: result.delivery.status === "sent" };
    },
    onSuccess: (result) => {
      if (result.sent) {
        changeOpen(false);
        toast.success(`Created ${result.email} and sent the access email.`);
      }
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.users });
    },
  });
  useSessionRecovery(create.error);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setEmail("");
      setRole("viewer");
      setHandoff(undefined);
      create.reset();
    }
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        if (next || !create.isPending) changeOpen(next);
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Create user</Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={!create.isPending}
        onInteractOutside={(event) => {
          if (create.isPending || handoff !== undefined) event.preventDefault();
        }}
      >
        {handoff === undefined ? (
          <>
            <DialogHeader>
              <DialogTitle>Create user</DialogTitle>
              <DialogDescription>
                The account is active immediately. The user sets their own password before signing
                in.
              </DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!create.isPending) create.mutate();
              }}
            >
              <TextField
                autoComplete="off"
                disabled={create.isPending}
                label="Email"
                maxLength={320}
                onChange={(event) => setEmail(event.currentTarget.value)}
                required
                type="email"
                value={email}
              />
              <RoleSelect disabled={create.isPending} onValueChange={setRole} value={role} />
              {create.error === null ? undefined : (
                <ErrorState
                  description={
                    create.error instanceof AdminClientError && create.error.code === "CONFLICT"
                      ? "This address already has an account or a pending invitation."
                      : errorDescription(create.error)
                  }
                  technicalDetails={technicalDetails(create.error)}
                  title="User could not be created"
                />
              )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button disabled={create.isPending} type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button disabled={create.isPending} type="submit">
                  {create.isPending ? "Creating…" : "Create user"}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Share the first-password link</DialogTitle>
              <DialogDescription>
                {`The account for ${handoff.email} is active. This link works once and expires in one hour.`}
              </DialogDescription>
            </DialogHeader>
            <UndeliveredLink
              link={handoff.link}
              reason={handoff.reason}
              recipient={handoff.email}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

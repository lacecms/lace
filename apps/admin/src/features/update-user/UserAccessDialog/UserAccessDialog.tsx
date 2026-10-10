import type { ManagedUserDto } from "@lacecms/contracts";
import { useState } from "react";
import { technicalDetails } from "../../../shared/api/index.js";
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
import { useUpdateUser, userUpdateErrorDescription } from "../useUpdateUser.js";

/** Disables an active account or enables a disabled one after confirmation. */
export function UserAccessDialog({ account }: { readonly account: ManagedUserDto }) {
  const [open, setOpen] = useState(false);
  const disabling = !account.disabled;
  const update = useUpdateUser(account, (updated) => {
    setOpen(false);
    toast.success(updated.disabled ? `Disabled ${updated.email}.` : `Enabled ${updated.email}.`);
  });
  const action = disabling ? "Disable" : "Enable";
  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        update.reset();
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button aria-label={`${action} ${account.email}`} size="sm" variant="outline">
          {action}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{disabling ? "Disable user?" : "Enable user?"}</DialogTitle>
          <DialogDescription>
            {disabling
              ? `${account.email} will be signed out on every device and will no longer be able to sign in. You can enable the account again later.`
              : `${account.email} will be able to sign in again with their existing password and role.`}
          </DialogDescription>
        </DialogHeader>
        {update.error === null ? undefined : (
          <ErrorState
            description={userUpdateErrorDescription(update.error)}
            technicalDetails={technicalDetails(update.error)}
            title={disabling ? "User not disabled" : "User not enabled"}
          />
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={update.isPending}
            onClick={() => update.mutate({ disabled: disabling })}
            variant={disabling ? "destructive" : "default"}
          >
            {update.isPending
              ? disabling
                ? "Disabling…"
                : "Enabling…"
              : disabling
                ? "Disable user"
                : "Enable user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

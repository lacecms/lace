import type { ManagedUserDto } from "@lacecms/contracts";
import { useRouter } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import {
  RoleSelect,
  roleLabel,
  useSessionSource,
  type AdminRole,
} from "../../../entities/session/index.js";
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

/**
 * Changes an active account's role after an explicit Save. Demoting the
 * signed-in administrator warns first and re-reads the session afterwards, so
 * the route guards reflect the new role.
 */
export function ChangeRoleDialog({
  account,
  isSelf,
}: {
  readonly account: ManagedUserDto;
  readonly isSelf: boolean;
}) {
  const router = useRouter();
  const sessionSource = useSessionSource();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<AdminRole>(account.role);
  const update = useUpdateUser(account, async (updated) => {
    setOpen(false);
    toast.success(`${updated.email} is now ${roleLabel(updated.role)}.`);
    // A changed own role changes server-derived permissions: re-read them.
    if (isSelf && updated.role !== account.role) {
      sessionSource.invalidate();
      await router.invalidate();
    }
  });
  const selfDemotion = isSelf && account.role === "admin" && role !== "admin";
  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        setRole(account.role);
        update.reset();
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button aria-label={`Change role for ${account.email}`} size="sm" variant="outline">
          Change role
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>{`Choose what ${account.email} can do in Lace.`}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (role !== account.role) update.mutate({ role });
          }}
        >
          <RoleSelect disabled={update.isPending} onValueChange={setRole} value={role} />
          {selfDemotion ? (
            <p
              className="m-0 flex gap-2 rounded-md bg-warning p-3 text-sm text-warning-foreground"
              role="note"
            >
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              You are changing your own role. You will lose access to Users and Settings.
            </p>
          ) : undefined}
          {update.error === null ? undefined : (
            <ErrorState
              description={userUpdateErrorDescription(update.error)}
              technicalDetails={technicalDetails(update.error)}
              title="Role not changed"
            />
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button disabled={role === account.role || update.isPending} type="submit">
              {update.isPending ? "Saving…" : "Save role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

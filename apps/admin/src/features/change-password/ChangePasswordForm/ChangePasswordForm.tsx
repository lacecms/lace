import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useSessionRecovery } from "../../../entities/session/index.js";
import {
  AdminClientError,
  adminQueryKeys,
  errorDescription,
  technicalDetails,
  useAdminClient,
} from "../../../shared/api/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { checkboxClass, fieldErrorClass, formClass } from "../../../shared/ui/layout/index.js";
import { PasswordField } from "../../../shared/ui/PasswordField/index.js";
import { toast } from "../../../shared/ui/Toaster/index.js";

/** The API's password rule, stated beside the field. */
const minimumPasswordLength = 12;

function passwordErrorDescription(error: unknown): string {
  return error instanceof AdminClientError && error.code === "INVALID_CREDENTIALS"
    ? "The current password is incorrect."
    : errorDescription(error);
}

function otherSessions(revoked: number): string {
  return revoked === 1 ? "1 other session" : `${revoked} other sessions`;
}

/**
 * Changes the signed-in user's password with the current one. Other sessions
 * are signed out by default; this session stays signed in.
 */
export function ChangePasswordForm() {
  const client = useAdminClient();
  const queryClient = useQueryClient();
  const mismatchId = useId();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [signOutOtherSessions, setSignOutOtherSessions] = useState(true);
  const [mismatch, setMismatch] = useState(false);
  const change = useMutation({
    mutationFn: () => client.changePassword({ currentPassword, newPassword, signOutOtherSessions }),
    onSuccess: async ({ revoked }) => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      toast.success(
        revoked === 0
          ? "Password changed."
          : `Password changed. Signed out ${otherSessions(revoked)}.`,
      );
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.accountSessions });
    },
  });
  useSessionRecovery(change.error);
  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault();
        const differs = newPassword !== confirmation;
        setMismatch(differs);
        if (!differs) change.mutate();
      }}
    >
      <PasswordField
        autoComplete="current-password"
        label="Current password"
        onChange={(event) => setCurrentPassword(event.currentTarget.value)}
        required
        value={currentPassword}
      />
      <PasswordField
        autoComplete="new-password"
        description={`At least ${minimumPasswordLength} characters.`}
        label="New password"
        maxLength={1024}
        minLength={minimumPasswordLength}
        onChange={(event) => setNewPassword(event.currentTarget.value)}
        required
        value={newPassword}
      />
      <div className="grid gap-1.5">
        <PasswordField
          aria-errormessage={mismatch ? mismatchId : undefined}
          aria-invalid={mismatch || undefined}
          autoComplete="new-password"
          label="Confirm new password"
          onChange={(event) => setConfirmation(event.currentTarget.value)}
          required
          value={confirmation}
        />
        {mismatch ? (
          <p className={`${fieldErrorClass} text-sm`} id={mismatchId} role="alert">
            The new passwords do not match.
          </p>
        ) : undefined}
      </div>
      <label className={`${checkboxClass} text-sm`}>
        <input
          checked={signOutOtherSessions}
          className="size-3.5 accent-primary"
          onChange={(event) => setSignOutOtherSessions(event.currentTarget.checked)}
          type="checkbox"
        />
        Sign out other sessions
      </label>
      {change.error === null ? undefined : (
        <ErrorState
          description={passwordErrorDescription(change.error)}
          technicalDetails={technicalDetails(change.error)}
          title="Password not changed"
        />
      )}
      <div>
        <Button disabled={change.isPending} type="submit">
          {change.isPending ? "Changing…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}

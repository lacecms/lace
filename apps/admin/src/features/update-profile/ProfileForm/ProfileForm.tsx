import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  useSession,
  useSessionRecovery,
  useSessionSource,
} from "../../../entities/session/index.js";
import { errorDescription, technicalDetails, useAdminClient } from "../../../shared/api/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { formClass } from "../../../shared/ui/layout/index.js";
import { TextField } from "../../../shared/ui/TextField/index.js";
import { toast } from "../../../shared/ui/Toaster/index.js";

/** The API's display-name rule: 1 to 120 characters after trimming. */
const maximumNameLength = 120;

/**
 * Changes the signed-in user's own display name. After confirmation the
 * session is read again, so the shell's user menu shows the new name.
 */
export function ProfileForm() {
  const client = useAdminClient();
  const session = useSession();
  const sessionSource = useSessionSource();
  const router = useRouter();
  const [name, setName] = useState(session.displayName ?? "");
  const trimmed = name.trim();
  const update = useMutation({
    mutationFn: () => client.updateProfile({ displayName: trimmed }),
    onSuccess: async (summary) => {
      setName(summary.user.displayName ?? trimmed);
      toast.success("Display name updated.");
      sessionSource.invalidate();
      await router.invalidate();
    },
  });
  useSessionRecovery(update.error);
  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed.length > 0) update.mutate();
      }}
    >
      <TextField
        autoComplete="name"
        label="Display name"
        maxLength={maximumNameLength}
        onChange={(event) => setName(event.currentTarget.value)}
        required
        value={name}
      />
      <TextField label="Email" readOnly type="email" value={session.email} />
      {update.error === null ? undefined : (
        <ErrorState
          description={errorDescription(update.error)}
          technicalDetails={technicalDetails(update.error)}
          title="Name not changed"
        />
      )}
      <div>
        <Button
          disabled={trimmed.length === 0 || trimmed === session.displayName || update.isPending}
          type="submit"
        >
          {update.isPending ? "Saving…" : "Save name"}
        </Button>
      </div>
    </form>
  );
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useSessionSource } from "../../../entities/session/index.js";
import {
  adminQueryKeys,
  errorDescription,
  technicalDetails,
  useAdminClient,
} from "../../../shared/api/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { TextField } from "../../../shared/ui/TextField/index.js";
import { PasswordField } from "../../../shared/ui/PasswordField/index.js";

/**
 * Signs in with email and password, then continues to the requested local
 * route. The card has one task, so the email field takes focus on open.
 */
export function SignInForm({
  redirectTo,
  mcpTransaction,
}: {
  readonly redirectTo: string;
  readonly mcpTransaction?: string | undefined;
}) {
  const client = useAdminClient();
  const sessionSource = useSessionSource();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signIn = useMutation({
    mutationFn: () => client.signIn(email, password),
    onSuccess: async () => {
      sessionSource.invalidate();
      await sessionSource.get();
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.session });
      if (mcpTransaction) {
        window.location.assign(
          `/api/auth/oauth2/authorize?transaction=${encodeURIComponent(mcpTransaction)}`,
        );
        return;
      }
      await navigate({ to: redirectTo });
    },
  });
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        signIn.mutate();
      }}
    >
      <TextField
        autoComplete="email"
        autoFocus
        label="Email"
        onChange={(event) => setEmail(event.currentTarget.value)}
        required
        type="email"
        value={email}
      />
      <PasswordField
        autoComplete="current-password"
        label="Password"
        onChange={(event) => setPassword(event.currentTarget.value)}
        required
        value={password}
      />
      {signIn.error === null ? undefined : (
        <ErrorState
          description={errorDescription(signIn.error)}
          technicalDetails={technicalDetails(signIn.error)}
          title="Could not sign in"
        />
      )}
      <Button className="w-full" disabled={signIn.isPending} size="lg" type="submit">
        {signIn.isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : undefined}
        {signIn.isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

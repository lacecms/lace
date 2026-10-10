import { accountTokenSchema } from "@lacecms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import * as v from "valibot";
import { useSessionSource } from "../../../entities/session/index.js";
import {
  AdminClientError,
  errorDescription,
  technicalDetails,
  useAdminClient,
} from "../../../shared/api/index.js";
import { readFragmentToken, removeFragment } from "../../../shared/lib/index.js";
import { AuthCard } from "../../../shared/ui/AuthCard/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { fieldErrorClass } from "../../../shared/ui/layout/index.js";
import { PasswordField } from "../../../shared/ui/PasswordField/index.js";

/** The API's password rule, stated beside the field. */
const minimumPasswordLength = 12;

const linkClass = "font-medium text-primary underline underline-offset-4";

/**
 * Chooses a new password from an emailed reset link. The token is read from
 * the URL fragment, removed from the address bar, and kept only in component
 * state: never in the query string, router state, query cache, or storage.
 */
export function ResetPasswordPage() {
  const [token] = useState(() => readFragmentToken(window.location.hash));
  useEffect(() => removeFragment(), []);
  return token === undefined || !v.is(accountTokenSchema, token) ? (
    <InvalidResetLink />
  ) : (
    <ResetForm token={token} />
  );
}

function InvalidResetLink() {
  return (
    <AuthCard title="Reset link not valid">
      <div className="grid gap-4 text-sm">
        <p className="m-0">
          This password reset link is invalid, has expired, or was already used. Reset links work
          once, for one hour, and only the newest link works.
        </p>
        <Button asChild className="w-full" size="lg">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
        <p className="m-0 text-center">
          <Link className={linkClass} to="/login">
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}

function ResetForm({ token }: { readonly token: string }) {
  const client = useAdminClient();
  const sessionSource = useSessionSource();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const mismatchId = useId();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const reset = useMutation({
    mutationFn: () => client.confirmPasswordReset({ password, token }),
    onSuccess: async () => {
      // A reset ends every session of the account, possibly including this browser's.
      queryClient.clear();
      sessionSource.invalidate();
      await navigate({ search: { reset: true }, to: "/login" });
    },
  });
  if (reset.error instanceof AdminClientError && reset.error.code === "RESET_INVALID")
    return <InvalidResetLink />;
  return (
    <AuthCard
      description="Choose a new password for your Lace account."
      title="Choose a new password"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const differs = password !== confirmation;
          setMismatch(differs);
          if (!differs) reset.mutate();
        }}
      >
        <PasswordField
          autoComplete="new-password"
          autoFocus
          description={`At least ${minimumPasswordLength} characters.`}
          label="New password"
          maxLength={1024}
          minLength={minimumPasswordLength}
          onChange={(event) => setPassword(event.currentTarget.value)}
          required
          value={password}
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
              The passwords do not match.
            </p>
          ) : undefined}
        </div>
        {reset.error === null ? undefined : (
          <ErrorState
            description={errorDescription(reset.error)}
            technicalDetails={technicalDetails(reset.error)}
            title="Password not changed"
          />
        )}
        <Button className="w-full" disabled={reset.isPending} size="lg" type="submit">
          {reset.isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : undefined}
          {reset.isPending ? "Changing password…" : "Change password"}
        </Button>
      </form>
    </AuthCard>
  );
}

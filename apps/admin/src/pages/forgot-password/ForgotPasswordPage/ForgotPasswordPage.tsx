import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { errorDescription, technicalDetails, useAdminClient } from "../../../shared/api/index.js";
import { AuthCard } from "../../../shared/ui/AuthCard/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { TextField } from "../../../shared/ui/TextField/index.js";

const linkClass = "font-medium text-primary underline underline-offset-4";

function BackToSignIn() {
  return (
    <p className="m-0 text-center text-sm">
      <Link className={linkClass} to="/login">
        Back to sign in
      </Link>
    </p>
  );
}

/**
 * Requests a password reset link. Every accepted request shows the same
 * confirmation, so the screen never reveals whether an address has an account.
 */
export function ForgotPasswordPage() {
  const client = useAdminClient();
  const [email, setEmail] = useState("");
  const [requestedFor, setRequestedFor] = useState<string>();
  const request = useMutation({
    mutationFn: async () => {
      const address = email.trim();
      await client.requestPasswordReset(address);
      return address;
    },
    onSuccess: (address) => setRequestedFor(address),
  });
  if (requestedFor !== undefined)
    return (
      <AuthCard title="Check your email">
        <div className="grid gap-4 text-sm">
          <p className="m-0" role="status">
            {`If an account exists for ${requestedFor}, we sent it a link to choose a new password. The link expires after one hour.`}
          </p>
          <p className="m-0 text-muted-foreground">
            No email? Check your spam folder, or ask an administrator to send you a reset link.
          </p>
          <BackToSignIn />
        </div>
      </AuthCard>
    );
  return (
    <AuthCard
      description="Enter your account email and we will send you a link to choose a new password."
      title="Forgot password?"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          request.mutate();
        }}
      >
        <TextField
          autoComplete="email"
          autoFocus
          label="Email"
          maxLength={320}
          onChange={(event) => setEmail(event.currentTarget.value)}
          required
          type="email"
          value={email}
        />
        {request.error === null ? undefined : (
          <ErrorState
            description={errorDescription(request.error)}
            technicalDetails={technicalDetails(request.error)}
            title="Reset link not requested"
          />
        )}
        <Button className="w-full" disabled={request.isPending} size="lg" type="submit">
          {request.isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : undefined}
          {request.isPending ? "Sending…" : "Send reset link"}
        </Button>
        <BackToSignIn />
      </form>
    </AuthCard>
  );
}

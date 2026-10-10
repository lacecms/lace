import { accountTokenSchema, type InvitationInspectResultDto } from "@lacecms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as v from "valibot";
import { roleDescription, roleLabel, useSessionSource } from "../../../entities/session/index.js";
import {
  AdminClientError,
  errorDescription,
  technicalDetails,
  useAdminClient,
} from "../../../shared/api/index.js";
import {
  formatAbsoluteTime,
  formatRelativeTime,
  readFragmentToken,
  removeFragment,
} from "../../../shared/lib/index.js";
import { AuthCard } from "../../../shared/ui/AuthCard/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { LoadingState } from "../../../shared/ui/LoadingState/index.js";
import { PasswordField } from "../../../shared/ui/PasswordField/index.js";
import { TextField } from "../../../shared/ui/TextField/index.js";

/** The API's password and display-name rules, stated beside the fields. */
const minimumPasswordLength = 12;
const maximumNameLength = 120;

const linkClass = "font-medium text-primary underline underline-offset-4";

function isInvalidInvitation(error: unknown): boolean {
  return error instanceof AdminClientError && error.code === "INVITATION_INVALID";
}

function acceptErrorDescription(error: unknown): string {
  return error instanceof AdminClientError && error.code === "CONFLICT"
    ? "An account for this email already exists. Sign in instead."
    : errorDescription(error);
}

/**
 * Accepts an invitation from its emailed link. The token is read from the URL
 * fragment, removed from the address bar, and kept only in component state:
 * never in the query string, router state, query cache, or browser storage.
 */
export function AcceptInvitePage() {
  const [token] = useState(() => readFragmentToken(window.location.hash));
  useEffect(() => removeFragment(), []);
  return token === undefined || !v.is(accountTokenSchema, token) ? (
    <InvalidInvitation />
  ) : (
    <Invitation token={token} />
  );
}

function InvalidInvitation() {
  return (
    <AuthCard title="Invitation not valid">
      <div className="grid gap-4 text-sm">
        <p className="m-0">
          This invitation link is invalid, has expired, or was already used. Ask the person who
          invited you to send a new invitation.
        </p>
        <p className="m-0 text-muted-foreground">
          Already have an account?{" "}
          <Link className={linkClass} to="/login">
            Sign in
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}

function Invitation({ token }: { readonly token: string }) {
  const client = useAdminClient();
  const started = useRef(false);
  // A mutation, not a query: the token must never become part of a query key or cache entry.
  const inspect = useMutation({ mutationFn: () => client.inspectInvitation(token) });
  const { mutate } = inspect;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    mutate();
  }, [mutate]);
  if (inspect.error !== null)
    return isInvalidInvitation(inspect.error) ? (
      <InvalidInvitation />
    ) : (
      <AuthCard title="Accept invitation">
        <ErrorState
          description={errorDescription(inspect.error)}
          onRetry={() => inspect.mutate()}
          retrying={inspect.isPending}
          technicalDetails={technicalDetails(inspect.error)}
          title="Invitation could not be checked"
        />
      </AuthCard>
    );
  if (inspect.data === undefined)
    return (
      <AuthCard title="Accept invitation">
        <LoadingState label="Checking your invitation" lines={3} />
      </AuthCard>
    );
  return <AcceptForm invitation={inspect.data} token={token} />;
}

function AcceptForm({
  invitation,
  token,
}: {
  readonly invitation: InvitationInspectResultDto;
  readonly token: string;
}) {
  const client = useAdminClient();
  const sessionSource = useSessionSource();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const accept = useMutation({
    // Acceptance creates the account without a session, so sign in with the chosen password.
    mutationFn: async () => {
      const name = displayName.trim();
      const { email } = await client.acceptInvitation({
        ...(name.length === 0 ? {} : { displayName: name }),
        password,
        token,
      });
      try {
        await client.signIn(email, password);
        return true;
      } catch {
        return false;
      }
    },
    onSuccess: async (signedIn) => {
      // A visitor who was signed in as someone else must not see that account's data.
      queryClient.clear();
      sessionSource.invalidate();
      if (!signedIn) {
        await navigate({ to: "/login" });
        return;
      }
      await sessionSource.get();
      await navigate({ to: "/content" });
    },
  });
  if (isInvalidInvitation(accept.error)) return <InvalidInvitation />;
  return (
    <AuthCard
      description="Choose a password to finish setting up your Lace account."
      title="Accept invitation"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          accept.mutate();
        }}
      >
        <TextField label="Email" readOnly type="email" value={invitation.email} />
        <div className="grid gap-1 text-sm">
          <p className="m-0 font-medium">{`Role: ${roleLabel(invitation.role)}`}</p>
          <p className="m-0 text-muted-foreground">{roleDescription(invitation.role)}</p>
        </div>
        <TextField
          autoComplete="name"
          label="Display name (optional)"
          maxLength={maximumNameLength}
          onChange={(event) => setDisplayName(event.currentTarget.value)}
          value={displayName}
        />
        <PasswordField
          autoComplete="new-password"
          autoFocus
          description={`At least ${minimumPasswordLength} characters.`}
          label="Password"
          maxLength={1024}
          minLength={minimumPasswordLength}
          onChange={(event) => setPassword(event.currentTarget.value)}
          required
          value={password}
        />
        {accept.error === null ? undefined : (
          <ErrorState
            description={acceptErrorDescription(accept.error)}
            technicalDetails={technicalDetails(accept.error)}
            title="Invitation not accepted"
          />
        )}
        <Button className="w-full" disabled={accept.isPending} size="lg" type="submit">
          {accept.isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : undefined}
          {accept.isPending ? "Creating account…" : "Create account"}
        </Button>
        <p className="m-0 text-center text-xs text-muted-foreground">
          {"This invitation expires "}
          <time dateTime={invitation.expiresAt} title={formatAbsoluteTime(invitation.expiresAt)}>
            {formatRelativeTime(invitation.expiresAt)}
          </time>
          .
        </p>
      </form>
    </AuthCard>
  );
}

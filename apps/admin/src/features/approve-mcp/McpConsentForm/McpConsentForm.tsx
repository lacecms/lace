import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { adminQueryKeys, errorDescription, useAdminClient } from "../../../shared/api/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { LoadingState } from "../../../shared/ui/LoadingState/index.js";

/** Displays only server-bound transaction details; OAuth credentials never enter UI state. */
export function McpConsentForm({ transaction }: { readonly transaction: string }) {
  const client = useAdminClient();
  const [write, setWrite] = useState(false);
  const details = useQuery({
    queryKey: adminQueryKeys.mcpConsent(transaction),
    queryFn: () => client.loadMcpConsent(transaction),
    retry: false,
  });
  const decision = useMutation({
    mutationFn: (accept: boolean) =>
      client.submitMcpConsent({
        transaction,
        accept,
        scope: (details.data?.scopes ?? [])
          .filter((scope) => scope !== "content:write" || write)
          .join(" "),
      }),
    onSuccess: (result) => {
      window.location.assign(result.url);
    },
  });
  if (details.isPending) return <LoadingState label="Loading connection request" lines={3} />;
  if (details.error)
    return (
      <ErrorState
        title="Connection request unavailable"
        description="This request may have expired or changed. Start a new connection from your assistant."
      />
    );
  const data = details.data;
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        decision.mutate(true);
      }}
    >
      <p className="m-0">
        <strong className="break-words">{data.clientName}</strong> wants to connect to your Lace
        account.
      </p>
      <p className="m-0 text-sm text-muted-foreground">
        After your decision, you will return to{" "}
        <span className="break-words font-medium">{data.callbackHostname || "your assistant"}</span>
        .
      </p>
      <fieldset className="grid gap-3" disabled={decision.isPending}>
        <legend className="mb-2 font-medium">Access to content</legend>
        <label className="flex items-start gap-2">
          <input checked={!write} name="access" type="radio" onChange={() => setWrite(false)} />
          <span>
            Read content
            <span className="block text-sm text-muted-foreground">
              Inspect models, list entries and read drafts.
            </span>
          </span>
        </label>
        {data.scopes.includes("content:write") ? (
          <label className="flex items-start gap-2">
            <input
              checked={write}
              disabled={!data.canWrite}
              name="access"
              type="radio"
              onChange={() => setWrite(true)}
            />
            <span>
              Read and edit drafts
              <span className="block text-sm text-muted-foreground">
                Create entries and replace complete drafts.
                {!data.canWrite ? " Your current role does not allow draft writes." : ""}
              </span>
            </span>
          </label>
        ) : null}
      </fieldset>
      <p className="m-0 rounded-md bg-muted p-3 text-sm">
        Publishing, unpublishing, deleting content and media administration are never allowed
        through this connection. Your current account permissions still apply.
      </p>
      {decision.error ? (
        <ErrorState title="Decision not completed" description={errorDescription(decision.error)} />
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          disabled={decision.isPending}
          onClick={() => decision.mutate(false)}
          type="button"
          variant="outline"
        >
          Deny
        </Button>
        <Button disabled={decision.isPending} type="submit">
          {decision.isPending ? "Continuing…" : "Allow access"}
        </Button>
      </div>
    </form>
  );
}

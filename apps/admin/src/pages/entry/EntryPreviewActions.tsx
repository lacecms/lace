import {
  previewFailureReasonSchema,
  type ContractValidationIssue,
  type PreviewStatusDto,
} from "@lacecms/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { is } from "valibot";
import { useSessionRecovery } from "../../entities/session/index.js";
import {
  AdminClientError,
  adminQueryKeys,
  technicalDetails,
  useAdminClient,
} from "../../shared/api/index.js";
import { formatAbsoluteTime, formatRelativeTime } from "../../shared/lib/index.js";
import { Button } from "../../shared/ui/Button/index.js";
import { Dialog, DialogTrigger } from "../../shared/ui/Dialog/index.js";
import { EntryPreviewScreen } from "./EntryPreviewScreen.js";
import {
  isActivePreview,
  previewFailureDescription,
  previewStateDescription,
  usePreviewExpired,
} from "./preview-status.js";

type PreviewAttempt = { expectedRevision: number; idempotencyKey: string };

const statusIntervalMs = 5_000;
// An active generation has at most 15 minutes left when first observed.
const statusObservationMs = 15 * 60_000;

function PreviewRequestError({
  error,
  fallback,
}: {
  readonly error: unknown;
  readonly fallback: string;
}) {
  const code = error instanceof AdminClientError ? error.code : undefined;
  const message = is(previewFailureReasonSchema, code) ? previewFailureDescription[code] : fallback;
  const requestId = technicalDetails(error);
  return (
    <div role="alert">
      <p className="m-0 text-destructive">{message}</p>
      {requestId && (
        <details className="text-xs">
          <summary>Technical details</summary>
          <p>Request ID {requestId}</p>
        </details>
      )}
    </div>
  );
}

export function EntryPreviewActions({
  entryId,
  title,
  revision,
  canWrite,
  dirty,
  busy,
  eligible,
  onIssues,
}: {
  readonly entryId: string;
  readonly title: string;
  readonly revision: number;
  readonly canWrite: boolean;
  readonly dirty: boolean;
  readonly busy: boolean;
  readonly eligible: boolean;
  readonly onIssues: (issues: readonly ContractValidationIssue[]) => void;
}) {
  const client = useAdminClient();
  const queryClient = useQueryClient();
  const [opened, setOpened] = useState<NonNullable<PreviewStatusDto>>();
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const attempt = useRef<{ input: PreviewAttempt; previousGeneration: string | undefined }>(
    undefined,
  );
  const observation = useRef<{ id: string; until: number } | undefined>(undefined);
  const statusKey = adminQueryKeys.previewStatus(entryId);
  const config = useQuery({
    queryKey: adminQueryKeys.previewConfig,
    queryFn: client.loadPreviewConfig,
  });
  const preview = useQuery({
    enabled: config.isSuccess && config.data.ready,
    queryKey: statusKey,
    queryFn: async ({ signal }) => {
      const status = await client.loadPreviewStatus(entryId, signal);
      if (
        !signal.aborted &&
        status &&
        isActivePreview(status.state) &&
        observation.current?.id !== status.id
      )
        observation.current = { id: status.id, until: Date.now() + statusObservationMs };
      return status;
    },
    retry: false,
    refetchInterval: ({ state }) => {
      const observed = observation.current;
      if (!observed || observed.id !== state.data?.id || state.status !== "success") return false;
      if (!isActivePreview(state.data.state)) return false;
      const remaining = observed.until - Date.now();
      return remaining > 0 ? Math.min(statusIntervalMs, remaining) : false;
    },
  });
  const create = useMutation({
    mutationFn: (input: PreviewAttempt) => client.createPreview(entryId, input),
    networkMode: "always",
    retry: false,
    onSuccess: async () => {
      attempt.current = undefined;
      await queryClient.invalidateQueries({ queryKey: statusKey });
    },
    onError: (error) => {
      if (!(error instanceof AdminClientError)) return;
      if (error.status !== undefined && error.status < 500) attempt.current = undefined;
    },
  });
  useSessionRecovery(config.error ?? preview.error ?? create.error);
  const current = preview.data;
  const expired = usePreviewExpired(current?.state === "ready" ? current.expiresAt : undefined);
  if (config.isError || config.data?.ready !== true) return null;

  const state = expired ? "expired" : current?.state;
  const active = isActivePreview(state);
  const observationEnded =
    active && observation.current !== undefined && Date.now() >= observation.current.until;
  const ready = state === "ready" && preview.isSuccess ? current : undefined;
  const unavailable =
    opened === undefined || ready?.id === opened.id
      ? undefined
      : current?.id === opened.id && state === "expired"
        ? "This preview has expired. Return to the editor to check for a newer preview."
        : "This preview is no longer available. Return to the editor to check the current preview.";
  const failed = state === "failed" || state === "timed_out";
  const failure = current?.reason ?? (state === "timed_out" ? "PREVIEW_TIMED_OUT" : undefined);
  const label = failed ? "Retry preview" : ready ? "Recreate preview" : "Create preview";
  const reason = !eligible
    ? "Save a draft with a site route to create a preview."
    : dirty
      ? "Save or discard your changes before creating a preview."
      : undefined;
  const submit = () => {
    if (
      attempt.current?.input.expectedRevision !== revision ||
      attempt.current.previousGeneration !== current?.id
    )
      attempt.current = {
        input: { expectedRevision: revision, idempotencyKey: crypto.randomUUID() },
        previousGeneration: current?.id,
      };
    create.mutate(attempt.current.input, {
      onError(error) {
        if (error instanceof AdminClientError && error.issues?.length) onIssues(error.issues);
      },
    });
  };
  return (
    <section
      aria-labelledby="entry-preview-title"
      className="grid gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-xs"
    >
      <h2
        ref={heading}
        id="entry-preview-title"
        className="m-0 text-sm font-semibold"
        tabIndex={-1}
      >
        Draft preview
      </h2>
      {!preview.isError && (
        <p role="status" className="m-0 text-sm">
          {state
            ? previewStateDescription[state]
            : current === null
              ? "No preview yet."
              : "Checking preview status…"}
        </p>
      )}
      {current && (
        <div className="grid gap-1 text-xs text-muted-foreground">
          <p className="m-0">Preview revision {current.revision}</p>
          {current.revision !== revision && (
            <p className="m-0">The saved draft is revision {revision}.</p>
          )}
          <p className="m-0">
            Requested{" "}
            <time dateTime={current.createdAt} title={formatAbsoluteTime(current.createdAt)}>
              {formatRelativeTime(current.createdAt)}
            </time>
          </p>
          {current.readyAt && (
            <p className="m-0">
              Ready{" "}
              <time dateTime={current.readyAt} title={formatAbsoluteTime(current.readyAt)}>
                {formatRelativeTime(current.readyAt)}
              </time>
            </p>
          )}
          {current.expiresAt && (state === "ready" || state === "expired") && (
            <p className="m-0">
              {state === "expired" ? "Expired" : "Expires"}{" "}
              <time dateTime={current.expiresAt}>{formatAbsoluteTime(current.expiresAt)}</time>
            </p>
          )}
        </div>
      )}
      {failed && current && (
        <div className="grid gap-1">
          <p className="m-0 text-sm text-destructive">
            {failure
              ? previewFailureDescription[failure]
              : "Retry the saved draft. If it keeps failing, share the preview ID with your site maintainer."}
          </p>
          <details className="text-xs break-all">
            <summary>Technical details</summary>
            <p>Preview ID {current.id}</p>
          </details>
        </div>
      )}
      <Dialog
        open={opened !== undefined}
        onOpenChange={(open) => setOpened(open ? (ready ?? undefined) : undefined)}
      >
        {ready && !create.isPending && (
          <DialogTrigger asChild>
            <Button ref={trigger} className="justify-self-start" size="sm">
              Open preview
            </Button>
          </DialogTrigger>
        )}
        {opened && (
          <EntryPreviewScreen
            config={config.data}
            preview={opened}
            savedRevision={revision}
            title={title}
            unavailable={unavailable}
            returnFocus={() => (trigger.current ?? heading.current)?.focus()}
          />
        )}
      </Dialog>
      {observationEnded && !preview.isError && (
        <p className="m-0 text-xs text-muted-foreground">Automatic status checks have ended.</p>
      )}
      {(active || preview.isError) && (
        <Button
          className="justify-self-start"
          type="button"
          variant="outline"
          size="sm"
          disabled={preview.isFetching}
          onClick={() => void preview.refetch()}
        >
          Refresh preview status
        </Button>
      )}
      {preview.error && (
        <PreviewRequestError
          error={preview.error}
          fallback="Preview status could not be loaded. Refresh preview status to try again."
        />
      )}
      {canWrite && (
        <>
          <Button
            className="justify-self-start"
            type="button"
            variant="outline"
            size="sm"
            disabled={
              busy ||
              active ||
              reason !== undefined ||
              create.isPending ||
              preview.isPending ||
              preview.isError
            }
            onClick={submit}
          >
            {create.isPending ? "Requesting preview…" : label}
          </Button>
          {reason && <p className="m-0 text-xs text-muted-foreground">{reason}</p>}
          {create.error &&
            !(create.error instanceof AdminClientError && create.error.issues?.length) && (
              <PreviewRequestError
                error={create.error}
                fallback="The preview request failed. Try again."
              />
            )}
        </>
      )}
    </section>
  );
}

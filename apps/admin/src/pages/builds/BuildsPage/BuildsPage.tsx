import { CurrentBuildSite } from "../../../widgets/current-build-site/index.js";
import {
  BuildStatusBadge,
  isRetryableBuildStatus,
  isTerminalBuildStatus,
} from "../../../entities/site-build/index.js";
import { publicationVisibilityModes } from "../../../features/publish-entry/index.js";
import type { SiteBuildRecordDto } from "@lacecms/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Hammer, RotateCw } from "lucide-react";
import { useState } from "react";
import { useSession, useSessionRecovery } from "../../../entities/session/index.js";
import {
  adminQueryKeys,
  errorDescription,
  technicalDetails,
  useAdminClient,
} from "../../../shared/api/index.js";
import { formatAbsoluteTime, formatRelativeTime } from "../../../shared/lib/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { EmptyState } from "../../../shared/ui/EmptyState/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { cardClass, pageClass } from "../../../shared/ui/layout/index.js";
import { LoadingState } from "../../../shared/ui/LoadingState/index.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../shared/ui/Table/index.js";
import { buildFailureGuidance } from "./build-failure.js";

const providerStageLabels: Record<NonNullable<SiteBuildRecordDto["providerStage"]>, string> = {
  queued: "Queued",
  initialize: "Initializing",
  clone_repo: "Cloning repository",
  build: "Build",
  deploy: "Deploy",
};

function BuildTime({ value }: { readonly value: string | undefined }) {
  return value === undefined ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    <time dateTime={value} title={formatAbsoluteTime(value)}>
      {formatRelativeTime(value)}
    </time>
  );
}

/** Verified mode guidance; the CMS cannot tell which mode serves the site. */
function PublicationVisibility() {
  return (
    <section className={cardClass} aria-labelledby="publication-visibility-title">
      <h2 className="m-0" id="publication-visibility-title">
        When published content becomes visible
      </h2>
      <dl className="m-0 grid gap-2 text-sm">
        {publicationVisibilityModes.map((item) => (
          <div className="grid gap-0.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3" key={item.mode}>
            <dt className="font-medium">{item.mode}</dt>
            <dd className="m-0 text-muted-foreground">{item.detail}</dd>
          </div>
        ))}
      </dl>
      <p className="m-0 text-sm text-muted-foreground">
        A self-hosted build is running while the builder works and succeeds once its release is
        served. Accepted means only that a provider took the request. One build can cover several
        publications. A recorded build does not confirm Astro dev or a manual deployment.
      </p>
    </section>
  );
}

export function BuildsPage() {
  const client = useAdminClient();
  const session = useSession();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action, setAction] = useState<"request" | "retry" | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [queuedVersion, setQueuedVersion] = useState<number | null>(null);
  const history = useQuery({
    queryKey: adminQueryKeys.builds,
    queryFn: client.listBuilds,
    refetchInterval: 5_000,
  });
  const detail = useQuery({
    queryKey: adminQueryKeys.buildDetail(selectedId ?? ""),
    queryFn: () => client.getBuild(selectedId!),
    enabled: selectedId !== null,
    // A tracked provider deployment changes stage and status without user action.
    refetchInterval: (query) =>
      query.state.data === undefined || isTerminalBuildStatus(query.state.data.status)
        ? false
        : 5_000,
  });
  useSessionRecovery(history.error ?? detail.error ?? actionError);
  const isAdmin = session.role === "admin";

  async function send(actionKind: "request" | "retry", buildId?: string) {
    setAction(actionKind);
    setActionError(null);
    try {
      const receipt =
        actionKind === "request" ? await client.requestBuild() : await client.retryBuild(buildId!);
      setQueuedVersion(receipt.targetVersion);
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.builds });
    } catch (error) {
      setActionError(error);
    } finally {
      setAction(null);
    }
  }

  const items = history.data?.items;
  return (
    <section className={pageClass} aria-labelledby="builds-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 id="builds-title">Builds</h1>
          <p className="m-0 text-muted-foreground">
            Track static site releases and retry builds that did not publish.
          </p>
        </div>
        {isAdmin ? (
          <Button disabled={action !== null} onClick={() => void send("request")}>
            <Hammer aria-hidden="true" /> Request build
          </Button>
        ) : undefined}
      </div>
      <CurrentBuildSite />
      <PublicationVisibility />
      {queuedVersion === null ? undefined : (
        <p className="m-0 text-sm text-success" role="status">
          Build for published version {queuedVersion} queued. It will appear after dispatch.
        </p>
      )}
      {actionError === null ? undefined : (
        <ErrorState description={errorDescription(actionError)} title="Build request failed" />
      )}
      {history.isPending ? <LoadingState label="Loading builds" lines={4} /> : undefined}
      {history.error === null ? undefined : (
        <ErrorState
          description={errorDescription(history.error)}
          onRetry={() => void history.refetch()}
          retrying={history.isFetching}
          technicalDetails={technicalDetails(history.error)}
        />
      )}
      {items?.length === 0 ? (
        <EmptyState
          description={
            isAdmin
              ? "Published content has not been built yet. Request the first release."
              : "No site builds have been recorded yet."
          }
          icon={Activity}
          title="No builds yet"
        />
      ) : undefined}
      {items === undefined || items.length === 0 ? undefined : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,1fr)]">
          <div className={cardClass}>
            <Table aria-label="Build history">
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((build) => (
                  <TableRow
                    key={build.id}
                    data-state={selectedId === build.id ? "selected" : undefined}
                  >
                    <TableCell>
                      <BuildStatusBadge status={build.status} />
                    </TableCell>
                    <TableCell>v{build.targetVersion}</TableCell>
                    <TableCell className="capitalize">
                      {build.reason.replaceAll("_", " ")}
                    </TableCell>
                    <TableCell>
                      <BuildTime value={build.requestedAt} />
                    </TableCell>
                    <TableCell>
                      <Button
                        aria-label={`View build for version ${build.targetVersion}`}
                        onClick={() => setSelectedId(build.id)}
                        size="sm"
                        variant="outline"
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {selectedId === null ? (
            <EmptyState
              description="Select a build to see its provider and timing details."
              title="Build details"
            />
          ) : (
            <section className={cardClass} aria-label="Build details">
              <h2 className="m-0">Build details</h2>
              {detail.isPending ? (
                <LoadingState label="Loading build details" lines={4} />
              ) : undefined}
              {detail.error === null ? undefined : (
                <ErrorState
                  description={errorDescription(detail.error)}
                  onRetry={() => void detail.refetch()}
                  retrying={detail.isFetching}
                />
              )}
              {detail.data === undefined ? undefined : (
                <>
                  <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm [&_dt]:text-muted-foreground">
                    <dt>Build ID</dt>
                    <dd className="m-0 break-all">{detail.data.id}</dd>
                    <dt>Status</dt>
                    <dd className="m-0">
                      <BuildStatusBadge status={detail.data.status} />
                    </dd>
                    <dt>Target version</dt>
                    <dd className="m-0">{detail.data.targetVersion}</dd>
                    <dt>Reason</dt>
                    <dd className="m-0 capitalize">{detail.data.reason.replaceAll("_", " ")}</dd>
                    <dt>Requested by</dt>
                    <dd className="m-0">{detail.data.requestedBy}</dd>
                    <dt>Requested</dt>
                    <dd className="m-0">
                      <BuildTime value={detail.data.requestedAt} />
                    </dd>
                    <dt>Started</dt>
                    <dd className="m-0">
                      <BuildTime value={detail.data.startedAt} />
                    </dd>
                    <dt>Completed</dt>
                    <dd className="m-0">
                      <BuildTime value={detail.data.completedAt} />
                    </dd>
                    <dt>Provider ID</dt>
                    <dd className="m-0 break-all">{detail.data.providerBuildId ?? "—"}</dd>
                    {detail.data.providerStage === undefined ? undefined : (
                      <>
                        <dt>Provider stage</dt>
                        <dd className="m-0">{providerStageLabels[detail.data.providerStage]}</dd>
                      </>
                    )}
                    {detail.data.providerCheckedAt === undefined ? undefined : (
                      <>
                        <dt>Last checked</dt>
                        <dd className="m-0">
                          <BuildTime value={detail.data.providerCheckedAt} />
                        </dd>
                      </>
                    )}
                  </dl>
                  {detail.data.error === undefined ? undefined : (
                    <div
                      className={
                        detail.data.status === "cancelled" || detail.data.status === "unknown"
                          ? "grid gap-2 rounded-md border bg-muted p-3 text-sm"
                          : "grid gap-2 rounded-md bg-destructive/10 p-3 text-sm text-foreground"
                      }
                      role={
                        detail.data.status === "cancelled" || detail.data.status === "unknown"
                          ? "status"
                          : "alert"
                      }
                    >
                      <p className="m-0">{buildFailureGuidance[detail.data.error].explanation}</p>
                      {detail.data.errorPath === undefined ? undefined : (
                        <p className="m-0 break-all">
                          Source entry: <code>{detail.data.errorPath}</code>
                        </p>
                      )}
                      <p className="m-0">{buildFailureGuidance[detail.data.error].correction}</p>
                      {detail.data.status === "pending" ? (
                        <p className="m-0">An automatic retry is scheduled.</p>
                      ) : undefined}
                    </div>
                  )}
                  {isAdmin && isRetryableBuildStatus(detail.data.status) ? (
                    <Button
                      disabled={action !== null}
                      onClick={() => void send("retry", detail.data.id)}
                      size="sm"
                      variant="outline"
                    >
                      <RotateCw aria-hidden="true" /> Retry build
                    </Button>
                  ) : undefined}
                </>
              )}
            </section>
          )}
        </div>
      )}
    </section>
  );
}

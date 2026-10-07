import type { AdminSettingsStatusDto } from "@lacecms/contracts";
import { Boxes, KeyRound, RefreshCw, Server, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { errorDescription, technicalDetails } from "../../../shared/api/index.js";
import { Badge } from "../../../shared/ui/Badge/index.js";
import { Button } from "../../../shared/ui/Button/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { cardClass } from "../../../shared/ui/layout/index.js";
import { Skeleton } from "../../../shared/ui/Skeleton/index.js";

function StatusCard({
  children,
  detail,
  icon: Icon,
  label,
  loading,
}: {
  readonly children?: ReactNode;
  readonly detail?: string | undefined;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly loading: boolean;
}) {
  return (
    <div aria-busy={loading || undefined} aria-label={label} className={cardClass} role="group">
      <p className="m-0 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
        {label}
      </p>
      {loading ? (
        <Skeleton className="h-6 w-20 rounded-sm bg-border" />
      ) : (
        <div className="grid gap-0.5">
          <div className="text-xl font-semibold tracking-tight">{children}</div>
          {detail === undefined ? undefined : (
            <p className="m-0 text-xs text-muted-foreground">{detail}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Read-only site health: API readiness, configured models, and active build tokens. */
export function SiteStatusCards({
  activeTokens,
  error,
  onRefresh,
  refreshing,
  status,
}: {
  readonly activeTokens: number | undefined;
  readonly error: unknown;
  readonly onRefresh: () => void;
  readonly refreshing: boolean;
  readonly status: AdminSettingsStatusDto | undefined;
}) {
  return (
    <section aria-labelledby="site-status-title" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="site-status-title">Site status</h2>
        <Button disabled={refreshing} onClick={onRefresh} size="sm" variant="outline">
          <RefreshCw aria-hidden="true" className={refreshing ? "animate-spin" : undefined} />
          Refresh status
        </Button>
      </div>
      {error === null ? undefined : (
        <ErrorState
          description={errorDescription(error)}
          onRetry={onRefresh}
          retrying={refreshing}
          technicalDetails={technicalDetails(error)}
        />
      )}
      {error !== null && status !== undefined ? (
        <p className="m-0 text-sm text-muted-foreground" role="status">
          Status is stale. Showing the last confirmed values.
        </p>
      ) : undefined}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCard
          detail="Release of the running Lace CMS."
          icon={Server}
          label="CMS version"
          loading={status === undefined && error === null}
        >
          <span className="break-all">{status?.engineVersion ?? "—"}</span>
        </StatusCard>
        <StatusCard
          detail={
            status === undefined
              ? undefined
              : status.ready
                ? "Accepting requests."
                : "Check the server logs."
          }
          icon={Server}
          label="API"
          loading={status === undefined && error === null}
        >
          {status === undefined ? (
            "—"
          ) : (
            <Badge variant={status.ready ? "success" : "warning"}>
              {status.ready ? "Ready" : "Not ready"}
            </Badge>
          )}
        </StatusCard>
        <StatusCard
          detail="Defined in the site's Lace configuration."
          icon={Boxes}
          label="Content models"
          loading={status === undefined && error === null}
        >
          {status?.configuredModels ?? "—"}
        </StatusCard>
        <StatusCard
          detail="Tokens that can read published content."
          icon={KeyRound}
          label="Active build tokens"
          loading={activeTokens === undefined}
        >
          {activeTokens}
        </StatusCard>
      </div>
    </section>
  );
}

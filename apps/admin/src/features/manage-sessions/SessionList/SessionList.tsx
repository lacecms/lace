import type { AccountSessionDto } from "@lacecms/contracts";
import { useQuery } from "@tanstack/react-query";
import { useSessionRecovery } from "../../../entities/session/index.js";
import {
  adminQueryKeys,
  errorDescription,
  technicalDetails,
  useAdminClient,
} from "../../../shared/api/index.js";
import { formatAbsoluteTime, formatRelativeTime } from "../../../shared/lib/index.js";
import { Badge } from "../../../shared/ui/Badge/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { listClass } from "../../../shared/ui/layout/index.js";
import { LoadingState } from "../../../shared/ui/LoadingState/index.js";
import { EndOtherSessionsDialog } from "../EndOtherSessionsDialog/index.js";
import { EndSessionDialog } from "../EndSessionDialog/index.js";
import { sessionLabel } from "../session-label.js";

function RelativeTime({ iso, now }: { readonly iso: string; readonly now: number }) {
  return (
    <time dateTime={iso} title={formatAbsoluteTime(iso)}>
      {formatRelativeTime(iso, now)}
    </time>
  );
}

/** This device first, then the most recently active sessions. */
function byRecency(left: AccountSessionDto, right: AccountSessionDto): number {
  if (left.current !== right.current) return left.current ? -1 : 1;
  return Date.parse(right.lastActiveAt) - Date.parse(left.lastActiveAt);
}

/**
 * The signed-in user's own sessions with browser, system, and relative times.
 * Every other session can be signed out after confirmation; this device signs
 * out through Log out instead.
 */
export function SessionList({ now = Date.now() }: { readonly now?: number }) {
  const client = useAdminClient();
  const sessions = useQuery({
    queryFn: client.listSessions,
    queryKey: adminQueryKeys.accountSessions,
  });
  useSessionRecovery(sessions.error);
  if (sessions.isPending) return <LoadingState label="Loading sessions" lines={3} />;
  if (sessions.error !== null)
    return (
      <ErrorState
        description={errorDescription(sessions.error)}
        onRetry={() => void sessions.refetch()}
        retrying={sessions.isFetching}
        technicalDetails={technicalDetails(sessions.error)}
      />
    );
  const items = [...sessions.data.items].sort(byRecency);
  const others = items.filter((item) => !item.current).length;
  return (
    <div className="grid gap-3">
      <ul aria-label="Sessions" className={listClass}>
        {items.map((item) => (
          <li
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-card-foreground"
            key={item.id}
          >
            <div className="grid min-w-0 gap-0.5">
              <p className="m-0 flex flex-wrap items-center gap-2 font-medium">
                {sessionLabel(item)}
                {item.current ? <Badge variant="success">This device</Badge> : undefined}
              </p>
              <p className="m-0 text-xs text-muted-foreground">
                Signed in <RelativeTime iso={item.createdAt} now={now} /> · Last active{" "}
                <RelativeTime iso={item.lastActiveAt} now={now} />
              </p>
            </div>
            {item.current ? undefined : (
              <EndSessionDialog
                lastActive={formatRelativeTime(item.lastActiveAt, now)}
                session={item}
              />
            )}
          </li>
        ))}
      </ul>
      {others === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">You are not signed in anywhere else.</p>
      ) : (
        <div>
          <EndOtherSessionsDialog />
        </div>
      )}
    </div>
  );
}

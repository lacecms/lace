import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useSession, useSessionRecovery } from "../../../entities/session/index.js";
import { InviteUserDialog } from "../../../features/invite-user/index.js";
import {
  adminQueryKeys,
  errorDescription,
  technicalDetails,
  useAdminClient,
} from "../../../shared/api/index.js";
import { EmptyState } from "../../../shared/ui/EmptyState/index.js";
import { ErrorState } from "../../../shared/ui/ErrorState/index.js";
import { pageClass } from "../../../shared/ui/layout/index.js";
import { LoadingState } from "../../../shared/ui/LoadingState/index.js";
import { PageAccessDenied } from "../../../shared/ui/PageState/index.js";
import { InvitationsTable } from "../InvitationsTable/index.js";
import { UsersTable } from "../UsersTable/index.js";

const usersRoute = getRouteApi("/_protected/users");

export function UsersPage() {
  const { permitted } = usersRoute.useRouteContext();
  return permitted ? <UsersManager /> : <PageAccessDenied />;
}

function accountSummary(total: number, disabled: number): string {
  const accounts = total === 1 ? "1 account" : `${total} accounts`;
  return disabled === 0 ? accounts : `${accounts} · ${disabled} disabled`;
}

function UsersManager() {
  const client = useAdminClient();
  const session = useSession();
  const users = useQuery({ queryKey: adminQueryKeys.users, queryFn: client.listUsers });
  const invitations = useQuery({
    queryKey: adminQueryKeys.invitations,
    queryFn: client.listInvitations,
  });
  useSessionRecovery(users.error ?? invitations.error);
  const pending = invitations.data?.items;
  const items = users.data?.items;
  return (
    <section className={pageClass} aria-labelledby="users-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 id="users-title">Users</h1>
          <p className="m-0 text-muted-foreground">
            {items === undefined
              ? "Manage who can sign in to this Lace site and what they can do."
              : accountSummary(items.length, items.filter((item) => item.disabled).length)}
          </p>
        </div>
        {/* One stable instance: the lists refreshing must not unmount a shown link. */}
        <InviteUserDialog />
      </div>
      {users.isPending ? <LoadingState label="Loading users" lines={4} /> : undefined}
      {users.error === null ? undefined : (
        <ErrorState
          description={errorDescription(users.error)}
          onRetry={() => void users.refetch()}
          retrying={users.isFetching}
          technicalDetails={technicalDetails(users.error)}
        />
      )}
      {items?.length === 0 ? (
        <EmptyState
          description="Use Invite user to add each person who edits or reviews this site."
          icon={Users}
          title="No users found"
        />
      ) : undefined}
      {items === undefined || items.length === 0 ? undefined : (
        <UsersTable currentUserId={session.id} users={items} />
      )}
      <section aria-labelledby="invitations-title" className="grid gap-3">
        <div className="grid gap-1">
          <h2 id="invitations-title">Pending invitations</h2>
          <p className="m-0 text-muted-foreground">
            Invited people appear under Users once they accept. Links expire after 72 hours.
          </p>
        </div>
        {invitations.isPending ? <LoadingState label="Loading invitations" lines={2} /> : undefined}
        {invitations.error === null ? undefined : (
          <ErrorState
            description={errorDescription(invitations.error)}
            onRetry={() => void invitations.refetch()}
            retrying={invitations.isFetching}
            technicalDetails={technicalDetails(invitations.error)}
          />
        )}
        {pending?.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">No pending invitations.</p>
        ) : undefined}
        {pending === undefined || pending.length === 0 ? undefined : (
          <InvitationsTable invitations={pending} />
        )}
      </section>
    </section>
  );
}

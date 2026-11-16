import { getRouteApi } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useSession, useSessionRecovery } from "../../../entities/session/index.js";
import { InviteUserDialog } from "../../../features/invite-user/index.js";
import {
  adminQueryKeys,
  isSessionExpiredError,
  useAdminClient,
  useCursorList,
} from "../../../shared/api/index.js";
import { EmptyState } from "../../../shared/ui/EmptyState/index.js";
import { CursorListActions } from "../../../shared/ui/CursorListActions/index.js";
import { pageClass } from "../../../shared/ui/layout/index.js";
import { LoadingState } from "../../../shared/ui/LoadingState/index.js";
import { PageAccessDenied } from "../../../shared/ui/PageState/index.js";
import { InvitationsTable } from "../InvitationsTable.js";
import { UsersTable } from "../UsersTable.js";

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
  const users = useCursorList(adminQueryKeys.users, client.listUsers);
  const invitations = useCursorList(adminQueryKeys.invitations, client.listInvitations);
  useSessionRecovery(
    isSessionExpiredError(users.query.error) ? users.query.error : invitations.query.error,
  );
  const pending = invitations.query.data?.pages.flatMap((page) => page.items);
  const items = users.query.data?.pages.flatMap((page) => page.items);
  const counts = users.query.data?.pages[0];
  return (
    <section className={pageClass} aria-labelledby="users-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 id="users-title">Users</h1>
          <p className="m-0 text-muted-foreground">
            {counts === undefined
              ? "Manage who can sign in to this Lace site and what they can do."
              : accountSummary(counts.total, counts.disabledCount)}
          </p>
        </div>
        {/* One stable instance: the lists refreshing must not unmount a shown link. */}
        <InviteUserDialog />
      </div>
      {users.query.isPending ? <LoadingState label="Loading users" lines={4} /> : undefined}
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
      <CursorListActions list={users} label="Load more users" />
      <section aria-labelledby="invitations-title" className="grid gap-3">
        <div className="grid gap-1">
          <h2 id="invitations-title">Pending invitations</h2>
          <p className="m-0 text-muted-foreground">
            Invited people appear under Users once they accept. Links expire after 72 hours.
          </p>
        </div>
        {invitations.query.isPending ? (
          <LoadingState label="Loading invitations" lines={2} />
        ) : undefined}
        {pending?.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">No pending invitations.</p>
        ) : undefined}
        {pending === undefined || pending.length === 0 ? undefined : (
          <InvitationsTable invitations={pending} />
        )}
        <CursorListActions list={invitations} label="Load more invitations" />
      </section>
    </section>
  );
}

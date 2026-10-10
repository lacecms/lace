import type { InvitationDto } from "@lacecms/contracts";
import { roleLabel } from "../../../entities/session/index.js";
import {
  ResendInvitationButton,
  RevokeInvitationDialog,
} from "../../../features/manage-invitation/index.js";
import { formatAbsoluteTime, formatRelativeTime } from "../../../shared/lib/index.js";
import { Badge } from "../../../shared/ui/Badge/index.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../shared/ui/Table/index.js";

/**
 * Unaccepted invitations with their inviter and relative expiry. Listings
 * never carry a token or link; Resend issues a new one.
 */
export function InvitationsTable({
  invitations,
  now = Date.now(),
}: {
  readonly invitations: readonly InvitationDto[];
  readonly now?: number;
}) {
  return (
    <Table aria-label="Pending invitations">
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Invited by</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invitations.map((invitation) => {
          const expired = invitation.state === "expired";
          return (
            <TableRow className={expired ? "text-muted-foreground" : undefined} key={invitation.id}>
              <TableCell className="font-medium">{invitation.email}</TableCell>
              <TableCell>
                <Badge variant="secondary">{roleLabel(invitation.role)}</Badge>
              </TableCell>
              <TableCell>{invitation.invitedBy}</TableCell>
              <TableCell>
                <time
                  dateTime={invitation.expiresAt}
                  title={formatAbsoluteTime(invitation.expiresAt)}
                >
                  {expired
                    ? `Expired ${formatRelativeTime(invitation.expiresAt, now)}`
                    : formatRelativeTime(invitation.expiresAt, now)}
                </time>
              </TableCell>
              <TableCell>
                <Badge variant={expired ? "warning" : "outline"}>
                  {expired ? "Expired" : "Pending"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  <ResendInvitationButton invitation={invitation} />
                  <RevokeInvitationDialog invitation={invitation} />
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

import type { ManagedUserDto } from "@lacecms/contracts";
import { roleLabel } from "../../../entities/session/index.js";
import { SendPasswordResetDialog } from "../../../features/reset-user-password/index.js";
import { SignOutUserDialog } from "../../../features/sign-out-user/index.js";
import { ChangeRoleDialog, UserAccessDialog } from "../../../features/update-user/index.js";
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
 * Accounts with their confirmed role and status. Each row's actions open
 * confirmation dialogs. Disabled accounts offer only Enable, and the
 * signed-in administrator's own row offers only Change role.
 */
export function UsersTable({
  currentUserId,
  users,
}: {
  readonly currentUserId: string;
  readonly users: readonly ManagedUserDto[];
}) {
  return (
    <Table aria-label="Users">
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((account) => {
          const isSelf = account.id === currentUserId;
          return (
            <TableRow
              className={account.disabled ? "text-muted-foreground" : undefined}
              key={account.id}
            >
              <TableCell>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{account.email}</span>
                  {isSelf ? <Badge variant="outline">You</Badge> : undefined}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{roleLabel(account.role)}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={account.disabled ? "warning" : "success"}>
                  {account.disabled ? "Disabled" : "Active"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  {account.disabled ? undefined : (
                    <ChangeRoleDialog account={account} isSelf={isSelf} />
                  )}
                  {account.disabled || isSelf ? undefined : (
                    <>
                      <SendPasswordResetDialog account={account} />
                      <SignOutUserDialog account={account} />
                    </>
                  )}
                  {isSelf ? undefined : <UserAccessDialog account={account} />}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

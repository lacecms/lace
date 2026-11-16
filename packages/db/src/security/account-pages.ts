import type {
  CursorPage,
  CursorPageInput,
  InvitationRecord,
  ManagedUserPage,
} from "@lacecms/application";
import {
  encodeCursor,
  invalidOperationalCursor,
  operationalCursor,
  operationalPage,
} from "../shared/cursors.js";
import { assertPageSize } from "../shared/values.js";
import { invitationRecord, INVITATION_COLUMNS_SQL, managedUser } from "./rows.js";

type AccountRows = (
  sql: string,
  ...bindings: (number | string)[]
) => readonly Record<string, unknown>[] | Promise<readonly Record<string, unknown>[]>;

const USERS = "admin-users";
const INVITATIONS = "admin-invitations";

export async function readManagedUserPage(
  read: AccountRows,
  input: CursorPageInput,
): Promise<ManagedUserPage> {
  const limit = assertPageSize(input.limit);
  const after = operationalCursor(input.after, USERS);
  const boundary =
    after === undefined ? "" : "where (email, id) > ((select email from user where id = ?), ?)";
  // The totals row survives an empty page. Both parts read the same database snapshot.
  const rows = await read(
    `with page as (
      select id, email, role, disabled from user ${boundary}
      order by email, id limit ?
    ), totals as (
      select count(*) as total, count(case when disabled = 1 then 1 end) as disabled_count from user
    )
    select page.*, totals.*, ${after === undefined ? "1" : "exists(select 1 from user where id = ?)"} as boundary_exists
    from totals left join page on true order by page.email, page.id`,
    ...(after === undefined ? [limit + 1] : [after.id, after.id, limit + 1, after.id]),
  );
  const totals = rows[0]!;
  if (totals.boundary_exists === 0) invalidOperationalCursor();
  return {
    ...operationalPage(
      rows.filter((row) => row.id !== null),
      limit,
      (row) => encodeCursor(USERS, 0, String(row.id)),
      managedUser,
    ),
    disabledCount: Number(totals.disabled_count),
    total: Number(totals.total),
  };
}

export async function readInvitationPage(
  read: AccountRows,
  input: CursorPageInput,
): Promise<CursorPage<InvitationRecord>> {
  const limit = assertPageSize(input.limit);
  const after = operationalCursor(input.after, INVITATIONS);
  const boundary = after === undefined ? "" : "and (i.created_at, i.id) < (?, ?)";
  const rows = await read(
    `${INVITATION_COLUMNS_SQL} where i.accepted_at is null and i.revoked_at is null ${boundary}
    order by i.created_at desc, i.id desc limit ?`,
    ...(after === undefined ? [] : [after.timestamp, after.id]),
    limit + 1,
  );
  return operationalPage(
    rows,
    limit,
    (row) => encodeCursor(INVITATIONS, Number(row.created_at), String(row.id)),
    invitationRecord,
  );
}

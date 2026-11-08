import { unixMilliseconds } from "@lacecms/domain";
import {
  actorDisplayName,
  type BuildTokenMetadata,
  type InvitationRecord,
  type ManagedUser,
  type SecurityRole,
  type SessionRecord,
} from "@lacecms/application";

// Row mappers and SQL fragments the Node and D1 security adapters share; each
// mapper turns one stored row into the record its security port returns.

/** Invitation columns with the inviter's display name; filter with `where i.…`. */
export const INVITATION_COLUMNS_SQL =
  "select i.id, i.email, i.role, i.invited_by, i.created_at, i.expires_at, u.name as inviter_name from invitations i left join user u on u.id = i.invited_by";
/** An invitation that is neither accepted nor revoked; expiry is checked separately. */
export const ACTIVE_INVITATION_SQL = "accepted_at is null and revoked_at is null";

export function normalizedEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length === 0 || !email.includes("@")) throw new TypeError("Invalid email.");
  return email;
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/u.test(error.message);
}

export function securityRole(value: unknown): SecurityRole {
  if (value === "admin" || value === "editor" || value === "viewer") return value;
  throw new TypeError("Invalid role.");
}

export function managedUser(row: Record<string, unknown>): ManagedUser {
  return Object.freeze({
    disabled: Number(row.disabled) === 1,
    email: String(row.email),
    id: String(row.id),
    role: securityRole(row.role),
  });
}

export function userProfile(row: Record<string, unknown>): {
  readonly disabled: boolean;
  readonly email: string;
  readonly name?: string;
} {
  const name = typeof row.name === "string" ? row.name.trim() : "";
  return Object.freeze({
    disabled: Number(row.disabled) === 1,
    email: String(row.email),
    ...(name.length === 0 ? {} : { name }),
  });
}

export function invitationRecord(row: Record<string, unknown>): InvitationRecord {
  return Object.freeze({
    createdAt: unixMilliseconds(Number(row.created_at)),
    email: String(row.email),
    expiresAt: unixMilliseconds(Number(row.expires_at)),
    id: String(row.id),
    invitedBy: String(row.invited_by),
    invitedByName: actorDisplayName(
      String(row.invited_by),
      typeof row.inviter_name === "string" ? row.inviter_name : null,
    ),
    role: securityRole(row.role),
  });
}

export function sessionRecord(row: Record<string, unknown>): SessionRecord {
  return Object.freeze({
    createdAt: unixMilliseconds(Number(row.created_at)),
    id: String(row.id),
    lastActiveAt: unixMilliseconds(Number(row.updated_at)),
    ...(typeof row.user_agent === "string" && row.user_agent.length > 0
      ? { userAgent: row.user_agent }
      : {}),
  });
}

export function buildTokenMetadata(row: Record<string, unknown>): BuildTokenMetadata {
  return Object.freeze({
    capabilities: ["content:build:read"] as const,
    createdAt: unixMilliseconds(Number(row.created_at)),
    id: String(row.id),
    ...(row.last_used_at === null
      ? {}
      : { lastUsedAt: unixMilliseconds(Number(row.last_used_at)) }),
    name: String(row.name),
    ...(row.revoked_at === null ? {} : { revokedAt: unixMilliseconds(Number(row.revoked_at)) }),
    tokenPrefix: String(row.token_prefix),
  });
}

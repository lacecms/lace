import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { timestamp } from "./columns.js";
import { authUsers } from "./auth.js";

export const installationState = sqliteTable(
  "installation_state",
  {
    singletonKey: integer("singleton_key").primaryKey(),
    setupCompletedAt: integer("setup_completed_at"),
    setupAdminUserId: text("setup_admin_user_id"),
  },
  (table) => [check("installation_state_singleton_key_check", sql`${table.singletonKey} = 1`)],
);

export const setupTokens = sqliteTable("setup_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at"),
  claimedEmailHash: text("claimed_email_hash"),
  claimedAt: integer("claimed_at"),
  consumedAt: integer("consumed_at"),
});

export const apiTokens = sqliteTable("api_tokens", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tokenPrefix: text("token_prefix").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  capabilitiesJson: text("capabilities_json").notNull(),
  createdAt: timestamp("created_at"),
  lastUsedAt: integer("last_used_at"),
  revokedAt: integer("revoked_at"),
  /** Import tokens only: required expiry and the creating user (ADR 0016). */
  expiresAt: integer("expires_at"),
  createdBy: text("created_by"),
});

export const rateLimitBuckets = sqliteTable("rate_limit_buckets", {
  bucketKey: text("bucket_key").primaryKey(),
  windowStartedAt: timestamp("window_started_at"),
  requestCount: integer("request_count").notNull(),
  expiresAt: timestamp("expires_at"),
});

/**
 * Lace-owned invitations. Only SHA-256 token digests are stored; at most one
 * active (unaccepted, unrevoked) invitation exists per normalized email.
 */
export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    role: text("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by").notNull(),
    createdAt: timestamp("created_at"),
    expiresAt: timestamp("expires_at"),
    acceptedAt: integer("accepted_at"),
    acceptedUserId: text("accepted_user_id"),
    revokedAt: integer("revoked_at"),
  },
  (table) => [
    check("invitations_role_check", sql`${table.role} in ('admin', 'editor', 'viewer')`),
    uniqueIndex("invitations_active_email_idx")
      .on(table.email)
      .where(sql`${table.acceptedAt} is null and ${table.revokedAt} is null`),
  ],
);

/** Lace-owned password-reset tokens, stored only as SHA-256 digests. */
export const passwordResetTokens = sqliteTable(
  "password_reset_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at"),
    expiresAt: timestamp("expires_at"),
    consumedAt: integer("consumed_at"),
    requestedBy: text("requested_by"),
  },
  (table) => [index("password_reset_tokens_user_idx").on(table.userId)],
);

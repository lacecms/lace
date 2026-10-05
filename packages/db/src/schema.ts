import { sql } from "drizzle-orm";
import {
  check,
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) => integer(name).notNull();
const authTimestamp = (name: string) => integer(name, { mode: "timestamp_ms" }).notNull();

export const contentModels = sqliteTable(
  "content_models",
  {
    key: text("key").primaryKey(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    configVersion: integer("config_version").notNull(),
    structureHash: text("structure_hash").notNull(),
    projectionHash: text("projection_hash").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    check("content_models_kind_check", sql`${table.kind} in ('page', 'collection')`),
    check("content_models_config_version_check", sql`${table.configVersion} > 0`),
  ],
);

export const contentEntries = sqliteTable(
  "content_entries",
  {
    id: text("id").primaryKey(),
    modelKey: text("model_key")
      .notNull()
      .references(() => contentModels.key, { onDelete: "restrict", onUpdate: "cascade" }),
    singletonKey: integer("singleton_key"),
    draftSnapshotId: text("draft_snapshot_id").references(
      (): AnySQLiteColumn => contentSnapshots.id,
      {
        onDelete: "set null",
      },
    ),
    publishedSnapshotId: text("published_snapshot_id").references(
      (): AnySQLiteColumn => contentSnapshots.id,
      {
        onDelete: "set null",
      },
    ),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    index("content_entries_model_idx").on(table.modelKey),
    index("content_entries_list_idx").on(table.modelKey, table.updatedAt, table.id),
    uniqueIndex("content_entries_singleton_idx")
      .on(table.modelKey)
      .where(sql`${table.singletonKey} = 1`),
    check(
      "content_entries_singleton_key_check",
      sql`${table.singletonKey} is null or ${table.singletonKey} = 1`,
    ),
  ],
);

export const contentSnapshots = sqliteTable(
  "content_snapshots",
  {
    id: text("id").primaryKey(),
    entryId: text("entry_id")
      .notNull()
      .references((): AnySQLiteColumn => contentEntries.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    slug: text("slug"),
    title: text("title").notNull(),
    fieldsJson: text("fields_json").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    updatedBy: text("updated_by").notNull(),
  },
  (table) => [
    index("content_snapshots_entry_idx").on(table.entryId),
    check("content_snapshots_revision_check", sql`${table.revision} > 0`),
    check("content_snapshots_schema_version_check", sql`${table.schemaVersion} > 0`),
  ],
);

export const contentBlocks = sqliteTable(
  "content_blocks",
  {
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => contentSnapshots.id, { onDelete: "cascade" }),
    blockKey: text("block_key").notNull(),
    blockType: text("block_type").notNull(),
    position: integer("position").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    dataJson: text("data_json").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.blockKey] }),
    index("content_blocks_snapshot_position_idx").on(table.snapshotId, table.position),
    check("content_blocks_position_check", sql`${table.position} > 0`),
    check("content_blocks_schema_version_check", sql`${table.schemaVersion} > 0`),
  ],
);

export const publishedRoutes = sqliteTable(
  "published_routes",
  {
    path: text("path").primaryKey(),
    entryId: text("entry_id")
      .notNull()
      .references(() => contentEntries.id, { onDelete: "cascade" }),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => contentSnapshots.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [index("published_routes_entry_idx").on(table.entryId)],
);

export const media = sqliteTable(
  "media",
  {
    id: text("id").primaryKey(),
    storageKey: text("storage_key").notNull().unique(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    metadataJson: text("metadata_json").notNull(),
    status: text("status").notNull(),
    lastError: text("last_error"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    check("media_status_check", sql`${table.status} in ('active', 'deleting', 'delete_failed')`),
    check("media_size_check", sql`${table.size} >= 0`),
  ],
);

export const contentMediaReferences = sqliteTable(
  "content_media_references",
  {
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => contentSnapshots.id, { onDelete: "cascade" }),
    sourceKey: text("source_key").notNull(),
    fieldPath: text("field_path").notNull(),
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.sourceKey, table.fieldPath] }),
    index("content_media_references_media_idx").on(table.mediaId),
  ],
);

export const publishedState = sqliteTable(
  "published_state",
  {
    singletonKey: integer("singleton_key").primaryKey(),
    version: integer("version").notNull(),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    check("published_state_singleton_key_check", sql`${table.singletonKey} = 1`),
    check("published_state_version_check", sql`${table.version} >= 0`),
  ],
);

export const outboxEvents = sqliteTable(
  "outbox_events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    payloadJson: text("payload_json").notNull(),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at"),
    processedAt: integer("processed_at"),
    lockedAt: integer("locked_at"),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("outbox_events_available_idx").on(table.processedAt, table.lockedAt, table.availableAt),
    uniqueIndex("outbox_pending_site_build_idx")
      .on(table.type)
      .where(
        sql`${table.type} = 'site.build.requested' and ${table.processedAt} is null and ${table.lockedAt} is null`,
      ),
    check("outbox_events_attempts_check", sql`${table.attempts} >= 0`),
  ],
);

export const siteBuilds = sqliteTable(
  "site_builds",
  {
    id: text("id").primaryKey(),
    reason: text("reason").notNull(),
    status: text("status").notNull(),
    targetVersion: integer("target_version").notNull(),
    publishedSnapshotId: text("published_snapshot_id").references(() => contentSnapshots.id, {
      onDelete: "set null",
    }),
    providerBuildId: text("provider_build_id"),
    requestedBy: text("requested_by").notNull(),
    requestedAt: timestamp("requested_at"),
    startedAt: integer("started_at"),
    completedAt: integer("completed_at"),
    error: text("error"),
    providerStage: text("provider_stage"),
    providerCheckedAt: integer("provider_checked_at"),
    providerCheckAfter: integer("provider_check_after"),
  },
  (table) => [
    index("site_builds_history_idx").on(table.requestedAt, table.id),
    index("site_builds_tracking_idx").on(table.status, table.providerCheckAfter),
    check(
      "site_builds_status_check",
      sql`${table.status} in ('pending', 'running', 'accepted', 'succeeded', 'failed', 'cancelled', 'unknown')`,
    ),
    check("site_builds_target_version_check", sql`${table.targetVersion} >= 0`),
  ],
);

export const idempotencyRecords = sqliteTable(
  "idempotency_records",
  {
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseJson: text("response_json").notNull(),
    createdAt: timestamp("created_at"),
    expiresAt: timestamp("expires_at"),
  },
  (table) => [primaryKey({ columns: [table.scope, table.key] })],
);

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
});

export const rateLimitBuckets = sqliteTable("rate_limit_buckets", {
  bucketKey: text("bucket_key").primaryKey(),
  windowStartedAt: timestamp("window_started_at"),
  requestCount: integer("request_count").notNull(),
  expiresAt: timestamp("expires_at"),
});

/**
 * Batch-unique markers for D1 guarded mutations. A row exists only inside the
 * atomic batch that inserts it; the same batch always deletes it.
 */
export const mutationGuards = sqliteTable("mutation_guards", {
  token: text("token").primaryKey(),
  createdAt: timestamp("created_at"),
});

export const authUsers = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    image: text("image"),
    role: text("role").notNull().default("viewer"),
    disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
    createdAt: authTimestamp("created_at"),
    updatedAt: authTimestamp("updated_at"),
  },
  (table) => [
    check("auth_users_role_check", sql`${table.role} in ('admin', 'editor', 'viewer')`),
    index("auth_users_active_admin_idx")
      .on(table.role)
      .where(sql`${table.role} = 'admin' and ${table.disabled} = 0`),
  ],
);

export const authSessions = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: authTimestamp("expires_at"),
    token: text("token").notNull().unique(),
    createdAt: authTimestamp("created_at"),
    updatedAt: authTimestamp("updated_at"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
  },
  (table) => [index("auth_sessions_user_idx").on(table.userId)],
);

export const authAccounts = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at"),
    refreshTokenExpiresAt: integer("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: authTimestamp("created_at"),
    updatedAt: authTimestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("auth_accounts_provider_account_idx").on(table.providerId, table.accountId),
    index("auth_accounts_user_idx").on(table.userId),
  ],
);

export const authVerifications = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: authTimestamp("expires_at"),
  createdAt: authTimestamp("created_at"),
  updatedAt: authTimestamp("updated_at"),
});

/** Tables supplied to Better Auth's Drizzle adapter under its canonical names. */
export const betterAuthSchema = Object.freeze({
  account: authAccounts,
  session: authSessions,
  user: authUsers,
  verification: authVerifications,
});

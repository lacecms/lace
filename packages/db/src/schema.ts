import { sql } from "drizzle-orm";
import {
  check,
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  real,
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
    publicProjectionHash: text("public_projection_hash"),
    publicProjectionSourceHash: text("public_projection_source_hash"),
    /** Canonical structure of the last successful sync; valid only for `structureJsonHash`. */
    structureJson: text("structure_json"),
    structureJsonHash: text("structure_json_hash"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    check("content_models_kind_check", sql`${table.kind} in ('page', 'collection', 'global')`),
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
    /** The normalized SEO group as a JSON object, or NULL when the snapshot has none. */
    seoJson: text("seo_json"),
    schemaVersion: integer("schema_version").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    updatedBy: text("updated_by").notNull(),
  },
  (table) => [
    index("content_snapshots_entry_idx").on(table.entryId),
    index("content_snapshots_title_prefix_idx").on(sql`${table.title} collate nocase`, table.id),
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
    // Block envelope (CE6A): presentation values outside the block data.
    anchor: text("anchor"),
    className: text("class_name"),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    settingsJson: text("settings_json").notNull().default("{}"),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.blockKey] }),
    index("content_blocks_snapshot_position_idx").on(table.snapshotId, table.position),
    uniqueIndex("content_blocks_snapshot_anchor_idx")
      .on(table.snapshotId, table.anchor)
      .where(sql`${table.anchor} is not null`),
    check("content_blocks_position_check", sql`${table.position} > 0`),
    check("content_blocks_schema_version_check", sql`${table.schemaVersion} > 0`),
    check("content_blocks_hidden_check", sql`${table.hidden} in (0, 1)`),
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
    alt: text("alt"),
    caption: text("caption"),
    focalX: real("focal_x"),
    focalY: real("focal_y"),
    status: text("status").notNull(),
    lastError: text("last_error"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    check("media_status_check", sql`${table.status} in ('active', 'deleting', 'delete_failed')`),
    check("media_size_check", sql`${table.size} >= 0`),
    // Migration 0006 adds these as column checks; SQLite enforces both forms identically.
    check("media_alt_length_check", sql`${table.alt} is null or length(${table.alt}) <= 1000`),
    check(
      "media_caption_length_check",
      sql`${table.caption} is null or length(${table.caption}) <= 2000`,
    ),
    check(
      "media_focal_x_range_check",
      sql`${table.focalX} is null or (${table.focalX} >= 0 and ${table.focalX} <= 1)`,
    ),
    check(
      "media_focal_y_range_check",
      sql`${table.focalY} is null or (${table.focalY} >= 0 and ${table.focalY} <= 1)`,
    ),
    check(
      "media_focal_point_pair_check",
      sql`(${table.focalX} is null) = (${table.focalY} is null)`,
    ),
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

/** Only the source has a foreign key: removed destinations retain incoming IDs. */
export const contentEntryLinkReferences = sqliteTable(
  "content_entry_link_references",
  {
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => contentSnapshots.id, { onDelete: "cascade" }),
    sourceKey: text("source_key").notNull(),
    area: text("area", { enum: ["fields", "data"] }).notNull(),
    fieldPath: text("field_path").notNull(),
    targetEntryId: text("target_entry_id").notNull(),
    delivered: integer("delivered", { mode: "boolean" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.sourceKey, table.area, table.fieldPath] }),
    index("content_entry_link_references_target_idx").on(
      table.targetEntryId,
      table.snapshotId,
      table.sourceKey,
      table.area,
      table.fieldPath,
    ),
    check("content_entry_link_references_area_check", sql`${table.area} in ('fields', 'data')`),
    check("content_entry_link_references_delivery_check", sql`${table.delivered} in (0, 1)`),
    check("content_entry_link_references_path_check", sql`substr(${table.fieldPath}, 1, 1) = '/'`),
    check(
      "content_entry_link_references_source_check",
      sql`(${table.area} = 'fields' and ${table.sourceKey} = '$fields') or (${table.area} = 'data' and substr(${table.sourceKey}, 1, 1) <> '$')`,
    ),
  ],
);

/** One conservative concurrency version for the complete internal-link graph. */
export const contentLinkState = sqliteTable(
  "content_link_state",
  {
    singletonKey: integer("singleton_key").primaryKey(),
    revision: integer("revision").notNull(),
  },
  (table) => [
    check("content_link_state_singleton_check", sql`${table.singletonKey} = 1`),
    check(
      "content_link_state_revision_check",
      sql`${table.revision} >= 0 and ${table.revision} <= 9007199254740991`,
    ),
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

export const authVerifications = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: authTimestamp("expires_at"),
    createdAt: authTimestamp("created_at"),
    updatedAt: authTimestamp("updated_at"),
  },
  (table) => [
    index("auth_verifications_identifier_created_idx").on(table.identifier, table.createdAt),
    index("auth_verifications_expiry_idx").on(table.expiresAt),
  ],
);

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

/** OAuth provider 1.7.3 schema, reviewed and checked in; never generated at runtime. */
export const oauthClient = sqliteTable(
  "oauth_clients",
  {
    id: text("id").notNull().primaryKey(),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    clientDiscoveryId: text("client_discovery_id"),
    disabled: integer("disabled", { mode: "boolean" }).default(false),
    skipConsent: integer("skip_consent", { mode: "boolean" }),
    enableEndSession: integer("enable_end_session", { mode: "boolean" }),
    subjectType: text("subject_type"),
    scopes: text("scopes"),
    clientCredentialsScopes: text("client_credentials_scopes").default("[]"),
    userId: text("user_id").references(() => authUsers.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts"),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris").notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris"),
    backchannelLogoutUri: text("backchannel_logout_uri"),
    backchannelLogoutSessionRequired: integer("backchannel_logout_session_required", {
      mode: "boolean",
    }),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    applicationType: text("application_type"),
    jwks: text("jwks"),
    jwksUri: text("jwks_uri"),
    grantTypes: text("grant_types"),
    responseTypes: text("response_types"),
    requirePKCE: integer("require_p_k_c_e", { mode: "boolean" }),
    dpopBoundAccessTokens: integer("dpop_bound_access_tokens", { mode: "boolean" }).default(false),
    referenceId: text("reference_id"),
    metadata: text("metadata"),
  },
  (table) => [
    index("oauth_clients_user_id_idx").on(table.userId),
    index("oauth_clients_created_idx").on(table.createdAt),
    index("oauth_clients_client_user_idx").on(table.clientId, table.userId),
  ],
);

export const oauthResource = sqliteTable(
  "oauth_resources",
  {
    id: text("id").notNull().primaryKey(),
    identifier: text("identifier").notNull().unique(),
    name: text("name").notNull(),
    accessTokenTtl: integer("access_token_ttl"),
    refreshTokenTtl: integer("refresh_token_ttl"),
    signingAlgorithm: text("signing_algorithm"),
    signingKeyId: text("signing_key_id"),
    allowedScopes: text("allowed_scopes"),
    customClaims: text("custom_claims"),
    dpopBoundAccessTokensRequired: integer("dpop_bound_access_tokens_required", {
      mode: "boolean",
    }).default(false),
    disabled: integer("disabled", { mode: "boolean" }).default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
    policyVersion: integer("policy_version").default(1),
    metadata: text("metadata"),
  },
  (table) => [index("oauth_resources_created_idx").on(table.createdAt)],
);

export const oauthClientResource = sqliteTable(
  "oauth_client_resources",
  {
    id: text("id").notNull().primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: "cascade" }),
    metadata: text("metadata"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("oauth_client_resources_client_id_idx").on(table.clientId),
    index("oauth_client_resources_resource_id_idx").on(table.resourceId),
    index("oauth_client_resources_created_idx").on(table.createdAt),
    uniqueIndex("oauth_client_resources_pair_idx").on(table.clientId, table.resourceId),
  ],
);

export const oauthRefreshToken = sqliteTable(
  "oauth_refresh_tokens",
  {
    id: text("id").notNull().primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId),
    sessionId: text("session_id").references(() => authSessions.id, { onDelete: "set null" }),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources"),
    requestedUserInfoClaims: text("requested_user_info_claims"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
    revoked: integer("revoked", { mode: "timestamp_ms" }),
    rotatedAt: integer("rotated_at", { mode: "timestamp_ms" }),
    rotationReplayResponse: text("rotation_replay_response"),
    rotationReplayExpiresAt: integer("rotation_replay_expires_at", { mode: "timestamp_ms" }),
    authTime: integer("auth_time", { mode: "timestamp_ms" }),
    confirmation: text("confirmation"),
    scopes: text("scopes").notNull(),
  },
  (table) => [
    index("oauth_refresh_tokens_client_id_idx").on(table.clientId),
    index("oauth_refresh_tokens_session_id_idx").on(table.sessionId),
    index("oauth_refresh_tokens_user_id_idx").on(table.userId),
    index("oauth_refresh_tokens_authorization_code_id_idx").on(table.authorizationCodeId),
    index("oauth_refresh_tokens_expiry_idx").on(table.expiresAt),
    index("oauth_refresh_tokens_client_user_idx").on(table.clientId, table.userId),
  ],
);

export const oauthAccessToken = sqliteTable(
  "oauth_access_tokens",
  {
    id: text("id").notNull().primaryKey(),
    token: text("token").unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId),
    sessionId: text("session_id").references(() => authSessions.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => authUsers.id),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources"),
    requestedUserInfoClaims: text("requested_user_info_claims"),
    refreshId: text("refresh_id").references(() => oauthRefreshToken.id),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
    revoked: integer("revoked", { mode: "timestamp_ms" }),
    confirmation: text("confirmation"),
    scopes: text("scopes").notNull(),
  },
  (table) => [
    index("oauth_access_tokens_client_id_idx").on(table.clientId),
    index("oauth_access_tokens_session_id_idx").on(table.sessionId),
    index("oauth_access_tokens_user_id_idx").on(table.userId),
    index("oauth_access_tokens_authorization_code_id_idx").on(table.authorizationCodeId),
    index("oauth_access_tokens_refresh_id_idx").on(table.refreshId),
    index("oauth_access_tokens_expiry_idx").on(table.expiresAt),
    index("oauth_access_tokens_client_user_idx").on(table.clientId, table.userId),
  ],
);

export const oauthConsent = sqliteTable(
  "oauth_consents",
  {
    id: text("id").notNull().primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId),
    userId: text("user_id").references(() => authUsers.id),
    referenceId: text("reference_id"),
    resources: text("resources"),
    requestedUserInfoClaims: text("requested_user_info_claims"),
    scopes: text("scopes").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("oauth_consents_client_id_idx").on(table.clientId),
    index("oauth_consents_user_id_idx").on(table.userId),
    index("oauth_consents_created_idx").on(table.createdAt),
    index("oauth_consents_client_user_idx").on(table.clientId, table.userId),
  ],
);

export const oauthClientAssertion = sqliteTable(
  "oauth_client_assertions",
  {
    id: text("id").notNull().primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("oauth_client_assertions_expiry_idx").on(table.expiresAt)],
);

/** Durable account-wide OAuth invalidation; absence is generation zero. */
export const oauthUserAuthority = sqliteTable(
  "oauth_user_authority",
  {
    userId: text("user_id")
      .notNull()
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    generation: integer("generation").notNull().default(0),
    invalidationPending: integer("invalidation_pending", { mode: "boolean" })
      .notNull()
      .default(false),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [check("oauth_user_authority_generation_check", sql`${table.generation} >= 0`)],
);

/** One consent-bound connection and refresh lineage; revoked generations never reopen. */
export const oauthGrants = sqliteTable(
  "oauth_grants",
  {
    id: text("id").notNull().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId),
    resource: text("resource").notNull(),
    consentId: text("consent_id"),
    scopesJson: text("scopes_json").notNull(),
    generation: integer("generation").notNull().default(0),
    userGeneration: integer("user_generation").notNull(),
    createdAt: timestamp("created_at"),
    expiresAt: timestamp("expires_at"),
    lastUsedAt: integer("last_used_at"),
    revokedAt: integer("revoked_at"),
  },
  (table) => [
    index("oauth_grants_user_created_idx").on(table.userId, table.createdAt, table.id),
    index("oauth_grants_client_user_idx").on(table.clientId, table.userId),
    index("oauth_grants_expiry_idx").on(table.expiresAt),
    check(
      "oauth_grants_generations_check",
      sql`${table.generation} >= 0 and ${table.userGeneration} >= 0`,
    ),
    check("oauth_grants_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

/** Single-consumption journal also retains refresh replay tombstones. */
export const oauthIssuances = sqliteTable(
  "oauth_issuances",
  {
    id: text("id").notNull().primaryKey(),
    grantId: text("grant_id")
      .notNull()
      .references(() => oauthGrants.id),
    kind: text("kind").notNull(),
    inputHash: text("input_hash").notNull(),
    parentProviderId: text("parent_provider_id"),
    familyGeneration: integer("family_generation").notNull(),
    userGeneration: integer("user_generation").notNull(),
    state: text("state").notNull().default("pending"),
    createdAt: timestamp("created_at"),
    pendingExpiresAt: timestamp("pending_expires_at"),
    retainUntil: timestamp("retain_until"),
    committedAt: integer("committed_at"),
  },
  (table) => [
    uniqueIndex("oauth_issuances_input_idx").on(table.kind, table.inputHash),
    index("oauth_issuances_grant_idx").on(table.grantId),
    index("oauth_issuances_pending_idx").on(table.state, table.pendingExpiresAt),
    index("oauth_issuances_retention_idx").on(table.retainUntil),
    check("oauth_issuances_kind_check", sql`${table.kind} in ('code', 'refresh')`),
    check(
      "oauth_issuances_state_check",
      sql`${table.state} in ('pending', 'committed', 'aborted')`,
    ),
    check(
      "oauth_issuances_generations_check",
      sql`${table.familyGeneration} >= 0 and ${table.userGeneration} >= 0`,
    ),
    check(
      "oauth_issuances_commit_check",
      sql`(${table.state} = 'committed') = (${table.committedAt} is not null)`,
    ),
  ],
);

/** Provider-row lifecycle bindings survive provider cleanup; no plaintext credentials. */
export const oauthTokenBindings = sqliteTable(
  "oauth_token_bindings",
  {
    kind: text("kind").notNull(),
    providerId: text("provider_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    grantId: text("grant_id")
      .notNull()
      .references(() => oauthGrants.id),
    issuanceId: text("issuance_id")
      .notNull()
      .references(() => oauthIssuances.id),
    familyGeneration: integer("family_generation").notNull(),
    userGeneration: integer("user_generation").notNull(),
    expiresAt: timestamp("expires_at"),
  },
  (table) => [
    primaryKey({ columns: [table.kind, table.providerId] }),
    uniqueIndex("oauth_token_bindings_hash_idx").on(table.kind, table.tokenHash),
    index("oauth_token_bindings_grant_idx").on(table.grantId),
    index("oauth_token_bindings_issuance_idx").on(table.issuanceId),
    index("oauth_token_bindings_expiry_idx").on(table.expiresAt),
    check("oauth_token_bindings_kind_check", sql`${table.kind} in ('access', 'refresh')`),
  ],
);
/** Tables supplied to Better Auth's Drizzle adapter under its canonical names. */
export const betterAuthSchema = Object.freeze({
  account: authAccounts,
  session: authSessions,
  user: authUsers,
  verification: authVerifications,
  oauthClient,
  oauthResource,
  oauthClientResource,
  oauthRefreshToken,
  oauthAccessToken,
  oauthConsent,
  oauthClientAssertion,
});

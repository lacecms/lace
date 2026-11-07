import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { timestamp } from "./columns.js";
import { authUsers, authSessions } from "./auth.js";

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

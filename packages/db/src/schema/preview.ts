import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/sqlite-core";
import { authSessions } from "./auth.js";
import { timestamp } from "./columns.js";

/** Identity values intentionally outlive source entries, models and media. */
export const previewGenerations = sqliteTable(
  "preview_generations",
  {
    id: text("id").primaryKey(),
    entryId: text("entry_id").notNull(),
    modelKey: text("model_key").notNull(),
    revision: integer("revision").notNull(),
    path: text("path").notNull(),
    publicVersion: integer("public_version").notNull(),
    captureEpoch: integer("capture_epoch").notNull().default(0),
    configuration: text("configuration").notNull(),
    sourceCommit: text("source_commit").notNull(),
    executor: text("executor").notNull(),
    createdBy: text("created_by").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    state: text("state").notNull(),
    createdAt: timestamp("created_at"),
    overallDeadline: timestamp("overall_deadline"),
    startedAt: integer("started_at"),
    executionDeadline: integer("execution_deadline"),
    runId: text("run_id"),
    readyAt: integer("ready_at"),
    expiresAt: integer("expires_at"),
    endedAt: integer("ended_at"),
    inputSha256: text("input_sha256"),
    inputBytes: integer("input_bytes"),
    outputSha256: text("output_sha256"),
    outputBytes: integer("output_bytes"),
    reason: text("reason"),
    inputPurgedAt: integer("input_purged_at"),
    outputPurgedAt: integer("output_purged_at"),
  },
  (t) => [
    unique("preview_generation_entry_pair").on(t.entryId, t.id),
    uniqueIndex("preview_generation_idempotency_idx").on(t.createdBy, t.idempotencyKey),
    index("preview_generation_entry_state_idx").on(t.entryId, t.state),
    index("preview_generation_model_state_idx").on(t.modelKey, t.state),
    index("preview_generation_deadline_idx").on(t.state, t.overallDeadline, t.id),
    index("preview_generation_execution_idx").on(t.state, t.executionDeadline, t.id),
    index("preview_generation_expiry_idx").on(t.state, t.expiresAt, t.id),
    index("preview_generation_input_cleanup_idx")
      .on(t.state, t.createdAt, t.id)
      .where(sql`${t.inputPurgedAt} is null`),
    index("preview_generation_output_cleanup_idx")
      .on(t.state, t.createdAt, t.id)
      .where(sql`${t.outputPurgedAt} is null`),
    index("preview_generation_retention_idx")
      .on(t.endedAt, t.id)
      .where(sql`${t.outputPurgedAt} is not null`),
    check("preview_generation_version_check", sql`${t.revision} > 0 and ${t.publicVersion} >= 0`),
    check(
      "preview_generation_state_check",
      sql`${t.state} in ('preparing','dispatched','running','ready','failed','timed_out','invalidated','expired')`,
    ),
  ],
);

export const previewCurrent = sqliteTable(
  "preview_current",
  {
    entryId: text("entry_id").primaryKey(),
    generationId: text("generation_id").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.entryId, t.generationId],
      foreignColumns: [previewGenerations.entryId, previewGenerations.id],
    }).onDelete("cascade"),
  ],
);

export const previewExecutionSlot = sqliteTable(
  "preview_execution_slot",
  {
    singletonKey: integer("singleton_key").primaryKey(),
    generationId: text("generation_id")
      .notNull()
      .unique()
      .references(() => previewGenerations.id, { onDelete: "restrict" }),
  },
  (t) => [check("preview_slot_singleton_check", sql`${t.singletonKey} = 1`)],
);

export const previewTargets = sqliteTable("preview_targets", {
  generationId: text("generation_id")
    .primaryKey()
    .references(() => previewGenerations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug"),
  fieldsJson: text("fields_json").notNull(),
  seoJson: text("seo_json"),
  linksJson: text("links_json").notNull().default("[]"),
});

export const previewTargetBlocks = sqliteTable(
  "preview_target_blocks",
  {
    generationId: text("generation_id")
      .notNull()
      .references(() => previewTargets.generationId, { onDelete: "cascade" }),
    blockKey: text("block_key").notNull(),
    blockType: text("block_type").notNull(),
    position: integer("position").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    dataJson: text("data_json").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    anchor: text("anchor"),
    className: text("class_name"),
    settingsJson: text("settings_json").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.generationId, t.blockKey] }),
    index("preview_target_blocks_position_idx").on(t.generationId, t.position),
  ],
);

export const previewMediaDependencies = sqliteTable(
  "preview_media_dependencies",
  {
    generationId: text("generation_id")
      .notNull()
      .references(() => previewGenerations.id, { onDelete: "cascade" }),
    mediaId: text("media_id").notNull(),
    target: integer("target", { mode: "boolean" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.generationId, t.mediaId] }),
    index("preview_media_dependency_lookup_idx").on(t.mediaId, t.generationId),
    check("preview_media_dependency_target_check", sql`${t.target} in (0, 1)`),
  ],
);

export const previewRunnerCredentials = sqliteTable(
  "preview_runner_credentials",
  {
    generationId: text("generation_id")
      .primaryKey()
      .references(() => previewGenerations.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at"),
    revokedAt: integer("revoked_at"),
  },
  (t) => [index("preview_runner_credential_expiry_idx").on(t.expiresAt, t.generationId)],
);

export const previewHandoffs = sqliteTable(
  "preview_handoffs",
  {
    id: text("id").primaryKey(),
    browserHash: text("browser_hash").notNull(),
    codeHash: text("code_hash").unique(),
    adminOrigin: text("admin_origin").notNull(),
    previewOrigin: text("preview_origin").notNull(),
    returnPath: text("return_path").notNull(),
    generationId: text("generation_id")
      .notNull()
      .references(() => previewGenerations.id, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => authSessions.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at"),
    consumedAt: integer("consumed_at"),
  },
  (t) => [
    index("preview_handoff_expiry_idx").on(t.expiresAt, t.id),
    index("preview_handoff_generation_idx").on(t.generationId),
    index("preview_handoff_parent_idx").on(t.sessionId),
  ],
);

export const previewSessions = sqliteTable(
  "preview_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => authSessions.id, { onDelete: "cascade" }),
    origin: text("origin").notNull(),
    expiresAt: timestamp("expires_at"),
  },
  (t) => [
    index("preview_session_parent_idx").on(t.sessionId),
    index("preview_session_expiry_idx").on(t.expiresAt, t.tokenHash),
  ],
);

/** Counts in-place updates of published snapshots before final sync bumps the public version. */
export const previewCaptureState = sqliteTable(
  "preview_capture_state",
  {
    singletonKey: integer("singleton_key").primaryKey(),
    epoch: integer("epoch").notNull(),
  },
  (t) => [
    check("preview_capture_state_singleton_check", sql`${t.singletonKey} = 1`),
    check("preview_capture_state_epoch_check", sql`${t.epoch} >= 0`),
  ],
);

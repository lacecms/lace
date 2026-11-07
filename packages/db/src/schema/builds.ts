import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { timestamp } from "./columns.js";
import { contentSnapshots } from "./content.js";

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

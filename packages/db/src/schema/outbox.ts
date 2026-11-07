import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { timestamp } from "./columns.js";

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

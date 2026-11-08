import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { timestamp } from "./columns.js";
import { contentEntries, contentSnapshots } from "./content.js";

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

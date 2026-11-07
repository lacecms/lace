import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { contentSnapshots } from "./content.js";

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

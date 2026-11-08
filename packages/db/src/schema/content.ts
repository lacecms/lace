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
import { timestamp } from "./columns.js";

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

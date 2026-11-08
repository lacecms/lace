import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { timestamp } from "./columns.js";
import { contentSnapshots } from "./content.js";

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
    sha256: text("sha256"),
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
    // Migration 0015 adds the hash as a column check; `NULL` for media uploaded before it.
    check(
      "media_sha256_check",
      sql`${table.sha256} is null or (length(${table.sha256}) = 64 and ${table.sha256} not glob '*[^0-9a-f]*')`,
    ),
    index("media_sha256_idx").on(table.sha256),
  ],
);

export const mediaTags = sqliteTable(
  "media_tags",
  {
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.mediaId, table.tag] }),
    index("media_tags_tag_media_idx").on(table.tag, table.mediaId),
    check(
      "media_tags_tag_check",
      sql`length(${table.tag}) between 1 and 40 and ${table.tag} not glob '*[^a-z0-9-]*' and instr(${table.tag}, char(0)) = 0`,
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

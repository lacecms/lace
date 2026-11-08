import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { timestamp } from "./columns.js";

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

/**
 * Batch-unique markers for D1 guarded mutations. A row exists only inside the
 * atomic batch that inserts it; the same batch always deletes it.
 */
export const mutationGuards = sqliteTable("mutation_guards", {
  token: text("token").primaryKey(),
  createdAt: timestamp("created_at"),
});

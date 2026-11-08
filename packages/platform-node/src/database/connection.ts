import { RuntimeConfigurationError } from "@lacecms/application";
import { appliedMigrationQuery, uncheckedNodeMigrations } from "@lacecms/db";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface NodeDatabase {
  readonly connection: Database.Database;
  readonly drizzle: ReturnType<typeof drizzle>;
}

export interface AppliedMigration {
  readonly createdAt: number;
  readonly hash: string;
}

/** Opens a Node SQLite connection with the required per-connection invariants. */
export function openNodeDatabase(databasePath: string): NodeDatabase {
  const connection = new Database(databasePath);
  connection.pragma("foreign_keys = ON");
  connection.pragma("journal_mode = WAL");
  return { connection, drizzle: drizzle(connection) };
}

const migrationFolder = fileURLToPath(new URL("../drizzle", import.meta.resolve("@lacecms/db")));

export function listAppliedMigrations(connection: Database.Database): readonly AppliedMigration[] {
  const records = connection.prepare(appliedMigrationQuery).all() as readonly {
    readonly created_at: number;
    readonly hash: string;
  }[];
  return records.map(({ created_at: createdAt, hash }) => ({ createdAt, hash }));
}

/** A database whose ledger records migrations that are not checked in. */
export class UnsupportedDatabaseError extends RuntimeConfigurationError {
  public constructor() {
    super(
      "The database was migrated by a Lace engine older than the baseline migration and cannot be upgraded; recreate it (export its content first if you need to keep it).",
    );
    this.name = "UnsupportedDatabaseError";
  }
}

/** Refuses a pre-baseline ledger through a read-only connection, before any write. */
function assertBaselineLedger(databasePath: string): void {
  if (databasePath === ":memory:" || !existsSync(databasePath)) return;
  const probe = new Database(databasePath, { fileMustExist: true, readonly: true });
  try {
    const ledger = probe
      .prepare("select 1 from sqlite_master where type = 'table' and name = '__drizzle_migrations'")
      .get();
    if (ledger === undefined) return;
    const createdAt = (
      probe.prepare(appliedMigrationQuery).all() as readonly { readonly created_at: number }[]
    ).map((row) => Number(row.created_at));
    if (uncheckedNodeMigrations(createdAt).length > 0) throw new UnsupportedDatabaseError();
  } finally {
    probe.close();
  }
}

/** Applies checked-in forward migrations and returns their installed versions. */
export function migrateNodeDatabase(databasePath: string): readonly AppliedMigration[] {
  assertBaselineLedger(databasePath);
  if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
  const database = openNodeDatabase(databasePath);
  try {
    // SQLite's documented table-rebuild procedure: a rebuild of a referenced table
    // cannot commit under deferred enforcement on Node SQLite, so the migrator's
    // own connection suspends foreign keys and verifies integrity before
    // restoring them. Application connections always keep them on.
    database.connection.pragma("foreign_keys = OFF");
    migrate(database.drizzle, { migrationsFolder: migrationFolder });
    const violations = database.connection.pragma("foreign_key_check") as readonly unknown[];
    if (violations.length > 0) {
      throw new Error(
        `Database migration left ${violations.length} foreign-key violation(s); restore the backup taken before migrating.`,
      );
    }
    database.connection.pragma("foreign_keys = ON");
    return listAppliedMigrations(database.connection);
  } finally {
    database.connection.close();
  }
}

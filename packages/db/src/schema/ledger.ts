import { checkedInMigrations } from "./migrations.js";

const checkedInCreatedAt = new Set(checkedInMigrations.map((migration) => migration.createdAt));
const checkedInNames = new Set(checkedInMigrations.map((migration) => migration.name));

/**
 * Node ledger timestamps (`__drizzle_migrations.created_at`) that no checked-in
 * migration has. Any result means an engine older than the baseline created the
 * database, which is refused rather than upgraded.
 */
export function uncheckedNodeMigrations(createdAt: readonly number[]): readonly number[] {
  return createdAt.filter((value) => !checkedInCreatedAt.has(value));
}

/** D1 ledger names (`d1_migrations.name`) that no checked-in migration has. */
export function uncheckedD1Migrations(names: readonly string[]): readonly string[] {
  return names.filter((name) => !checkedInNames.has(name));
}

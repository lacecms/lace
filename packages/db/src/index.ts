export const packageName = "@lacecms/db";

export const appliedMigrationQuery =
  "select hash, created_at from __drizzle_migrations order by created_at asc";

/** Kept in lockstep with drizzle/meta/_journal.json by the migration inventory test. */
export const checkedInMigrations = Object.freeze([
  { createdAt: 1789240330790, name: "0000_exotic_tarantula.sql" },
  { createdAt: 1789240330791, name: "0001_security_controls.sql" },
  { createdAt: 1790624606153, name: "0002_mutation_guards.sql" },
  { createdAt: 1791238354782, name: "0003_site_build_outcomes.sql" },
]);

export interface AppliedMigration {
  readonly createdAt: number;
  readonly hash: string;
}

export * from "./schema.js";
export * from "./sql-content.js";

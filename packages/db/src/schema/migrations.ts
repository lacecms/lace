export const appliedMigrationQuery =
  "select hash, created_at from __drizzle_migrations order by created_at asc";

/** Kept in lockstep with drizzle/meta/_journal.json by the migration inventory test. */
export const checkedInMigrations = Object.freeze([
  { createdAt: 1794149823599, name: "0000_baseline.sql" },
]);

export interface AppliedMigration {
  readonly createdAt: number;
  readonly hash: string;
}

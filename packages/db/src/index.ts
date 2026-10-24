export const packageName = "@lacecms/db";

export const appliedMigrationQuery =
  "select hash, created_at from __drizzle_migrations order by created_at asc";

/** Kept in lockstep with drizzle/meta/_journal.json by the migration inventory test. */
export const checkedInMigrations = Object.freeze([
  { createdAt: 1789240330790, name: "0000_exotic_tarantula.sql" },
  { createdAt: 1789240330791, name: "0001_security_controls.sql" },
  { createdAt: 1790624606153, name: "0002_mutation_guards.sql" },
  { createdAt: 1791238354782, name: "0003_site_build_outcomes.sql" },
  { createdAt: 1791633627420, name: "0004_account_tokens.sql" },
  { createdAt: 1791647444998, name: "0005_content_model_structure.sql" },
  { createdAt: 1791731667455, name: "0006_media_descriptive_metadata.sql" },
  { createdAt: 1791750744187, name: "0007_content_model_global_kind.sql" },
  { createdAt: 1791756612246, name: "0008_content_snapshot_seo.sql" },
  { createdAt: 1791794161634, name: "0009_content_block_envelope.sql" },
  { createdAt: 1792774203883, name: "0010_internal_url_links.sql" },
]);

export interface AppliedMigration {
  readonly createdAt: number;
  readonly hash: string;
}

export * from "./schema.js";
export * from "./sql-content.js";
export * from "./sql-internal-links.js";
export * from "./internal-link-reader.js";

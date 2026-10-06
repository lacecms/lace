-- Truthful site-build outcomes (Step 33D). Shared by Node SQLite and D1.
-- Nothing references site_builds, so the rebuild needs no foreign-key pragma.
CREATE TABLE `__new_site_builds` (
	`id` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`target_version` integer NOT NULL,
	`published_snapshot_id` text,
	`provider_build_id` text,
	`requested_by` text NOT NULL,
	`requested_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`error` text,
	`provider_stage` text,
	`provider_checked_at` integer,
	`provider_check_after` integer,
	FOREIGN KEY (`published_snapshot_id`) REFERENCES `content_snapshots`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "site_builds_status_check" CHECK("status" in ('pending', 'running', 'accepted', 'succeeded', 'failed', 'cancelled', 'unknown')),
	CONSTRAINT "site_builds_target_version_check" CHECK("target_version" >= 0)
);
--> statement-breakpoint
-- No runtime tracked provider deployments before this migration, so a `running`
-- row only ever meant provider acceptance. Deploy-hook `succeeded` rows without a
-- provider ID did not prove publication either; they exist only on D1, which is
-- recognised by the absence of the Drizzle migrator ledger that Node always
-- creates before applying migrations. Node builder `succeeded` rows are proven.
INSERT INTO `__new_site_builds`("id", "reason", "status", "target_version", "published_snapshot_id", "provider_build_id", "requested_by", "requested_at", "started_at", "completed_at", "error", "provider_stage", "provider_checked_at", "provider_check_after") SELECT "id", "reason", CASE WHEN "status" = 'running' THEN 'accepted' WHEN "status" = 'succeeded' AND "provider_build_id" IS NULL AND NOT EXISTS (SELECT 1 FROM sqlite_master WHERE "type" = 'table' AND "name" = '__drizzle_migrations') THEN 'accepted' ELSE "status" END, "target_version", "published_snapshot_id", "provider_build_id", "requested_by", "requested_at", "started_at", CASE WHEN "status" = 'running' THEN coalesce("completed_at", "started_at", "requested_at") ELSE "completed_at" END, "error", NULL, NULL, NULL FROM `site_builds`;
--> statement-breakpoint
DROP TABLE `site_builds`;
--> statement-breakpoint
ALTER TABLE `__new_site_builds` RENAME TO `site_builds`;
--> statement-breakpoint
CREATE INDEX `site_builds_history_idx` ON `site_builds` (`requested_at`,`id`);
--> statement-breakpoint
CREATE INDEX `site_builds_tracking_idx` ON `site_builds` (`status`,`provider_check_after`);

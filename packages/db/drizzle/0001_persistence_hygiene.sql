CREATE INDEX `content_entries_draft_snapshot_idx` ON `content_entries` (`draft_snapshot_id`);--> statement-breakpoint
CREATE INDEX `content_entries_published_snapshot_idx` ON `content_entries` (`published_snapshot_id`);--> statement-breakpoint
CREATE INDEX `published_routes_snapshot_idx` ON `published_routes` (`snapshot_id`);--> statement-breakpoint
CREATE INDEX `site_builds_published_snapshot_idx` ON `site_builds` (`published_snapshot_id`);--> statement-breakpoint
CREATE INDEX `idempotency_records_expiry_idx` ON `idempotency_records` (`expires_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `api_tokens_active_lookup_idx` ON `api_tokens` (`token_hash`) WHERE "api_tokens"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `rate_limit_buckets_expiry_idx` ON `rate_limit_buckets` (`expires_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `setup_tokens_expiry_idx` ON `setup_tokens` (`expires_at`);
CREATE TABLE `preview_current` (
	`entry_id` text PRIMARY KEY NOT NULL,
	`generation_id` text NOT NULL,
	FOREIGN KEY (`entry_id`,`generation_id`) REFERENCES `preview_generations`(`entry_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `preview_execution_slot` (
	`singleton_key` integer PRIMARY KEY NOT NULL,
	`generation_id` text NOT NULL,
	FOREIGN KEY (`generation_id`) REFERENCES `preview_generations`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "preview_slot_singleton_check" CHECK("preview_execution_slot"."singleton_key" = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preview_execution_slot_generation_id_unique` ON `preview_execution_slot` (`generation_id`);--> statement-breakpoint
CREATE TABLE `preview_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`model_key` text NOT NULL,
	`revision` integer NOT NULL,
	`path` text NOT NULL,
	`public_version` integer NOT NULL,
	`configuration` text NOT NULL,
	`source_commit` text NOT NULL,
	`executor` text NOT NULL,
	`created_by` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`overall_deadline` integer NOT NULL,
	`started_at` integer,
	`execution_deadline` integer,
	`run_id` text,
	`ready_at` integer,
	`expires_at` integer,
	`ended_at` integer,
	`input_sha256` text,
	`input_bytes` integer,
	`output_sha256` text,
	`output_bytes` integer,
	`reason` text,
	`input_purged_at` integer,
	`output_purged_at` integer,
	CONSTRAINT "preview_generation_version_check" CHECK("preview_generations"."revision" > 0 and "preview_generations"."public_version" >= 0),
	CONSTRAINT "preview_generation_state_check" CHECK("preview_generations"."state" in ('preparing','dispatched','running','ready','failed','timed_out','invalidated','expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preview_generation_idempotency_idx` ON `preview_generations` (`created_by`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `preview_generation_entry_state_idx` ON `preview_generations` (`entry_id`,`state`);--> statement-breakpoint
CREATE INDEX `preview_generation_model_state_idx` ON `preview_generations` (`model_key`,`state`);--> statement-breakpoint
CREATE INDEX `preview_generation_deadline_idx` ON `preview_generations` (`state`,`overall_deadline`,`id`);--> statement-breakpoint
CREATE INDEX `preview_generation_execution_idx` ON `preview_generations` (`state`,`execution_deadline`,`id`);--> statement-breakpoint
CREATE INDEX `preview_generation_expiry_idx` ON `preview_generations` (`state`,`expires_at`,`id`);--> statement-breakpoint
CREATE INDEX `preview_generation_input_cleanup_idx` ON `preview_generations` (`state`,`created_at`,`id`) WHERE "preview_generations"."input_purged_at" is null;--> statement-breakpoint
CREATE INDEX `preview_generation_output_cleanup_idx` ON `preview_generations` (`state`,`created_at`,`id`) WHERE "preview_generations"."output_purged_at" is null;--> statement-breakpoint
CREATE INDEX `preview_generation_retention_idx` ON `preview_generations` (`ended_at`,`id`) WHERE "preview_generations"."output_purged_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `preview_generation_entry_pair` ON `preview_generations` (`entry_id`,`id`);--> statement-breakpoint
CREATE TABLE `preview_handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`browser_hash` text NOT NULL,
	`code_hash` text,
	`admin_origin` text NOT NULL,
	`preview_origin` text NOT NULL,
	`return_path` text NOT NULL,
	`generation_id` text NOT NULL,
	`session_id` text,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	FOREIGN KEY (`generation_id`) REFERENCES `preview_generations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preview_handoffs_code_hash_unique` ON `preview_handoffs` (`code_hash`);--> statement-breakpoint
CREATE INDEX `preview_handoff_expiry_idx` ON `preview_handoffs` (`expires_at`,`id`);--> statement-breakpoint
CREATE INDEX `preview_handoff_generation_idx` ON `preview_handoffs` (`generation_id`);--> statement-breakpoint
CREATE INDEX `preview_handoff_parent_idx` ON `preview_handoffs` (`session_id`);--> statement-breakpoint
CREATE TABLE `preview_media_dependencies` (
	`generation_id` text NOT NULL,
	`media_id` text NOT NULL,
	`target` integer NOT NULL,
	PRIMARY KEY(`generation_id`, `media_id`),
	FOREIGN KEY (`generation_id`) REFERENCES `preview_generations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "preview_media_dependency_target_check" CHECK("preview_media_dependencies"."target" in (0, 1))
);
--> statement-breakpoint
CREATE INDEX `preview_media_dependency_lookup_idx` ON `preview_media_dependencies` (`media_id`,`generation_id`);--> statement-breakpoint
CREATE TABLE `preview_runner_credentials` (
	`generation_id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`generation_id`) REFERENCES `preview_generations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preview_runner_credentials_token_hash_unique` ON `preview_runner_credentials` (`token_hash`);--> statement-breakpoint
CREATE INDEX `preview_runner_credential_expiry_idx` ON `preview_runner_credentials` (`expires_at`,`generation_id`);--> statement-breakpoint
CREATE TABLE `preview_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`origin` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `preview_session_parent_idx` ON `preview_sessions` (`session_id`);--> statement-breakpoint
CREATE INDEX `preview_session_expiry_idx` ON `preview_sessions` (`expires_at`,`token_hash`);--> statement-breakpoint
CREATE TABLE `preview_target_blocks` (
	`generation_id` text NOT NULL,
	`block_key` text NOT NULL,
	`block_type` text NOT NULL,
	`position` integer NOT NULL,
	`schema_version` integer NOT NULL,
	`data_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`anchor` text,
	`class_name` text,
	`settings_json` text NOT NULL,
	PRIMARY KEY(`generation_id`, `block_key`),
	FOREIGN KEY (`generation_id`) REFERENCES `preview_targets`(`generation_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `preview_target_blocks_position_idx` ON `preview_target_blocks` (`generation_id`,`position`);--> statement-breakpoint
CREATE TABLE `preview_targets` (
	`generation_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slug` text,
	`fields_json` text NOT NULL,
	`seo_json` text,
	FOREIGN KEY (`generation_id`) REFERENCES `preview_generations`(`id`) ON UPDATE no action ON DELETE cascade
);

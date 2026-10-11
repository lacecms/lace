-- Widens the content-model kind check to accept route-less `global` models. SQLite
-- cannot alter a CHECK, so `content_models` is rebuilt. `content_entries.model_key`
-- references it, and D1 cannot switch foreign keys off: deferral lets D1 accept the
-- drop and rename in its single migration batch. The Node migrator additionally
-- suspends enforcement on its own connection and verifies `foreign_key_check`
-- (docs/database-migrations.md). Every row is copied unchanged.
PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__new_content_models` (
	`key` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`config_version` integer NOT NULL,
	`structure_hash` text NOT NULL,
	`projection_hash` text NOT NULL,
	`structure_json` text,
	`structure_json_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "content_models_kind_check" CHECK("kind" in ('page', 'collection', 'global')),
	CONSTRAINT "content_models_config_version_check" CHECK("config_version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_content_models`("key", "kind", "label", "config_version", "structure_hash", "projection_hash", "structure_json", "structure_json_hash", "created_at", "updated_at") SELECT "key", "kind", "label", "config_version", "structure_hash", "projection_hash", "structure_json", "structure_json_hash", "created_at", "updated_at" FROM `content_models`;--> statement-breakpoint
DROP TABLE `content_models`;--> statement-breakpoint
ALTER TABLE `__new_content_models` RENAME TO `content_models`;--> statement-breakpoint
PRAGMA defer_foreign_keys = off;

CREATE TABLE `content_entry_link_references` (
	`snapshot_id` text NOT NULL,
	`source_key` text NOT NULL,
	`area` text NOT NULL,
	`field_path` text NOT NULL,
	`target_entry_id` text NOT NULL,
	`delivered` integer NOT NULL,
	PRIMARY KEY(`snapshot_id`, `source_key`, `area`, `field_path`),
	FOREIGN KEY (`snapshot_id`) REFERENCES `content_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_entry_link_references_area_check" CHECK("content_entry_link_references"."area" in ('fields', 'data')),
	CONSTRAINT "content_entry_link_references_delivery_check" CHECK("content_entry_link_references"."delivered" in (0, 1)),
	CONSTRAINT "content_entry_link_references_path_check" CHECK(substr("content_entry_link_references"."field_path", 1, 1) = '/'),
	CONSTRAINT "content_entry_link_references_source_check" CHECK(("content_entry_link_references"."area" = 'fields' and "content_entry_link_references"."source_key" = '$fields') or ("content_entry_link_references"."area" = 'data' and substr("content_entry_link_references"."source_key", 1, 1) <> '$'))
);
--> statement-breakpoint
CREATE INDEX `content_entry_link_references_target_idx` ON `content_entry_link_references` (`target_entry_id`,`snapshot_id`,`source_key`,`area`,`field_path`);--> statement-breakpoint
CREATE TABLE `content_link_state` (
	`singleton_key` integer PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	CONSTRAINT "content_link_state_singleton_check" CHECK("content_link_state"."singleton_key" = 1),
	CONSTRAINT "content_link_state_revision_check" CHECK("content_link_state"."revision" >= 0 and "content_link_state"."revision" <= 9007199254740991)
);
--> statement-breakpoint
CREATE INDEX `content_snapshots_title_prefix_idx` ON `content_snapshots` ("title" collate nocase,`id`);
--> statement-breakpoint
INSERT INTO content_link_state (singleton_key, revision) VALUES (1, 0);

ALTER TABLE `content_entry_link_references` ADD COLUMN `purpose` text DEFAULT 'url' NOT NULL
  CONSTRAINT "content_entry_link_references_purpose_check" CHECK("purpose" in ('url', 'reference'));
--> statement-breakpoint
DROP INDEX `content_entry_link_references_target_idx`;
--> statement-breakpoint
CREATE INDEX `content_entry_link_references_target_idx` ON `content_entry_link_references` (`target_entry_id`,`purpose`,`snapshot_id`,`source_key`,`area`,`field_path`);
--> statement-breakpoint
CREATE INDEX `content_entry_link_references_outgoing_idx` ON `content_entry_link_references` (`snapshot_id`,`purpose`,`delivered`,`target_entry_id`);

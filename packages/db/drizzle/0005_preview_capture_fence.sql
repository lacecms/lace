CREATE TABLE `preview_capture_state` (
	`singleton_key` integer PRIMARY KEY NOT NULL,
	`epoch` integer NOT NULL,
	CONSTRAINT "preview_capture_state_singleton_check" CHECK("preview_capture_state"."singleton_key" = 1),
	CONSTRAINT "preview_capture_state_epoch_check" CHECK("preview_capture_state"."epoch" >= 0)
);
--> statement-breakpoint
ALTER TABLE `preview_generations` ADD `capture_epoch` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `preview_targets` ADD `links_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
INSERT INTO preview_capture_state (singleton_key, epoch) VALUES (1, 0);
--> statement-breakpoint
-- Resumable block migration updates snapshot metadata after changing its blocks.
-- Only the currently published snapshot can advance this separate fence.
CREATE TRIGGER preview_count_published_snapshot_update
AFTER UPDATE OF revision, updated_at ON content_snapshots
WHEN EXISTS (
  SELECT 1 FROM content_entries
  WHERE id = NEW.entry_id AND published_snapshot_id = NEW.id
)
BEGIN
  UPDATE preview_capture_state SET epoch = epoch + 1 WHERE singleton_key = 1;
END;

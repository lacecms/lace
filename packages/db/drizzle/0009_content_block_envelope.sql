-- Block envelope (CE6A). Additive on Node SQLite and D1: no rebuild and no
-- backfill; existing blocks read as visible, without an anchor or class name,
-- with `{}` settings. The hidden check matches schema.ts; the partial unique
-- index keeps anchors unique per snapshot as a backstop to entry validation.
ALTER TABLE `content_blocks` ADD `anchor` text;--> statement-breakpoint
ALTER TABLE `content_blocks` ADD `class_name` text;--> statement-breakpoint
ALTER TABLE `content_blocks` ADD `hidden` integer DEFAULT false NOT NULL CHECK (`hidden` in (0, 1));--> statement-breakpoint
ALTER TABLE `content_blocks` ADD `settings_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `content_blocks_snapshot_anchor_idx` ON `content_blocks` (`snapshot_id`,`anchor`) WHERE "content_blocks"."anchor" is not null;

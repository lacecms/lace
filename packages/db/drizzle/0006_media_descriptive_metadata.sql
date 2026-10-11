-- Descriptive media metadata. Additive, without rebuilding `media` (referenced by
-- content_media_references); shared by Node SQLite and D1. The column checks match
-- the table checks declared in schema.ts; focal_y carries the pairing rule.
ALTER TABLE `media` ADD `alt` text CHECK (`alt` is null or length(`alt`) <= 1000);--> statement-breakpoint
ALTER TABLE `media` ADD `caption` text CHECK (`caption` is null or length(`caption`) <= 2000);--> statement-breakpoint
ALTER TABLE `media` ADD `focal_x` real CHECK (`focal_x` is null or (`focal_x` >= 0 and `focal_x` <= 1));--> statement-breakpoint
ALTER TABLE `media` ADD `focal_y` real CHECK (`focal_y` is null or (`focal_y` >= 0 and `focal_y` <= 1)) CHECK ((`focal_x` is null) = (`focal_y` is null));

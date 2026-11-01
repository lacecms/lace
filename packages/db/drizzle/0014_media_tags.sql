CREATE TABLE `media_tags` (
	`media_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`media_id`, `tag`),
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "media_tags_tag_check" CHECK(length("media_tags"."tag") between 1 and 40 and "media_tags"."tag" not glob '*[^a-z0-9-]*' and instr("media_tags"."tag", char(0)) = 0)
);
--> statement-breakpoint
CREATE INDEX `media_tags_tag_media_idx` ON `media_tags` (`tag`,`media_id`);
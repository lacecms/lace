-- Import credentials and media content hashes (ADR 0016). Additive, without
-- rebuilding `media` (referenced by content_media_references); shared by Node
-- SQLite and D1. The sha256 column check matches the table check in schema.ts.
ALTER TABLE `api_tokens` ADD `expires_at` integer;--> statement-breakpoint
ALTER TABLE `api_tokens` ADD `created_by` text;--> statement-breakpoint
ALTER TABLE `media` ADD `sha256` text CHECK (`sha256` is null or (length(`sha256`) = 64 and `sha256` not glob '*[^0-9a-f]*'));--> statement-breakpoint
CREATE INDEX `media_sha256_idx` ON `media` (`sha256`);

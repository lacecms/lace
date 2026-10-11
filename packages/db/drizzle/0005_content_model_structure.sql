-- Content-model structure baselines for configuration sync. Additive; shared by Node SQLite and D1.
-- A baseline is valid only while structure_json_hash equals structure_hash.
ALTER TABLE `content_models` ADD `structure_json` text;--> statement-breakpoint
ALTER TABLE `content_models` ADD `structure_json_hash` text;
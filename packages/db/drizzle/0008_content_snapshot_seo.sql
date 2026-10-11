-- SEO system group of a content snapshot (CE4A). Additive and nullable on Node
-- SQLite and D1: no rebuild, no backfill; existing snapshots carry no group.
-- The application stores only validated canonical JSON, like fields_json.
ALTER TABLE `content_snapshots` ADD `seo_json` text;

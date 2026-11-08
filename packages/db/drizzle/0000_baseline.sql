CREATE TABLE `content_blocks` (
	`snapshot_id` text NOT NULL,
	`block_key` text NOT NULL,
	`block_type` text NOT NULL,
	`position` integer NOT NULL,
	`schema_version` integer NOT NULL,
	`data_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`anchor` text,
	`class_name` text,
	`hidden` integer DEFAULT false NOT NULL,
	`settings_json` text DEFAULT '{}' NOT NULL,
	PRIMARY KEY(`snapshot_id`, `block_key`),
	FOREIGN KEY (`snapshot_id`) REFERENCES `content_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_blocks_position_check" CHECK("content_blocks"."position" > 0),
	CONSTRAINT "content_blocks_schema_version_check" CHECK("content_blocks"."schema_version" > 0),
	CONSTRAINT "content_blocks_hidden_check" CHECK("content_blocks"."hidden" in (0, 1))
);
--> statement-breakpoint
CREATE INDEX `content_blocks_snapshot_position_idx` ON `content_blocks` (`snapshot_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_blocks_snapshot_anchor_idx` ON `content_blocks` (`snapshot_id`,`anchor`) WHERE "content_blocks"."anchor" is not null;--> statement-breakpoint
CREATE TABLE `content_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`model_key` text NOT NULL,
	`singleton_key` integer,
	`draft_snapshot_id` text,
	`published_snapshot_id` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`model_key`) REFERENCES `content_models`(`key`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`draft_snapshot_id`) REFERENCES `content_snapshots`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`published_snapshot_id`) REFERENCES `content_snapshots`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "content_entries_singleton_key_check" CHECK("content_entries"."singleton_key" is null or "content_entries"."singleton_key" = 1)
);
--> statement-breakpoint
CREATE INDEX `content_entries_model_idx` ON `content_entries` (`model_key`);--> statement-breakpoint
CREATE INDEX `content_entries_list_idx` ON `content_entries` (`model_key`,`updated_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_entries_singleton_idx` ON `content_entries` (`model_key`) WHERE "content_entries"."singleton_key" = 1;--> statement-breakpoint
CREATE TABLE `content_models` (
	`key` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`config_version` integer NOT NULL,
	`structure_hash` text NOT NULL,
	`projection_hash` text NOT NULL,
	`public_projection_hash` text,
	`public_projection_source_hash` text,
	`structure_json` text,
	`structure_json_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "content_models_kind_check" CHECK("content_models"."kind" in ('page', 'collection', 'global')),
	CONSTRAINT "content_models_config_version_check" CHECK("content_models"."config_version" > 0)
);
--> statement-breakpoint
CREATE TABLE `content_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`revision` integer NOT NULL,
	`slug` text,
	`title` text NOT NULL,
	`fields_json` text NOT NULL,
	`seo_json` text,
	`schema_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `content_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_snapshots_revision_check" CHECK("content_snapshots"."revision" > 0),
	CONSTRAINT "content_snapshots_schema_version_check" CHECK("content_snapshots"."schema_version" > 0)
);
--> statement-breakpoint
CREATE INDEX `content_snapshots_entry_idx` ON `content_snapshots` (`entry_id`);--> statement-breakpoint
CREATE INDEX `content_snapshots_title_prefix_idx` ON `content_snapshots` ("title" collate nocase,`id`);--> statement-breakpoint
CREATE TABLE `published_routes` (
	`path` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `content_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`snapshot_id`) REFERENCES `content_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `published_routes_entry_idx` ON `published_routes` (`entry_id`);--> statement-breakpoint
CREATE TABLE `published_state` (
	`singleton_key` integer PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "published_state_singleton_key_check" CHECK("published_state"."singleton_key" = 1),
	CONSTRAINT "published_state_version_check" CHECK("published_state"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE `content_media_references` (
	`snapshot_id` text NOT NULL,
	`source_key` text NOT NULL,
	`field_path` text NOT NULL,
	`media_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`snapshot_id`, `source_key`, `field_path`),
	FOREIGN KEY (`snapshot_id`) REFERENCES `content_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `content_media_references_media_idx` ON `content_media_references` (`media_id`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`storage_key` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`metadata_json` text NOT NULL,
	`alt` text,
	`caption` text,
	`focal_x` real,
	`focal_y` real,
	`sha256` text,
	`status` text NOT NULL,
	`last_error` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "media_status_check" CHECK("media"."status" in ('active', 'deleting', 'delete_failed')),
	CONSTRAINT "media_size_check" CHECK("media"."size" >= 0),
	CONSTRAINT "media_alt_length_check" CHECK("media"."alt" is null or length("media"."alt") <= 1000),
	CONSTRAINT "media_caption_length_check" CHECK("media"."caption" is null or length("media"."caption") <= 2000),
	CONSTRAINT "media_focal_x_range_check" CHECK("media"."focal_x" is null or ("media"."focal_x" >= 0 and "media"."focal_x" <= 1)),
	CONSTRAINT "media_focal_y_range_check" CHECK("media"."focal_y" is null or ("media"."focal_y" >= 0 and "media"."focal_y" <= 1)),
	CONSTRAINT "media_focal_point_pair_check" CHECK(("media"."focal_x" is null) = ("media"."focal_y" is null)),
	CONSTRAINT "media_sha256_check" CHECK("media"."sha256" is null or (length("media"."sha256") = 64 and "media"."sha256" not glob '*[^0-9a-f]*'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_storage_key_unique` ON `media` (`storage_key`);--> statement-breakpoint
CREATE INDEX `media_sha256_idx` ON `media` (`sha256`);--> statement-breakpoint
CREATE TABLE `media_tags` (
	`media_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`media_id`, `tag`),
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "media_tags_tag_check" CHECK(length("media_tags"."tag") between 1 and 40 and "media_tags"."tag" not glob '*[^a-z0-9-]*' and instr("media_tags"."tag", char(0)) = 0)
);
--> statement-breakpoint
CREATE INDEX `media_tags_tag_media_idx` ON `media_tags` (`tag`,`media_id`);--> statement-breakpoint
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
CREATE TABLE `outbox_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` integer NOT NULL,
	`processed_at` integer,
	`locked_at` integer,
	`locked_by` text,
	`last_error` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "outbox_events_attempts_check" CHECK("outbox_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX `outbox_events_available_idx` ON `outbox_events` (`processed_at`,`locked_at`,`available_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `outbox_pending_site_build_idx` ON `outbox_events` (`type`) WHERE "outbox_events"."type" = 'site.build.requested' and "outbox_events"."processed_at" is null and "outbox_events"."locked_at" is null;--> statement-breakpoint
CREATE TABLE `site_builds` (
	`id` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`target_version` integer NOT NULL,
	`published_snapshot_id` text,
	`provider_build_id` text,
	`requested_by` text NOT NULL,
	`requested_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`error` text,
	`provider_stage` text,
	`provider_checked_at` integer,
	`provider_check_after` integer,
	FOREIGN KEY (`published_snapshot_id`) REFERENCES `content_snapshots`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "site_builds_status_check" CHECK("site_builds"."status" in ('pending', 'running', 'accepted', 'succeeded', 'failed', 'cancelled', 'unknown')),
	CONSTRAINT "site_builds_target_version_check" CHECK("site_builds"."target_version" >= 0)
);
--> statement-breakpoint
CREATE INDEX `site_builds_history_idx` ON `site_builds` (`requested_at`,`id`);--> statement-breakpoint
CREATE INDEX `site_builds_tracking_idx` ON `site_builds` (`status`,`provider_check_after`);--> statement-breakpoint
CREATE TABLE `idempotency_records` (
	`scope` text NOT NULL,
	`key` text NOT NULL,
	`request_hash` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `key`)
);
--> statement-breakpoint
CREATE TABLE `mutation_guards` (
	`token` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_prefix` text NOT NULL,
	`token_hash` text NOT NULL,
	`capabilities_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	`expires_at` integer,
	`created_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_token_hash_unique` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `installation_state` (
	`singleton_key` integer PRIMARY KEY NOT NULL,
	`setup_completed_at` integer,
	`setup_admin_user_id` text,
	CONSTRAINT "installation_state_singleton_key_check" CHECK("installation_state"."singleton_key" = 1)
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`invited_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`accepted_user_id` text,
	`revoked_at` integer,
	CONSTRAINT "invitations_role_check" CHECK("invitations"."role" in ('admin', 'editor', 'viewer'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_hash_unique` ON `invitations` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_active_email_idx` ON `invitations` (`email`) WHERE "invitations"."accepted_at" is null and "invitations"."revoked_at" is null;--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`requested_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `password_reset_tokens_user_idx` ON `password_reset_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `rate_limit_buckets` (
	`bucket_key` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`request_count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `setup_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`claimed_email_hash` text,
	`claimed_at` integer,
	`consumed_at` integer
);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_accounts_provider_account_idx` ON `account` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `auth_accounts_user_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `auth_sessions_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'viewer' NOT NULL,
	`disabled` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "auth_users_role_check" CHECK("user"."role" in ('admin', 'editor', 'viewer'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE INDEX `auth_users_active_admin_idx` ON `user` (`role`) WHERE "user"."role" = 'admin' and "user"."disabled" = 0;--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_verifications_identifier_created_idx` ON `verification` (`identifier`,`created_at`);--> statement-breakpoint
CREATE INDEX `auth_verifications_expiry_idx` ON `verification` (`expires_at`);--> statement-breakpoint
CREATE TABLE `oauth_access_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text,
	`client_id` text NOT NULL,
	`session_id` text,
	`user_id` text,
	`reference_id` text,
	`authorization_code_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`refresh_id` text,
	`expires_at` integer,
	`created_at` integer,
	`revoked` integer,
	`confirmation` text,
	`scopes` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`client_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`refresh_id`) REFERENCES `oauth_refresh_tokens`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_access_tokens_token_unique` ON `oauth_access_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `oauth_access_tokens_client_id_idx` ON `oauth_access_tokens` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauth_access_tokens_session_id_idx` ON `oauth_access_tokens` (`session_id`);--> statement-breakpoint
CREATE INDEX `oauth_access_tokens_user_id_idx` ON `oauth_access_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauth_access_tokens_authorization_code_id_idx` ON `oauth_access_tokens` (`authorization_code_id`);--> statement-breakpoint
CREATE INDEX `oauth_access_tokens_refresh_id_idx` ON `oauth_access_tokens` (`refresh_id`);--> statement-breakpoint
CREATE INDEX `oauth_access_tokens_expiry_idx` ON `oauth_access_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `oauth_access_tokens_client_user_idx` ON `oauth_access_tokens` (`client_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `oauth_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`client_secret` text,
	`client_discovery_id` text,
	`disabled` integer DEFAULT false,
	`skip_consent` integer,
	`enable_end_session` integer,
	`subject_type` text,
	`scopes` text,
	`client_credentials_scopes` text DEFAULT '[]',
	`user_id` text,
	`created_at` integer,
	`updated_at` integer,
	`name` text,
	`uri` text,
	`icon` text,
	`contacts` text,
	`tos` text,
	`policy` text,
	`software_id` text,
	`software_version` text,
	`software_statement` text,
	`redirect_uris` text NOT NULL,
	`post_logout_redirect_uris` text,
	`backchannel_logout_uri` text,
	`backchannel_logout_session_required` integer,
	`token_endpoint_auth_method` text,
	`application_type` text,
	`jwks` text,
	`jwks_uri` text,
	`grant_types` text,
	`response_types` text,
	`require_p_k_c_e` integer,
	`dpop_bound_access_tokens` integer DEFAULT false,
	`reference_id` text,
	`metadata` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_clients_client_id_unique` ON `oauth_clients` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauth_clients_user_id_idx` ON `oauth_clients` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauth_clients_created_idx` ON `oauth_clients` (`created_at`);--> statement-breakpoint
CREATE INDEX `oauth_clients_client_user_idx` ON `oauth_clients` (`client_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `oauth_client_assertions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oauth_client_assertions_expiry_idx` ON `oauth_client_assertions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `oauth_client_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`metadata` text,
	`created_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resource_id`) REFERENCES `oauth_resources`(`identifier`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauth_client_resources_client_id_idx` ON `oauth_client_resources` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauth_client_resources_resource_id_idx` ON `oauth_client_resources` (`resource_id`);--> statement-breakpoint
CREATE INDEX `oauth_client_resources_created_idx` ON `oauth_client_resources` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_client_resources_pair_idx` ON `oauth_client_resources` (`client_id`,`resource_id`);--> statement-breakpoint
CREATE TABLE `oauth_consents` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text,
	`reference_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`scopes` text NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`client_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `oauth_consents_client_id_idx` ON `oauth_consents` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauth_consents_user_id_idx` ON `oauth_consents` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauth_consents_created_idx` ON `oauth_consents` (`created_at`);--> statement-breakpoint
CREATE INDEX `oauth_consents_client_user_idx` ON `oauth_consents` (`client_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `oauth_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`resource` text NOT NULL,
	`consent_id` text,
	`scopes_json` text NOT NULL,
	`generation` integer DEFAULT 0 NOT NULL,
	`user_generation` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`client_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "oauth_grants_generations_check" CHECK("oauth_grants"."generation" >= 0 and "oauth_grants"."user_generation" >= 0),
	CONSTRAINT "oauth_grants_expiry_check" CHECK("oauth_grants"."expires_at" > "oauth_grants"."created_at")
);
--> statement-breakpoint
CREATE INDEX `oauth_grants_user_created_idx` ON `oauth_grants` (`user_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `oauth_grants_client_user_idx` ON `oauth_grants` (`client_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `oauth_grants_expiry_idx` ON `oauth_grants` (`expires_at`);--> statement-breakpoint
CREATE TABLE `oauth_issuances` (
	`id` text PRIMARY KEY NOT NULL,
	`grant_id` text NOT NULL,
	`kind` text NOT NULL,
	`input_hash` text NOT NULL,
	`parent_provider_id` text,
	`family_generation` integer NOT NULL,
	`user_generation` integer NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`pending_expires_at` integer NOT NULL,
	`retain_until` integer NOT NULL,
	`committed_at` integer,
	FOREIGN KEY (`grant_id`) REFERENCES `oauth_grants`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "oauth_issuances_kind_check" CHECK("oauth_issuances"."kind" in ('code', 'refresh')),
	CONSTRAINT "oauth_issuances_state_check" CHECK("oauth_issuances"."state" in ('pending', 'committed', 'aborted')),
	CONSTRAINT "oauth_issuances_generations_check" CHECK("oauth_issuances"."family_generation" >= 0 and "oauth_issuances"."user_generation" >= 0),
	CONSTRAINT "oauth_issuances_commit_check" CHECK(("oauth_issuances"."state" = 'committed') = ("oauth_issuances"."committed_at" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_issuances_input_idx` ON `oauth_issuances` (`kind`,`input_hash`);--> statement-breakpoint
CREATE INDEX `oauth_issuances_grant_idx` ON `oauth_issuances` (`grant_id`);--> statement-breakpoint
CREATE INDEX `oauth_issuances_pending_idx` ON `oauth_issuances` (`state`,`pending_expires_at`);--> statement-breakpoint
CREATE INDEX `oauth_issuances_retention_idx` ON `oauth_issuances` (`retain_until`);--> statement-breakpoint
CREATE TABLE `oauth_refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`client_id` text NOT NULL,
	`session_id` text,
	`user_id` text NOT NULL,
	`reference_id` text,
	`authorization_code_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`expires_at` integer,
	`created_at` integer,
	`revoked` integer,
	`rotated_at` integer,
	`rotation_replay_response` text,
	`rotation_replay_expires_at` integer,
	`auth_time` integer,
	`confirmation` text,
	`scopes` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`client_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_refresh_tokens_token_unique` ON `oauth_refresh_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `oauth_refresh_tokens_client_id_idx` ON `oauth_refresh_tokens` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauth_refresh_tokens_session_id_idx` ON `oauth_refresh_tokens` (`session_id`);--> statement-breakpoint
CREATE INDEX `oauth_refresh_tokens_user_id_idx` ON `oauth_refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauth_refresh_tokens_authorization_code_id_idx` ON `oauth_refresh_tokens` (`authorization_code_id`);--> statement-breakpoint
CREATE INDEX `oauth_refresh_tokens_expiry_idx` ON `oauth_refresh_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `oauth_refresh_tokens_client_user_idx` ON `oauth_refresh_tokens` (`client_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `oauth_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`name` text NOT NULL,
	`access_token_ttl` integer,
	`refresh_token_ttl` integer,
	`signing_algorithm` text,
	`signing_key_id` text,
	`allowed_scopes` text,
	`custom_claims` text,
	`dpop_bound_access_tokens_required` integer DEFAULT false,
	`disabled` integer DEFAULT false,
	`created_at` integer,
	`updated_at` integer,
	`policy_version` integer DEFAULT 1,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_resources_identifier_unique` ON `oauth_resources` (`identifier`);--> statement-breakpoint
CREATE INDEX `oauth_resources_created_idx` ON `oauth_resources` (`created_at`);--> statement-breakpoint
CREATE TABLE `oauth_token_bindings` (
	`kind` text NOT NULL,
	`provider_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`grant_id` text NOT NULL,
	`issuance_id` text NOT NULL,
	`family_generation` integer NOT NULL,
	`user_generation` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`kind`, `provider_id`),
	FOREIGN KEY (`grant_id`) REFERENCES `oauth_grants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`issuance_id`) REFERENCES `oauth_issuances`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "oauth_token_bindings_kind_check" CHECK("oauth_token_bindings"."kind" in ('access', 'refresh'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_token_bindings_hash_idx` ON `oauth_token_bindings` (`kind`,`token_hash`);--> statement-breakpoint
CREATE INDEX `oauth_token_bindings_grant_idx` ON `oauth_token_bindings` (`grant_id`);--> statement-breakpoint
CREATE INDEX `oauth_token_bindings_issuance_idx` ON `oauth_token_bindings` (`issuance_id`);--> statement-breakpoint
CREATE INDEX `oauth_token_bindings_expiry_idx` ON `oauth_token_bindings` (`expires_at`);--> statement-breakpoint
CREATE TABLE `oauth_user_authority` (
	`user_id` text PRIMARY KEY NOT NULL,
	`generation` integer DEFAULT 0 NOT NULL,
	`invalidation_pending` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "oauth_user_authority_generation_check" CHECK("oauth_user_authority"."generation" >= 0)
);
--> statement-breakpoint
-- Hand-written security indexes carried from the former migration chain; the
-- declared schema does not list them.
CREATE INDEX `setup_tokens_expiry_idx` ON `setup_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `api_tokens_active_lookup_idx` ON `api_tokens` (`token_hash`) WHERE `api_tokens`.`revoked_at` IS NULL;--> statement-breakpoint
CREATE INDEX `rate_limit_buckets_expiry_idx` ON `rate_limit_buckets` (`expires_at`);
--> statement-breakpoint
INSERT INTO `content_link_state` (`singleton_key`, `revision`) VALUES (1, 0);

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

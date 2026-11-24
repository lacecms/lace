## MODIFIED Requirements

### Requirement: Upgrade instructions start at the latest published template

The generated `.lace/upgrade-instructions.json` SHALL describe the database and configuration steps from the latest published template to the current template. The 0.53.0 instructions SHALL identify the published 1.0.0 template `0.52.0` as their origin and document coordinated backups, matching package and image selection, explicit migration verification with zero pending steps on a fully migrated SQLite or D1 store, configuration checks, a site rebuild and recovery. The managed operations guide SHALL describe the baseline and name only checked-in migrations. The Cloudflare guide SHALL describe manual activation of the optional Images binding in the operator-owned Wrangler file. Instructions for older published releases SHALL remain with their release-specific guidance.

#### Scenario: Latest published template project reads the next template's instructions
- **WHEN** a published 1.0.0 project plans an upgrade to 0.53.0 in either generated deployment mode
- **THEN** the guidance states the expected zero-migration result and explains configuration, rebuild and backup recovery for the target

#### Scenario: A Cloudflare project adopts thumbnails
- **WHEN** an existing Cloudflare operator reads the 0.53.0 guide
- **THEN** the guide identifies `worker/wrangler.jsonc` and the optional `IMAGES` binding and tells the operator to redeploy after enabling it

#### Scenario: Generated operations guide names only checked-in migrations
- **WHEN** a project is generated in any site mode
- **THEN** its operations guide describes the baseline and current forward migrations, names only checked-in migrations and links to applicable operations

### Requirement: Delivered guides describe the current and supported releases

The generator SHALL deliver as managed, classified and hashed files the operations guide, the Astro site guide, the MCP guide and the scenario guides: both Compose guides in every site mode and the Cloudflare guide only with `--cloudflare`. Mode and Cloudflare rendering SHALL omit links to absent files and references to unavailable scripts. Generator completion output SHALL link to the scenario entry points. The guides and the user-owned README SHALL direct operators to `lace add block` for installing, updating and scaffolding block components. The Compose guides SHALL instruct operators to stop `api` and `dispatcher` before a host command that opens the SQLite database and to start them again afterwards. The Cloudflare guide SHALL document the local consumer journey, local and remote doctor, recovery and the deploy-hook provider prerequisite. The guides SHALL explain email provider selection, the Workers Paid requirement and sending-domain onboarding for the Cloudflare provider, the Resend option, SMTP transport security, the Settings test action and the runtime's mechanism for setting secrets. The Astro site guide SHALL document `site.global()` and its fallback, `site.seo()`, `site.url`, `<LaceSeo>`, sitemap and robots helpers, the `anchor`, `className` and typed `settings` block props, every built-in block, image variants, placeholders, lightbox and link precedence. The operations guide SHALL describe the styling contract, the asset cache lifetime, the builder cache and how to reset it, and the Pages workflow cache.

The 1.1.0 guides SHALL describe the current release and its direct upgrade from 1.0.0. The RC5-to-1.0.0 procedure SHALL remain in release-specific documentation. Generated guides SHALL name only checked-in migrations.

#### Scenario: Deterministic delivered guide variants
- **WHEN** generation runs twice for each of the three site modes with and without Cloudflare
- **THEN** trees, managed guide hashes and manifests match the reviewed snapshots for that variant

#### Scenario: Host database command while the Compose stack runs
- **WHEN** an operator follows a generated Compose guide to sync configuration or reissue a setup token after starting the Compose API
- **THEN** the guide directs them to stop `api` and `dispatcher`, run the host command, and start the services again

#### Scenario: No unsupported release history in delivered guides
- **WHEN** a project is generated for 1.1.0 in any site mode with or without `--cloudflare`
- **THEN** delivered upgrade steps start at 1.0.0 and every migration named by the guides is checked in

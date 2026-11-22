## MODIFIED Requirements

### Requirement: Upgrade instructions start at the latest published template
The generated `.lace/upgrade-instructions.json` SHALL describe only the
database and configuration steps from the latest published template to the
current template, and SHALL NOT keep entries for upgrades from older
templates. Its database steps SHALL identify fully synchronized RC5 as the origin for 1.0.0, name explicit forward migration on Node and Cloudflare, and link the coordinated backup, storage, configuration and recovery procedure. The generated operations guide SHALL name only checked-in migrations. Earlier releases are outside the supported upgrade window.

#### Scenario: Latest published template project reads the next template's instructions
- **WHEN** an operator plans the same-mode upgrade from published template `0.50.0`
- **THEN** the guidance covers conflict review, Node storage adoption or the D1/R2 procedure, forward migration in place, configuration sync, coordinated site dependency adoption and rebuild

#### Scenario: Generated operations guide names only checked-in migrations
- **WHEN** a project is generated in any site mode
- **THEN** its operations guide describes the baseline and current forward migrations and links only to applicable operations

### Requirement: Delivered guides describe the current and supported releases
The generator SHALL deliver as managed, classified and hashed files the operations guide, the Astro site guide, the MCP guide and the scenario guides: both Compose guides in every site mode and the Cloudflare guide only with `--cloudflare`; mode and Cloudflare rendering SHALL omit absent-file links and unavailable scripts. Generator completion output SHALL link to the scenario entry points. The guides and the user-owned README SHALL direct operators to `lace add block` for installing, updating and scaffolding block components. The Compose guides SHALL instruct operators to stop the `api` and `dispatcher` services before a host command that opens the SQLite database and to start them again afterwards. The Cloudflare guide SHALL document the local consumer journey, local and remote doctor, recovery and the deploy-hook provider prerequisite. The guides SHALL explain email provider selection, the Workers Paid requirement and sending-domain onboarding for the Cloudflare provider, the Resend option, SMTP transport security, the Settings test action and setting secrets with the runtime's secret mechanism. The Astro site guide SHALL document `site.global()` and its fallback pattern, `site.seo()`, `site.url`, `<LaceSeo>`, the sitemap and robots helpers, the `anchor`, `className` and typed `settings` block props, every built-in block, image variants, placeholders, the lightbox and link precedence; the operations guide SHALL describe the styling contract, the asset cache lifetime, the builder cache and how to reset it, and the Pages workflow cache.

The guides SHALL describe the current release and upgrades from the oldest supported release only. They SHALL NOT describe the behavior or upgrade steps of releases older than RC5 or name database migrations that are not checked in.

#### Scenario: Deterministic delivered guide variants
- **WHEN** generation runs twice for each of the three site modes with and without Cloudflare
- **THEN** trees, managed guide hashes and manifests match the reviewed snapshots for that variant

#### Scenario: Host database command while the Compose stack runs
- **WHEN** an operator follows a generated Compose guide to sync configuration or re-issue a setup token after starting the Compose API
- **THEN** the guide directs them to stop `api` and `dispatcher`, run the host command, and start the services again

#### Scenario: No unsupported release history in delivered guides
- **WHEN** a project is generated in any site mode, with or without `--cloudflare`
- **THEN** its guides and README describe the supported RC5 upgrade and current release and refer only to checked-in migrations

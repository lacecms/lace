## ADDED Requirements

### Requirement: Upgrade instructions start at the latest published template
The generated `.lace/upgrade-instructions.json` SHALL describe only the
database and configuration steps from the latest published template to the
current template, and SHALL NOT keep entries for upgrades from older
templates. Its database steps SHALL state that a database created by the
latest published release already starts from the baseline migration and is
upgraded by applying forward migrations with `lace db migrate`, without
recreation, and that a database created before rc2 predates the baseline, is
refused and is not supported. The generated operations guide SHALL describe the baseline
migration and SHALL NOT name numbered migrations that are no longer checked
in.

#### Scenario: Latest published template project reads the next template's instructions
- **WHEN** an operator plans an upgrade of a project on the latest published template (rc2, template `0.47.0`)
  to the current template
- **THEN** the upgrade guidance names forward migration with `lace db migrate`
  without database recreation and the current template's configuration step,
  and no step for an older template

#### Scenario: Generated operations guide names only checked-in migrations
- **WHEN** a project is generated in any site mode
- **THEN** its operations guide mentions the baseline migration and no
  migration file that is not checked in

### Requirement: Delivered guides describe the current and supported releases
The generator SHALL deliver as managed, classified and hashed files the operations guide, the Astro site guide, the MCP guide and the scenario guides: both Compose guides in every site mode and the Cloudflare guide only with `--cloudflare`; mode and Cloudflare rendering SHALL omit absent-file links and unavailable scripts. Generator completion output SHALL link to the scenario entry points. The guides and the user-owned README SHALL direct operators to `lace add block` for installing, updating and scaffolding block components. The Compose guides SHALL instruct operators to stop the `api` and `dispatcher` services before a host command that opens the SQLite database and to start them again afterwards. The Cloudflare guide SHALL document the local consumer journey, local and remote doctor, recovery and the deploy-hook provider prerequisite. The guides SHALL explain email provider selection, the Workers Paid requirement and sending-domain onboarding for the Cloudflare provider, the Resend option, SMTP transport security, the Settings test action and setting secrets with the runtime's secret mechanism. The Astro site guide SHALL document `site.global()` and its fallback pattern, `site.seo()`, `site.url`, `<LaceSeo>`, the sitemap and robots helpers, the `anchor`, `className` and typed `settings` block props, every built-in block, image variants, placeholders, the lightbox and link precedence; the operations guide SHALL describe the styling contract, the asset cache lifetime, the builder cache and how to reset it, and the Pages workflow cache.

The guides SHALL describe the current release and upgrades from the oldest supported release only. They SHALL NOT describe the behavior or upgrade steps of releases older than rc2 or name database migrations that are not checked in.

#### Scenario: Deterministic delivered guide variants
- **WHEN** generation runs twice for each of the three site modes with and without Cloudflare
- **THEN** trees, managed guide hashes and manifests match the reviewed snapshots for that variant

#### Scenario: Host database command while the Compose stack runs
- **WHEN** an operator follows a generated Compose guide to sync configuration or re-issue a setup token after starting the Compose API
- **THEN** the guide directs them to stop `api` and `dispatcher`, run the host command, and start the services again

#### Scenario: No unsupported release history in delivered guides
- **WHEN** a project is generated in any site mode, with or without `--cloudflare`
- **THEN** its guides and README name no alpha release, no rc1 upgrade, no template older than rc2 and no removed migration

## REMOVED Requirements

### Requirement: Upgrade instructions cover only the latest published template
**Reason**: Its database step and scenario describe the rc1 database recreation; rc2 is now the oldest supported release (ADR 0030).
**Migration**: Replaced by "Upgrade instructions start at the latest published template", which describes forward migration from rc2 without recreation.

### Requirement: Delivered guides describe the current release
**Reason**: Its support floor and scenario name rc1; rc2 is now the oldest supported release (ADR 0030).
**Migration**: Replaced by "Delivered guides describe the current and supported releases" with the same delivery rules and an rc2 floor.

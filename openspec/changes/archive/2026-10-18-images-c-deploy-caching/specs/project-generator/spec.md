## ADDED Requirements

### Requirement: Template 0.33.0 delivers deploy caching
The generator SHALL advance the managed template version to `0.33.0`. The
managed web proxy SHALL carry the 30-day `/_astro/` cache rule and the
`/_headers` refusal. In starter and existing-site modes the managed Compose
file SHALL mount the builder cache volume on the builder and declare it; in
no-site mode it SHALL declare neither. The managed Cloudflare Pages workflow
SHALL restore and save the site's Astro cache directory between runs. In
starter mode the user-owned site SHALL contain `public/_headers` applying
`Cache-Control: public, max-age=2592000, immutable` to `/_astro/*`, identical
in value to the proxy rule. The managed guides SHALL describe the asset cache
lifetime, the `_headers` rule for existing sites, the builder cache, its
bound and how to reset it, and the Pages workflow cache. Template upgrade
instructions SHALL state that no database migration and no API, admin, CLI,
SDK or adapter change is required; that the builder image of the same
release and the recreation of the `builder` and `web` services are needed;
and that the `_headers` file is adopted manually because site files are
user-owned. Upgrades SHALL preserve user-owned files and retain deterministic
managed hashes and existing conflict detection.

#### Scenario: A new starter project is generated
- **WHEN** a starter project is generated
- **THEN** its manifest records template `0.33.0`, `site/public/_headers` is
  user-owned with the 30-day rule, the proxy, Compose and Pages workflow carry
  the caching changes

#### Scenario: A no-site project is generated
- **WHEN** a project without a site is generated
- **THEN** its proxy carries the cache rule and its Compose file has no
  builder and no builder cache volume

#### Scenario: Existing project upgrades to 0.33.0
- **WHEN** a 0.32.0 project with unmodified managed files is upgraded
- **THEN** the proxy, Compose file and workflow are updated, the instruction
  names the builder image and service recreation and the manual `_headers`
  adoption, and user-owned files are unchanged

#### Scenario: Edited proxy configuration
- **WHEN** the consumer has modified `deploy/nginx.conf`
- **THEN** the upgrade reports a managed-file conflict instead of overwriting
  it

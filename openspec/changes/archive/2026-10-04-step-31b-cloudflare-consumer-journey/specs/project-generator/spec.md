## ADDED Requirements

### Requirement: Cloudflare journey template upgrade protects ownership
The generator SHALL advance the managed template version to `0.13.0`. The managed operations guide and the user-owned generated README of `--cloudflare` projects SHALL document the local Cloudflare consumer journey, local and remote doctor, recovery and the deploy-hook provider prerequisite. The template upgrade instructions SHALL state that the upgrade changes only managed guidance, creates or changes no Worker configuration, Cloudflare resource, secret or deployment, and that no file under `site/` is changed, added or deleted. Upgrades SHALL preserve user-owned README, `lace.config.ts`, site source and `worker/wrangler.jsonc` and retain deterministic managed hashes and existing conflict detection.

#### Scenario: Fresh Cloudflare generation
- **WHEN** a project is generated with `--cloudflare` and template `0.13.0`
- **THEN** its operations guide documents local doctor and recovery and the hook prerequisite, and its Worker and site files are byte-identical to template `0.12.0`

#### Scenario: Upgrade from 0.12.0
- **WHEN** a consumer with unmodified 0.12.0 managed files applies the 0.13.0 upgrade from a template of the same site mode and Cloudflare selection
- **THEN** only managed guidance is replaced and every user-owned file, including `worker/wrangler.jsonc` and all of `site/`, is unchanged

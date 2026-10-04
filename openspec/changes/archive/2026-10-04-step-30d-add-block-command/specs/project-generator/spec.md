## ADDED Requirements

### Requirement: Block-command template upgrade protects ownership
The generator SHALL advance the managed template version to `0.10.0`. The managed existing-site guide and operations guide and the user-owned generated README SHALL direct operators to `lace add block` for installing, updating, and scaffolding block components instead of copying files from a generated starter. The template upgrade instructions SHALL state that the upgrade changes only managed guidance and that no file under `site/` is changed, added, or deleted. Upgrades SHALL preserve user-owned README, `lace.config.ts` and site source and retain deterministic managed hashes and existing conflict detection.

#### Scenario: Fresh generation
- **WHEN** a project is generated with template `0.10.0`
- **THEN** its README and guides name `lace add block` and the starter site files are byte-identical to template `0.9.0`

#### Scenario: Upgrade from 0.9.0
- **WHEN** a consumer with unmodified 0.9.0 managed files applies the 0.10.0 template upgrade
- **THEN** the managed guides are updated and every user-owned file, including all of `site/`, is unchanged

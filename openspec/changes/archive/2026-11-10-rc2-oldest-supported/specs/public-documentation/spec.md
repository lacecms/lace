## ADDED Requirements

### Requirement: Upgrade guidance covers only the oldest supported release onward
English/latest, the delivered consumer guidance and the permanent compatibility guide SHALL describe upgrades from rc2 (`0.1.0-rc2`) and later releases only. They SHALL explain that an rc2 database already starts from the baseline migration and is upgraded by explicit forward migrations, without recreation, together with backup, coordinated package, image and source adoption, configuration synchronization and a site rebuild for Node and Cloudflare, and backup-based rollback without promising a package-only downgrade. They SHALL state that installations older than rc2 are not supported and that their pre-baseline databases are refused. Sections that describe upgrades from rc1 or between older releases, or the adoption of features already present in rc2, SHALL NOT remain. Documentation SHALL preserve English/latest routes and SHALL NOT claim publication or real-deployment readiness from preparation alone. The reviewed changelog SHALL provide concise release notes linked to the permanent upgrade guide.

#### Scenario: Operator on the oldest supported release upgrades
- **WHEN** an operator on rc2, the oldest supported release, follows the upgrade guidance
- **THEN** they can identify the backup, coordinated package and image update, forward database migration without recreation, configuration synchronization, site rebuild and rollback boundary

#### Scenario: Reader looks for unsupported upgrade steps
- **WHEN** a reader searches the public operations, deployment, reference and Astro integration pages or the compatibility guide
- **THEN** no rc1 database recreation, alpha-by-alpha upgrade or pre-rc2 feature-adoption section remains, and the guidance names rc2 as the oldest supported release

## REMOVED Requirements

### Requirement: Upgrade guidance starts at the oldest supported release
**Reason**: rc2 replaces rc1 as the oldest supported release (ADR 0030), so the rc1 database recreation guidance and rc1-named scenarios no longer apply.
**Migration**: Replaced by "Upgrade guidance covers only the oldest supported release onward", which describes the rc2 → current upgrade with version-neutral scenario names.

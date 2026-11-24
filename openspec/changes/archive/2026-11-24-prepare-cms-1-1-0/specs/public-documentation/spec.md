## MODIFIED Requirements

### Requirement: Upgrade guidance covers only the oldest supported release onward

English/latest, delivered guides and the permanent compatibility guide SHALL identify 1.0.0 as the supported direct upgrade origin for 1.1.0, with the published RC5 to 1.0.0 procedure available as release-specific history. The current operator guidance SHALL cover coordinated backups, matching artifacts, managed-file adoption, explicit forward migration verification with zero pending migrations on fully migrated SQLite and D1, configuration checks, original-media verification, a site rebuild and backup-based recovery. It SHALL describe lazy thumbnail generation, the optional operator-managed Images binding and the SDK/Astro adoption order. The permanent compatibility guide SHALL state the public contract boundaries and link to the detailed operations procedure. English/latest routes SHALL remain available and the reviewed changelog SHALL link to the permanent guidance. Claims of publication and real-deployment readiness SHALL refer to evidence for the stated candidate.

#### Scenario: Operator on the oldest supported release upgrades
- **WHEN** the operator follows the 1.1.0 changelog to the compatibility and operations guidance
- **THEN** they can identify the template revision, backups, runtime commands, source ownership, the zero-migration expectation on both runtimes, the optional Cloudflare configuration, the rebuild and the coordinated recovery steps

#### Scenario: Reader looks for unsupported upgrade steps
- **WHEN** a reader reviews the 1.1.0 upgrade prerequisites and delivered instructions
- **THEN** direct instructions start at 1.0.0 and a historical reference points RC5 users to the published 1.0.0 procedure where the five SQL migrations belong

#### Scenario: Reader opens the compatibility guide to upgrade
- **WHEN** a reader opens the permanent compatibility guide from the changelog
- **THEN** the guide identifies the direct upgrade origin, expected migration result and coordinated recovery boundary, and links to the English/latest procedure

#### Scenario: A stable installation is selected
- **WHEN** the 1.1.0 stable release is published and a new operator uses the documented default generator installation
- **THEN** the guide selects the stable distribution and the generated project resolves the matching stable dependencies and images

## MODIFIED Requirements

### Requirement: Documentation identities include language and version

Published documentation URLs SHALL carry explicit language and version segments. The initial English latest section SHALL be `/en/latest/` relative to the deployment base. The site root SHALL direct readers to that section. The supported language/version pair SHALL remain exactly `en`/`latest`, with its target CMS version set from the selected release definition. Pages SHALL identify the current documentation target and that latest follows `main`, without inferring publication or deployment verification from that label.

Locale/version definitions SHALL be explicit and validated independently of page prose. The structure SHALL allow another locale or version section to be registered and built without renaming existing English/latest routes or rewriting shared page templates. Unsupported pairs SHALL NOT appear in navigation, selectors or search as available documentation. A missing requested page SHALL NOT silently display a different version or language as if it matched.

#### Scenario: Initial entry and identity
- **WHEN** a reader opens the documentation root
- **THEN** the reader reaches the English latest landing page and can identify the selected CMS version as the target of documentation following `main`

#### Scenario: Additional variant fixture
- **WHEN** verification registers fixture content for an additional locale and a fixed version
- **THEN** those pages build with distinct locale/version routes while existing `/en/latest/` routes retain their identities

#### Scenario: Unsupported version
- **WHEN** a reader requests a nonexistent version or translation
- **THEN** the site returns its static not-found behavior rather than substituting latest or English content without disclosure

#### Scenario: Only one variant is available
- **WHEN** the production site is built
- **THEN** it publishes only English latest content and exposes no redundant or empty locale/version selectors

### Requirement: Upgrade guidance covers only the oldest supported release onward
English/latest, generated guides and the permanent compatibility guide SHALL identify RC5 as the sole prerelease upgrade origin for 1.0.0. The operator procedure SHALL cover supported Node and Cloudflare targets, RC5 preflight, coordinated backups, matching package/image and user-owned site source adoption, explicit forward migration in place, synchronization, media integrity, site rebuild and tested backup-based rollback. Earlier upgrade recipes SHALL be retired. The compatibility guide SHALL state the stable public contract boundaries and link to the detailed English/latest procedure. Preserve documentation routes and the reviewed changelog link to permanent guidance. Publication and real deployment status SHALL be reported only from evidence for that candidate.

#### Scenario: Operator on the oldest supported release upgrades
- **WHEN** an operator opens the changelog and follows its permanent upgrade link
- **THEN** the supported origin, required backups and runtime-specific commands, source ownership, verification and recovery point are discoverable through that link

#### Scenario: A stable installation is selected
- **WHEN** the stable release is published and a new operator uses the documented default generator installation
- **THEN** the guide selects the stable distribution and its generated project resolves the matching stable dependencies and images

#### Scenario: Reader looks for unsupported upgrade steps
- **WHEN** a reader checks active public or delivered upgrade guidance
- **THEN** it identifies RC5 as the support floor and contains no earlier migration procedures

#### Scenario: Reader opens the compatibility guide to upgrade
- **WHEN** a reader opens the permanent compatibility guide
- **THEN** it identifies the supported origin, forward migrations and coordinated rollback boundary, and links to the English/latest procedure

## MODIFIED Requirements

### Requirement: Documentation identities include language and version

Published documentation URLs SHALL carry explicit language and version segments. The initial English latest section SHALL be `/en/latest/` relative to the deployment base. The site root SHALL direct readers to that section. The supported language/version pair SHALL remain exactly `en`/`latest`, with target CMS version `0.1.0-rc1`. Pages SHALL identify the current documentation target and that latest follows `main`, without inferring publication or deployment verification from that label.

Locale/version definitions SHALL be explicit and validated independently of page prose. The structure SHALL allow another locale or version section to be registered and built without renaming existing English/latest routes or rewriting shared page templates. Unsupported pairs SHALL NOT appear in navigation, selectors or search as available documentation. A missing requested page SHALL NOT silently display a different version or language as if it matched.

#### Scenario: Initial entry and identity
- **WHEN** a reader opens the documentation root
- **THEN** the reader reaches the English latest landing page and can identify `0.1.0-rc1` as the target of documentation following `main`

#### Scenario: Additional variant fixture
- **WHEN** verification registers fixture content for an additional locale and a fixed version
- **THEN** those pages build with distinct locale/version routes while existing `/en/latest/` routes retain their identities

#### Scenario: Unsupported version
- **WHEN** a reader requests a nonexistent version or translation
- **THEN** the site returns its static not-found behavior rather than substituting latest or English content without disclosure

#### Scenario: Only one variant is available
- **WHEN** the production site is built
- **THEN** it publishes only English latest content and exposes no redundant or empty locale/version selectors

## ADDED Requirements

### Requirement: Release candidate guidance covers the alpha-eight upgrade
English/latest, delivered consumer guidance and the permanent compatibility guide SHALL explain rc1's changes after alpha.8, actual forward migrations 0014–0015, coordinated package/image adoption, conflict-aware source component updates, gallery schema 5, conditional field synchronization and matching database/media/configuration/source backups for rollback. They SHALL describe optional separately consented MCP publishing, deny unpublication/deletion and distinguish CMS publication from site deployment. Documentation SHALL preserve English/latest routes and SHALL NOT claim publication or real-deployment readiness from preparation alone. The reviewed changelog SHALL provide concise release notes linked to the permanent upgrade guide.

#### Scenario: Existing alpha-eight operator upgrades
- **WHEN** an operator follows the rc1 upgrade guidance
- **THEN** they can identify the required migrations, source/configuration changes, MCP permission choice and coordinated rollback boundary without relying on obsolete draft-only MCP guidance


## MODIFIED Requirements

### Requirement: Documentation identities include language and version

Published documentation URLs SHALL carry explicit language and version segments. The initial English latest section SHALL be `/en/latest/` relative to the deployment base. The site root SHALL direct readers to that section. The supported language/version pair SHALL remain exactly `en`/`latest`, with target CMS version `0.1.0-alpha.8`. Pages SHALL identify the current documentation target and that latest follows `main`, without inferring publication or deployment verification from that label.

Locale/version definitions SHALL be explicit and validated independently of page prose. The structure SHALL allow another locale or version section to be registered and built without renaming existing English/latest routes or rewriting shared page templates. Unsupported pairs SHALL NOT appear in navigation, selectors or search as available documentation. A missing requested page SHALL NOT silently display a different version or language as if it matched.

#### Scenario: Initial entry and identity
- **WHEN** a reader opens the documentation root
- **THEN** the reader reaches the English latest landing page and can identify `0.1.0-alpha.8` as the target of documentation following `main`

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

### Requirement: Alpha eight guidance covers coordinated upgrades and optional MCP
English/latest SHALL describe accepted post-alpha.7 functionality and the alpha.8 upgrade path, including list presentation settings, video embeds, internal URL destinations and unavailable-link behavior, export format 2, draft collection-query options and optional OAuth MCP. Guidance SHALL preserve existing route identities and distinguish manual source/configuration adoption from managed-file upgrades. Deployment and operations pages SHALL describe migrations, matching backups/rollback, canonical public origin and proxy configuration, disabled-by-default MCP activation, consent/revocation, supported Codex/Claude Code/Gemini CLI setup, role/scope limits and forbidden publication/deletion. Examples SHALL match shipped alpha.8 commands and SHALL NOT imply that preparation or a latest label proves registry publication or real deployment verification.

#### Scenario: Existing operator upgrades
- **WHEN** an alpha.7 operator follows alpha.8 guidance
- **THEN** the operator can identify coordinated package/image updates, migrations and source/configuration adoption, optional MCP activation and the matching backup requirement for rollback

#### Scenario: Assistant client setup
- **WHEN** an operator configures a supported MCP client from the documented setup
- **THEN** examples use the canonical endpoint and explicit permissions, explain sign-in/consent and revocation, and retain the draft-only tool ceiling

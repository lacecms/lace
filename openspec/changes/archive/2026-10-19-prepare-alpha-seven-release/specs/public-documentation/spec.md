## MODIFIED Requirements

### Requirement: Documentation identities include language and version

Published documentation URLs SHALL carry explicit language and version segments. The initial English latest section SHALL be `/en/latest/` relative to the deployment base. The site root SHALL direct readers to that section. The supported language/version pair SHALL remain exactly `en`/`latest`, with target CMS version `0.1.0-alpha.7`. Pages SHALL identify the current documentation target and that latest follows `main`, without inferring publication or deployment verification from that label.

Locale/version definitions SHALL be explicit and validated independently of page prose. The structure SHALL allow another locale or version section to be registered and built without renaming existing English/latest routes or rewriting shared page templates. Unsupported pairs SHALL NOT appear in navigation, selectors or search as available documentation. A missing requested page SHALL NOT silently display a different version or language as if it matched.

#### Scenario: Initial entry and identity
- **WHEN** a reader opens the documentation root
- **THEN** the reader reaches the English latest landing page and can identify `0.1.0-alpha.7` as the target of documentation following `main`

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

### Requirement: Image guidance matches the alpha seven consumer workflow
Public media, Astro integration, deployment and upgrade guidance SHALL describe the accepted image formats and 10 MiB limit, original versus optimized delivery, image origin allowlisting and the site's image-service dependency, variant widths and animated GIF conversion, placeholder exceptions, opt-in lightbox, link precedence and safe updates to installed source. Deployment guidance SHALL explain upload proxy configuration, revalidating HTML, thirty-day immutable successful hashed assets and disposable persistent build caches for VPS and Pages where applicable. It SHALL distinguish database migration from content configuration synchronization and retain current routes. Public, internal and delivered generated guides SHALL be reviewed together according to the existing topic ownership map. Documentation SHALL NOT advertise the unapplied video proposal as supported.

#### Scenario: Existing Astro consumer adopts images
- **WHEN** a reader upgrades a customized existing Astro site to alpha.7
- **THEN** the guide explains matching dependencies, image configuration, conflict-aware component updates and synchronization before the next build without instructing blind source replacement

#### Scenario: Editor configures a linked gallery item
- **WHEN** an editor supplies a link while gallery lightbox is enabled
- **THEN** the guide explains that the link takes precedence and does not promise a lightbox on that linked item

#### Scenario: Operator follows deployment guidance
- **WHEN** an operator refreshes generated VPS or Pages deployment files
- **THEN** the guide distinguishes persistent application data from disposable caches and configuration checks from verified remote deployment

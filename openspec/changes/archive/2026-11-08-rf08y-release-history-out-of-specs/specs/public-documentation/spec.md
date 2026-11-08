## RENAMED Requirements

- FROM: `### Requirement: Image guidance matches the alpha seven consumer workflow`
- TO: `### Requirement: Public guidance covers image delivery`

- FROM: `### Requirement: Alpha eight guidance covers coordinated upgrades and optional MCP`
- TO: `### Requirement: Public guidance covers presentation, links, collection queries and optional MCP`

## MODIFIED Requirements

### Requirement: Public guidance covers image delivery
Public media, Astro integration and deployment guidance SHALL describe the accepted image formats and 10 MiB limit, original versus optimized delivery, image origin allowlisting and the site's image-service dependency, variant widths and animated GIF conversion, placeholder exceptions, opt-in lightbox, link precedence and safe updates to installed source. Deployment guidance SHALL explain upload proxy configuration, revalidating HTML, thirty-day immutable successful hashed assets and disposable persistent build caches for VPS and Pages where applicable. It SHALL distinguish database migration from content configuration synchronization and retain current routes. Public, internal and delivered generated guides SHALL be reviewed together according to the existing topic ownership map.

#### Scenario: Existing Astro consumer adopts images
- **WHEN** a reader connects a customized existing Astro site and adopts the image components
- **THEN** the guide explains matching dependencies, image configuration, conflict-aware component updates and synchronization before the next build without instructing blind source replacement

#### Scenario: Editor configures a linked gallery item
- **WHEN** an editor supplies a link while gallery lightbox is enabled
- **THEN** the guide explains that the link takes precedence and does not promise a lightbox on that linked item

#### Scenario: Operator follows deployment guidance
- **WHEN** an operator refreshes generated VPS or Pages deployment files
- **THEN** the guide distinguishes persistent application data from disposable caches and configuration checks from verified remote deployment

### Requirement: Public guidance covers presentation, links, collection queries and optional MCP
English/latest SHALL describe list presentation settings, video embeds, internal URL destinations and unavailable-link behavior, build-export format 2, draft collection-query options and optional OAuth MCP. Guidance SHALL preserve existing route identities and distinguish manual source/configuration adoption from managed-file upgrades. Deployment and operations pages SHALL describe canonical public origin and proxy configuration, disabled-by-default MCP activation, consent/revocation, supported Codex/Claude Code/Gemini CLI setup and role/scope limits: publication requires the separately consented `content:publish` scope and current role authority, and unpublication and deletion remain unavailable. Examples SHALL match shipped commands and SHALL NOT imply that preparation or a latest label proves registry publication or real deployment verification.

#### Scenario: Existing operator upgrades
- **WHEN** an operator on a supported release follows the upgrade and MCP guidance
- **THEN** the operator can identify coordinated package/image updates, source/configuration adoption, optional MCP activation with separately granted publication, and the matching backup requirement for rollback

#### Scenario: Assistant client setup
- **WHEN** an operator configures a supported MCP client from the documented setup
- **THEN** examples use the canonical endpoint and explicit permissions, explain sign-in/consent and revocation, and state that unpublication and deletion are unavailable through MCP

### Requirement: Public guidance covers gallery video items
The public block reference SHALL describe the gallery block: item kinds, the fields that apply to images and to videos, the supported providers, the required accessible video title, playback and aspect ratio per item, captions without a media fallback for videos, and that the lightbox and links apply to images only. The Editing content section SHALL explain adding images through Add and videos through "Add Video", and switching an item's Type without losing typed values. The conditional-fields page SHALL name the built-in gallery as the shipped example of its list-item example. The Astro integration guidance SHALL explain the gallery video markup hooks and `GalleryVideo.css`, the ambient fallbacks and the WCAG 2.2.2 pause-control gap shared with `videoEmbed`, and how site code that copied the gallery component handles published items whose `media` is absent: check the item's `kind` and the presence of `media` before describing an image.

#### Scenario: A reader adds a video to a gallery
- **WHEN** a reader follows the editing guidance in a generated project with
  a gallery block
- **THEN** they add a video with "Add Video", fill its URL and title, choose
  ambient playback and a square ratio, publish, and see it in the built site

#### Scenario: A reader updates a copied gallery component
- **WHEN** a reader whose site copied and edited the gallery component follows
  the Astro integration guidance
- **THEN** they merge the current registry component and `GalleryVideo.css`,
  and their typed component compiles because it narrows items by `kind` and
  checks `media`

## REMOVED Requirements

### Requirement: Release candidate guidance covers the alpha-eight upgrade
**Reason**: Describes the upgrade from alpha.8 to rc1; rc1 is now the oldest supported state (owner decision 11).
**Migration**: Replaced by "Upgrade guidance starts at the oldest supported release".

## ADDED Requirements

### Requirement: Upgrade guidance starts at the oldest supported release
English/latest, the delivered consumer guidance and the permanent compatibility guide SHALL describe upgrades from rc1 (`0.1.0-rc1`) and later releases only. They SHALL explain that the database starts from one baseline migration, so an rc1 database is recreated rather than migrated, with the backup, recreation, migration, synchronization, bootstrap and content restoration steps for Node and Cloudflare; coordinated package, image and source adoption; and backup-based rollback without promising a package-only downgrade. Sections that describe upgrades between releases older than rc1 or the adoption of features already present in rc1 SHALL NOT remain. Documentation SHALL preserve English/latest routes and SHALL NOT claim publication or real-deployment readiness from preparation alone. The reviewed changelog SHALL provide concise release notes linked to the permanent upgrade guide.

#### Scenario: rc1 operator upgrades
- **WHEN** an operator on rc1 follows the upgrade guidance
- **THEN** they can identify the database recreation, coordinated package and image update, configuration synchronization and rollback boundary

#### Scenario: Reader looks for pre-rc1 upgrade steps
- **WHEN** a reader searches the public operations, deployment, reference and Astro integration pages or the compatibility guide
- **THEN** no alpha-by-alpha upgrade section or pre-rc1 feature-adoption section remains, and the guidance names rc1 as the oldest supported release

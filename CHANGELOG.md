# Changelog

Important changes and required upgrade actions; preparation alone does not
announce publication. See [release status and evidence](docs/alpha-release.md).

## 0.1.0-rc3

- Build collections without public routes and configure a default sort for the editor list.
- Place gallery items in the grid and display images at their natural size; upgrading gallery definitions requires model version bumps, synchronization and updated installed source ([upgrade guide](docs/compatibility.md#upgrading-from-rc2)).
- The entry editor has a refined layout, and Site is now named Globals in the admin.
- Remote Cloudflare D1 migration handles a fresh database when its ledger query returns HTTP 400.
- Upgrade all Lace packages, both images and the project template (`0.48.0`) together. rc2 is the oldest supported release; back up before upgrading and rebuild the site after synchronization.

## 0.1.0-rc2

- The database starts from one baseline migration: an rc1 database is refused with `SCHEMA_UNSUPPORTED` and must be recreated, then content synchronized and restored ([upgrade guide](docs/compatibility.md)).
- Support for releases before rc1 is removed: built-in block identity migrations, build-export format 1, the legacy structure hash and manifests without a site record.
- Errors are more precise: MCP account and rate-limit failures have their own codes (`RATE_LIMITED`), an unexpected setup failure returns `500` instead of `404`, and a public collection slug over 100 characters returns `422`.
- Public contracts are tightened: admin entry/media list `limit` is documented as 1–100, four `…Source` inputs are required, `jsonValueSchema`/`jsonObjectSchema` refuse arrays with named properties, `hasMatchingBlockDefinitions` matches blocks by type in any order, the security ports are split (`AccountSecurityPort`, `SessionSecurityPort`, `TokenSecurityPort`) and `@lacecms/platform-node` no longer exports `./test`.
- Upgrade every Lace package, both images and the project template (`0.47.0`) together.

## 0.1.0-rc1

- Choose video aspect ratios and ambient playback, and mix images with accessible YouTube/Vimeo videos in galleries.
- Organize media with tags and select several images at once.
- Import content and media with scoped, expiring credentials, offline validation and repeatable publication.
- Show fields conditionally while preserving hidden draft values and omitting them from published content.
- Optionally grant MCP assistants separate publishing permission through explicit consent; unpublication and deletion remain unavailable.
- Upgrade engine, site and builder together, apply migrations 0014–0015 and review gallery schema 5, conditional definitions and installed source before synchronization ([upgrade guide](docs/compatibility.md#rc1-upgrade-and-rollback)).

## 0.1.0-alpha.8

- Configure reusable list layouts and compact media rows, and embed YouTube or Vimeo videos with optional image previews.
- Link content by stable entry identity; unavailable destinations render safely, with coordinated SDK/site adoption of build-export format 2.
- Configure collection sorting, filters and additional search fields for draft editing without changing published order.
- Optionally connect OAuth assistants through MCP with explicit consent, revocable access and five read/draft tools; publishing and deletion remain unavailable.
- Update authentication, HTTP and build dependencies with upstream security fixes.
- Upgrade engine, site and builder together, apply migrations 0010–0013 and review installed components and deployment configuration before synchronization ([upgrade guide](docs/compatibility.md#alpha-8-upgrade-and-rollback)).

## 0.1.0-alpha.7

- Upload GIF images and reuse unchanged originals with conditional media requests; larger valid images now pass the VPS proxy.
- Astro renders responsive WebP variants, preserving GIF animation, with eligible blurred placeholders and an optional full-size lightbox.
- Image blocks and gallery items accept links that take precedence over the lightbox.
- Site builds reuse image/package caches; successful content-hashed assets cache for thirty days while HTML revalidates.
- Upgrade engine, site and builder together, review installed components and deployment files, then synchronize image/gallery schemas; no new SQL migration since alpha.6 ([upgrade guide](docs/compatibility.md#alpha-7-upgrade-and-rollback)).

## 0.1.0-alpha.6

- Build exports are paginated and version-bound; the SDK assembles pages and handles publication conflicts.
- Public SDK reads accept additive API fields while retaining required-field and rendering safety checks.
- Media used only by drafts can be detached and deleted with confirmation; published references remain protected.
- Upgrade API, SDK, site and builder together; custom export clients must follow cursors, with no new database migration since alpha.5 ([upgrade guide](docs/compatibility.md#alpha-6-upgrade-and-rollback)).

## 0.1.0-alpha.5

- Schema evolution supports field rename/removal hints and block migrations; entries gain unpublish, revert, duplicate and delete actions.
- Media gain descriptions and resolved public references; global models and SEO provide site-wide settings and metadata.
- Blocks support anchors, classes, hidden state and settings; nested fields, Gallery and Navigation expand content composition.
- Rich text adds code, rules and link options; organized forms add guidance and slug suggestions.
- Upgrade engine and site packages together, apply pending migrations and review public-contract and backup boundaries ([upgrade guide](docs/compatibility.md#alpha-5-upgrade-and-rollback)).

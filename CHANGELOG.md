# Changelog

Important changes and required upgrade actions; preparation alone does not
announce publication. See [release status and evidence](docs/alpha-release.md).

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

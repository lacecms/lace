## ADDED Requirements

### Requirement: Template 0.24.0 delivers global models and the starter settings global
The generator SHALL advance the managed template version to `0.24.0`. The
generated `lace.config.ts` SHALL declare, besides the `home` page and `posts`
collection, a `settings` global labelled "Site settings" with a required text
field `siteName` and an optional text field `tagline`. In starter mode the
user-owned base layout SHALL receive the published site from each page and
render a site header from `site.global("settings")`, showing the published
site name and non-empty tagline and falling back to static values in site
source when the global is unpublished. The managed Astro site guide SHALL
document `site.global()`, its `undefined` result for an unpublished global and
the fallback pattern. Template upgrade instructions SHALL state that the engine
requires migration `0007_content_model_global_kind`, a table rebuild of
`content_models`, with the Compose and Cloudflare backup, migration and sync
sequence, and that rolling back after a global exists requires restoring the
backup. They SHALL explain the `global` model kind, the Site group in Admin,
the public global endpoint and the additive `globals` export key, and that the
starter `settings` global and layout are optional and adopted by hand because
`lace.config.ts` and site files are user-owned. Upgrades SHALL preserve
user-owned files and retain deterministic managed hashes and existing conflict
detection.

#### Scenario: A new starter project is generated
- **WHEN** a starter project is generated
- **THEN** its manifest records template `0.24.0`, its configuration declares
  the `settings` global, and its base layout reads `site.global("settings")`
  with static fallbacks

#### Scenario: Existing project upgrades to 0.24.0
- **WHEN** a 0.23.0 project with unmodified managed files is upgraded
- **THEN** the upgrade instructions describe migration `0007`, the backup and
  rollback rule and the optional starter global, and user-owned files
  including `lace.config.ts` and site sources are unchanged

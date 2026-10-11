## ADDED Requirements

### Requirement: Template 0.23.0 delivers public delivery upgrade instructions
The generator SHALL advance the managed template version to `0.23.0`. Template
upgrade instructions SHALL state that the engine requires the additive
migrations `0005_content_model_structure` and `0006_media_descriptive_metadata`,
with the Compose and Cloudflare backup and migration sequence. They SHALL state
that every public content response and the build export changed shape (the
published entry returned directly with a resolved `media` dictionary, no
`draft` key), that the API, site packages and admin must be updated together,
and that code reading REST responses or the raw export must be updated while
pages using the published-site view keep working. They SHALL explain how to
adopt the new `image` and `hero` block sources with `lace add block`, with edited
sources reported as conflicts to update by hand. They SHALL carry the CE3B
step: raise the version of every model that allows `image` in `lace.config.ts`
and run configuration sync before building the site, because the render core
refuses `image` blocks still stored at version 1. The managed Astro site guide
SHALL document the image describer and the media lookups. Upgrades SHALL
preserve user-owned files and retain deterministic managed hashes and existing
conflict detection.

#### Scenario: Existing project upgrades to 0.23.0
- **WHEN** a 0.22.0 project with unmodified managed files is upgraded
- **THEN** the upgrade instructions describe migrations `0005` and `0006`, the
  public contract change, block source adoption and the `image` model version
  step, and user-owned files including `lace.config.ts` and site sources are
  unchanged

#### Scenario: A new project is generated
- **WHEN** a starter project is generated
- **THEN** its manifest records template `0.23.0` and its site block sources
  render effective alt text, dimensions and focal point

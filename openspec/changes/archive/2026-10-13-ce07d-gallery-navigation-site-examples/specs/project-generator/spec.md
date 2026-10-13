## ADDED Requirements

### Requirement: Template 0.27.0 delivers Gallery, Navigation and the navigation global
The generator SHALL advance the managed template version to `0.27.0`. The
generated `lace.config.ts` SHALL register all seven built-in blocks, SHALL let
the `home` page and the `posts` collection allow each of them at model
version 2, and SHALL declare a `navigation` global labelled "Navigation" with
no fields that allows only the `navigation` block. In starter mode the
user-owned site SHALL contain `GalleryBlock.astro` and `NavigationBlock.astro`
byte-identical to their registry items, recorded in `lace.site.json` and the
block map file and listed in the ownership inventory as user-owned; the
user-owned base layout SHALL render the published `navigation` global's blocks
in the site header through the block list and block map and SHALL render a
static fallback navigation with a link to the home page while the global is
unpublished; and the user-owned stylesheet SHALL contain the responsive
gallery grid and the navigation layout. The managed Astro site guide SHALL
document both blocks, their fields and part hooks, rendering a global's blocks
in a layout with a fallback, the navigation disclosure and current-page
behavior, the stylesheet rules, model-level group and list examples, the
list counters and limits, and where nested evolution and media rules are
described. Template upgrade instructions SHALL state that no database
migration is required; that the engine packages, admin and site packages move
together because older content packages lack the two definitions; and that
adoption is manual because `lace.config.ts` and site files are user-owned:
run `lace add block gallery navigation`, register the blocks, allow them in
models with a version bump, declare the `navigation` global, run sync,
publish the global, and render it from the layout. Upgrades SHALL preserve
user-owned files and retain deterministic managed hashes and existing
conflict detection.

#### Scenario: A new starter project is generated
- **WHEN** a starter project is generated
- **THEN** its manifest records template `0.27.0`, its configuration allows
  seven built-ins in `home` and `posts` at version 2 and declares the
  `navigation` global, its site holds the seven registry components with a
  matching lock and block map, and its layout renders the navigation global
  with a fallback

#### Scenario: Existing project upgrades to 0.27.0
- **WHEN** a 0.26.0 project with unmodified managed files is upgraded
- **THEN** the upgrade instructions describe the coordinated package upgrade,
  the absence of a migration and the manual adoption steps, and user-owned
  files including `lace.config.ts`, `lace.site.json` and site sources are
  unchanged

## MODIFIED Requirements

### Requirement: Registry items install byte-identical sources with their dependencies
The command SHALL read only the registry bundled with the installed CLI. It SHALL resolve each requested type to the item of that name for the selected framework, include the item's dependency closure, and fail for a type that has neither a registry item nor a configured custom definition, listing the available types. Installed component and stylesheet files SHALL be byte-identical to the registry sources and written under the components directory. When `lace.site.json` is absent, the command SHALL create it with the framework, components directory `src/components/lace`, block map `src/lace/blocks.ts`, and the installed items. After installation the lock SHALL record, per item, the registry revision and the SHA-256 of each installed file keyed by site-relative path.

#### Scenario: Fresh independent Astro site
- **WHEN** `lace add block cta gallery hero image navigation quote richText --site .` runs in an Astro site without Lace files
- **THEN** the seven components, Gallery's `ListLayout.css`, the block map file, and `lace.site.json` are created byte-identical to the committed starter's files

#### Scenario: Adding the CE7D blocks to an existing site
- **WHEN** `lace add block gallery navigation` runs in a site whose lock records the five earlier built-ins and whose block map is unmodified
- **THEN** `GalleryBlock.astro`, `ListLayout.css` and `NavigationBlock.astro` are installed, the lock records Gallery at revision 4 and Navigation at revision 1, the block map gains both entries in sorted order, and the five earlier components are unchanged

#### Scenario: Unknown block type
- **WHEN** `lace add block carousel` runs and neither the registry nor the configuration defines `carousel`
- **THEN** the command fails with a usage error listing the available types and writes nothing

#### Scenario: Edited stylesheet blocks its complete item update
- **WHEN** a newer Gallery revision changes the component or stylesheet and the
  installed stylesheet contains local edits that conflict with its target
- **THEN** neither Gallery file nor its lock revision changes, the existing
  conflict output names the CSS file with a diff and recovery options, and
  unrelated nonconflicting items retain existing installation behavior

#### Scenario: Companion paths are guarded and idempotent
- **WHEN** Gallery is installed into a custom components directory and then
  installed again with unchanged files
- **THEN** the relative CSS import resolves, both file hashes are recorded,
  the second run is current and a dry run writes no component, stylesheet or lock

#### Scenario: CSS conflict recovery does not break imports
- **WHEN** a conflicting Gallery update is requested with `--write-new`
- **THEN** proposed files are available through existing `.new` recovery without
  replacing the active component or stylesheet or advancing its lock revision

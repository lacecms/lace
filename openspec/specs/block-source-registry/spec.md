# block-source-registry Specification

## Purpose
Defines the canonical, framework-keyed registry of user-owned block sources, the site-local Lace configuration and lock file, and the generated block map file through which sites register installed blocks.

## Requirements

### Requirement: The registry holds one canonical source per framework block
The repository SHALL keep block sources in a framework-keyed registry with an index listing every item. Each item SHALL declare its name, framework, block type, block definition version, item revision, required render-core and adapter package ranges, its files with source and target role, and its item dependencies. The registry SHALL contain `astro` items for the `hero`, `richText`, `image`, `quote`, and `cta` built-in blocks whose components consume parsed block props and the adapter's rich-text component and preserve every documented `data-lace-*` hook. Registry content SHALL never be imported by a package at runtime.

#### Scenario: Registry index is complete
- **WHEN** the registry index is read
- **THEN** it lists exactly one `astro` item per built-in block type, each item manifest exists, its block definition version equals the built-in definition version, and every declared file exists

#### Scenario: Item manifest is inconsistent
- **WHEN** an item declares a block type other than the one its block definition version refers to, or a file it does not contain
- **THEN** registry verification fails and names the item

### Requirement: Sites record installed registry items in a site-local lock
A site using registry blocks SHALL have a `lace.site.json` at its root recording a format version, the framework, the components directory, the block map file path and its SHA-256 hash, and, per installed item, its revision and the SHA-256 hash of each installed file keyed by its site-relative path. Recorded paths SHALL stay inside the site root. Freshly installed files SHALL be byte-identical to their registry source, so their recorded hashes equal the registry file hashes.

#### Scenario: Fresh starter site
- **WHEN** a project is generated from the starter
- **THEN** its `site/lace.site.json` records framework `astro`, components directory `src/components/lace`, block map `src/lace/blocks.ts` with the hash of the generated map file, and the five built-in items with hashes matching their installed files

#### Scenario: Stale or escaping record
- **WHEN** a recorded hash differs from the file bytes or a recorded path leaves the site root in a Lace-maintained site
- **THEN** repository verification fails and names the site and path

### Requirement: Blocks are registered through a generated block map file
The block map file SHALL import built-in definitions from the content package, import each installed component from the components directory, and export a block map whose keys equal the definition types, sorted by block type. Definitions SHALL be imported, never copied. Pages SHALL pass this map to the adapter's block-list component.

#### Scenario: Starter map
- **WHEN** the starter is generated
- **THEN** `src/lace/blocks.ts` maps `cta`, `hero`, `image`, `quote`, and `richText` to their built-in definitions and installed components

### Requirement: Shared block sources cannot drift between sites
Every Lace-maintained site that installs registry blocks — the generated starter template, the engine reference site, and the existing-site connection fixture — SHALL hold byte-identical copies of the registry sources for the items it records, and the repository tests SHALL fail when any copy, lock record, or registry file diverges.

#### Scenario: Edited copy
- **WHEN** a contributor changes the hero component in the starter only
- **THEN** the parity test fails and names the starter path and the registry item

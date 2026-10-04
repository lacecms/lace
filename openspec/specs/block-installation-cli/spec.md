# block-installation-cli Specification

## Purpose
Defines the `lace add block` command that installs, registers, scaffolds, and updates user-owned block sources from the CLI-bundled registry into a site, without silently overwriting site edits.

## Requirements

### Requirement: The command selects a validated site root and framework
`lace add block` SHALL accept one or more block types or `--all` (not both), and the options `--site <dir>` (default `site`, relative to the working directory), `--framework <key>`, `--dry-run`, `--write-new`, and `--json`. It SHALL fail with a usage error for an unknown option, a repeated option, or no block selection. The site root SHALL exist and, for the `astro` framework, contain an `astro.config.*` file. The framework SHALL be taken from `lace.site.json`, else `--framework`, else detected from the site `package.json` dependencies, else `astro`; a `--framework` that differs from `lace.site.json` SHALL fail. The keys `react`, `vue`, and `svelte` SHALL fail with an explicit "framework not supported yet" error, and any other key SHALL fail as unknown. Every path the command writes or records (components directory, block map, item files) SHALL stay inside the site root; the `definitions` module is only imported and is never written; a lock that names a path outside it, an absolute path, or a symbolic link in a written path SHALL fail before any write.

#### Scenario: Missing Astro config
- **WHEN** `lace add block hero --site web` runs and `web/` has no `astro.config.*`
- **THEN** the command fails with a configuration error naming the site and writes nothing

#### Scenario: Reserved framework
- **WHEN** a site's `package.json` depends on `react` but not `astro` and no lock exists
- **THEN** the command fails with "framework not supported yet" for `react` and writes nothing

#### Scenario: Escaping lock path
- **WHEN** `lace.site.json` sets `componentsDir` to `../shared`
- **THEN** the command fails naming the escaping path and writes nothing

### Requirement: Registry items install byte-identical sources with their dependencies
The command SHALL read only the registry bundled with the installed CLI. It SHALL resolve each requested type to the item of that name for the selected framework, include the item's dependency closure, and fail for a type that has neither a registry item nor a configured custom definition, listing the available types. Installed component files SHALL be byte-identical to the registry sources and written under the components directory. When `lace.site.json` is absent, the command SHALL create it with the framework, components directory `src/components/lace`, block map `src/lace/blocks.ts`, and the installed items. After installation the lock SHALL record, per item, the registry revision and the SHA-256 of each installed file keyed by site-relative path.

#### Scenario: Fresh independent Astro site
- **WHEN** `lace add block cta hero image quote richText --site .` runs in an Astro site without Lace files
- **THEN** the five components, the block map file, and `lace.site.json` are created byte-identical to the committed starter's files

#### Scenario: Unknown block type
- **WHEN** `lace add block gallery` runs and neither the registry nor the configuration defines `gallery`
- **THEN** the command fails with a usage error listing the available types and writes nothing

### Requirement: The block map file is regenerated from the lock and guarded by its hash
After installation the command SHALL render the block map file from the recorded items and custom blocks: a one-line generated-file comment, the built-in definitions import when a registry item is recorded, a namespace import of the definitions module when a custom block is recorded, the block-map helper import, one component import per block, and `defineBlockMap` entries, all sorted by block type. It SHALL write the map only when the file is absent and unrecorded, or its bytes equal the recorded hash, and SHALL record the new hash. When the map was modified, it SHALL leave it unchanged, keep the recorded hash, report a conflict, and print the exact import lines and entries to add.

#### Scenario: Modified map
- **WHEN** a user edited `src/lace/blocks.ts` and then adds a block
- **THEN** the component is installed, the map is not rewritten, and the output contains the import line and the `defineBlockMap` entry for the new block

### Requirement: Repeated adds update unchanged files and never overwrite edits
For every file of a selected item the command SHALL decide from the recorded, current, and registry hashes: an absent untracked file is added; a file equal to the registry bytes is current (adopting an untracked identical file); an unmodified recorded file whose registry bytes changed is updated, and removed when the newer revision no longer contains it; a recorded file edited locally while the registry file is unchanged is preserved; a recorded file that is missing is restored; and an edited or untracked differing file whose registry bytes differ is a conflict. A conflict in any file SHALL leave every file of that item unchanged and its lock record as before, and SHALL report the item as a conflict with a unified diff. With `--write-new` the command SHALL additionally write the registry bytes to a `<path>.new` sibling for each conflicting file and for a conflicting block map. Writes SHALL be atomic and SHALL fail if a file changed after it was inspected. A run with no change SHALL write nothing. Conflicts SHALL exit with code 2.

#### Scenario: Idempotent re-add
- **WHEN** `lace add block --all` runs twice in a freshly generated project
- **THEN** both runs report every item current and no file bytes change

#### Scenario: Update of an unmodified file
- **WHEN** the bundled registry has a newer revision of `hero` and the installed hero component is unmodified
- **THEN** the component is replaced, the lock records the new revision and hash, and the map stays current

#### Scenario: Edited component with a newer revision
- **WHEN** the installed hero component was edited and the registry has a newer revision
- **THEN** the file is not changed, the item is reported as a conflict with a diff, the lock keeps the previous revision, and the command exits with code 2

### Requirement: Dry runs report the plan without writing
With `--dry-run` the command SHALL compute and report the same decisions, map changes, package requirements, and version mismatches as a real run, and SHALL write no file, lock, map, or `.new` sibling.

#### Scenario: Dry run on a new site
- **WHEN** `lace add block hero --dry-run --site .` runs in an Astro site without Lace files
- **THEN** the output lists the component, map, and lock as additions and the site is byte-identical afterwards

### Requirement: Package ranges and block versions are checked
The command SHALL read the installed versions of the packages each selected item requires from the site's dependency installation and, when a package is missing or outside the item's range, SHALL report it with the exact `pnpm --dir <site> add <name>@<range> ...` command; it SHALL never edit the site `package.json`. Missing packages SHALL NOT prevent file installation. When the project `lace.config.ts` exists in the working directory, the command SHALL load it and, for each selected registry item whose block type is registered there with a different definition version, SHALL refuse to install or update that item, report the registry and configured versions, and exit with code 2. When no configuration exists, the version check SHALL be reported as skipped; `--all` and custom-block scaffolding SHALL require the configuration.

#### Scenario: Missing adapter package
- **WHEN** a site has no installed `@lacecms/astro`
- **THEN** the blocks are installed and the output contains the exact `pnpm --dir` command adding the required adapter and render-core versions

#### Scenario: Block definition version mismatch
- **WHEN** `lace.config.ts` registers a `quote` definition at version 2 and the registry item targets version 1
- **THEN** the quote item is not installed, the mismatch names both versions, and the command exits with code 2

### Requirement: Configured custom blocks are scaffolded from their definitions
For a block type registered in `lace.config.ts` without a registry item, the command SHALL require a `definitions` module recorded in `lace.site.json`, SHALL load it, and SHALL find the export whose definition type equals the block type; it SHALL fail with an actionable error when no module is recorded or no matching export exists. It SHALL write a component named from the block type under the components directory, typed with `BlockProps` of the definition imported from the definitions module (never copied), rendering each field with a `data-lace-part` hook named after the field inside an element carrying `data-lace-block` and `data-lace-block-key`, rich-text fields through the adapter's rich-text component and media fields through `mediaUrl`. It SHALL record the component under `customBlocks` and register it in the block map. An existing scaffold SHALL never be rewritten. `--all` SHALL install every configured block type that has a registry item, scaffold the others when a definitions module is recorded, and report every configured block type left without a renderer.

#### Scenario: Custom block scaffold
- **WHEN** the configuration registers a custom `faq` block exported as `faq` from the recorded definitions module and `lace add block faq` runs
- **THEN** `FaqBlock.astro` is written typed from that definition, the map imports the definition from the module and registers the component, and the lock records it under `customBlocks`

#### Scenario: Missing definitions module
- **WHEN** `--all` runs, the configuration registers a custom block, and no `definitions` module is recorded
- **THEN** registry items are installed and the custom block type is reported as having no renderer with instructions to record a definitions module

### Requirement: Command output is deterministic and parseable
Text output SHALL list each item with its outcome (added, updated, current, conflict, blocked, scaffolded), each file decision with its reason, diffs for conflicts, the block map outcome, package commands, version mismatches, and missing renderers. With `--json` the command SHALL print one JSON object with `ok`, `code`, `message`, and `data` containing the same information. Success codes SHALL be `BLOCKS_INSTALLED`, `BLOCKS_CURRENT`, and `BLOCKS_PLAN` (dry run), pending outcomes (any conflict or version-blocked item) `BLOCKS_CONFLICTS` with exit code 2, and failures SHALL use stable error codes with the shared operation, reason, and recovery diagnostic.

#### Scenario: JSON conflict output
- **WHEN** an add with a conflict runs with `--json`
- **THEN** stdout is one JSON object with `ok: false`, `code: "BLOCKS_CONFLICTS"`, the file diff, and the exit code is 2

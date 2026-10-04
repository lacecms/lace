## Why

Step 30, session **30D — Block registry and `lace add block`**. Session 30C created the canonical `registry/`, the site-local `lace.site.json` lock, and the generated block map format, but nothing reads them: an existing Astro site still connects by hand-copying five components, a block map, and a lock from a freshly generated starter, and a custom block needs a hand-written component and map entry. Until the CLI installs, registers, and updates block sources with hash conflict detection, ADR 0006's "installed block source" half is unusable outside the starter, and 30E cannot point existing-site projects at a command.

## What Changes

- Bundle the repository `registry/` into the `@lacecms/cli` package at build time (`dist/registry/`), versioned with the CLI release; the CLI never fetches registry content over the network. The CLI validates the bundled index and item manifests and resolves items by framework and name.
- Add `lace add block <type...>` with `--all`, `--dry-run`, `--json`, `--site <dir>` (default `site`), `--framework <key>`, and `--write-new`:
  - selects the site root, rejects a missing root, a root without an Astro config, and lock paths that leave the site root;
  - takes the framework from `lace.site.json`, else `--framework`, else the site `package.json`, else `astro`; `react`, `vue`, and `svelte` fail with an explicit "framework not supported yet" error;
  - creates `lace.site.json` on first use with the default components directory and block map path;
  - resolves the item dependency closure, writes component files byte-identical to the registry, regenerates the block map file, and records revisions and SHA-256 hashes;
  - checks the installed `@lacecms/astro` and `@lacecms/render` versions against item ranges and prints the exact `pnpm --dir <site> add ...` command instead of editing `package.json`;
  - checks each registry item's block definition version against the definition registered in the project's `lace.config.ts` and refuses to install an item whose version differs;
  - `--all` installs every configured block type that has a registry item, scaffolds configured custom blocks, and reports block types left without a renderer;
  - for a configured custom block absent from the registry, scaffolds a `BlockProps`-typed component with the `data-lace-*` hook conventions that imports its definition from the `definitions` module recorded in `lace.site.json` (never copying it), and records it under `customBlocks`.
- Repeated adds and updates reuse the `lace upgrade` three-way hash decision, unified diff, and guarded atomic write: unchanged files are reported current or updated to a newer revision; modified or untracked differing files are never overwritten but reported as conflicts with a diff, and `--write-new` writes a `.new` sibling. A modified block map file is never rewritten; the CLI prints the exact import lines and map entries to add. Conflicts exit with the pending code (2).
- Extend the `lace.site.json` format (still `schemaVersion` 1, backward compatible): `blockMapSha256` may be `null` before Lace first writes a map, and an optional `customBlocks` record lists scaffolded custom block components.
- Advance the template to `0.10.0`: the existing-site guide, README, and operations guide direct operators to `lace add block` (for existing sites `lace add block --all --site <path>` from the CMS directory) instead of copying starter files. Upgrade instructions state that no site file changes.
- Diagnostics catalog entries for the new error codes.

Dependencies: Step 29, sessions 30A–30C. Non-goals: project creation site modes, mode-aware upgrade and doctor (30E); block data migration; network registries; React, Vue, or Svelte registry items or adapters; editing site `package.json`; removing installed blocks (a later command).

Externally visible outcome: operators install, register, and update Lace block sources in the starter or any Astro site with one command, without silent overwrites of their edits.

Governing architecture: §7 (ownership inside site trees, upgrade model), §13.5 (registry and `lace add block`), §13.6 (framework selection), §13.7 (block map file). ADR 0006.

## Capabilities

### New Capabilities

- `block-installation-cli`: the `lace add block` command — site and framework selection, registry resolution, installation and update decisions, conflicts, version and package checks, custom-block scaffolding, and output.

### Modified Capabilities

- `block-source-registry`: the registry is bundled with the CLI; the lock admits a not-yet-generated block map and scaffolded custom blocks; the CLI-generated map and lock reproduce the committed starter bytes.
- `generated-project-onboarding`: the existing-site guide and custom-block guidance use `lace add block` instead of copying starter files.
- `project-generator`: template `0.10.0` with updated guidance and upgrade instructions.

## Impact

- `packages/cli/src/**` (new block modules, `bin.ts`, `diagnostics.ts`, shared decision extracted from `upgrade.ts`), `packages/cli/package.json` build script and a registry bundling script, `turbo.json` CLI build inputs, CLI tests.
- `packages/create-lace/templates/{README.md,docs/lace-astro-site.md,docs/lace-operations.md,.lace/upgrade-instructions.json}`, `packages/create-lace/src/inventory.ts` and tests, `tests/fixtures/generated-project/*.json`, `packages/cli/src/upgrade-command.test.mjs`.
- Repository test proving the CLI reproduces the committed starter and existing-site fixture block files and a built independent site.
- Docs: `docs/mvp-implementation-roadmap.md` (30D completion), `docs/personal-site-guide.md` if it references the manual copy.
- Related accepted specs unchanged: `upgrade-planner` (its decision table is reused, not altered), `render-core` and `astro-adapter` (consumed as-is), `block-registry` (content definitions unchanged).

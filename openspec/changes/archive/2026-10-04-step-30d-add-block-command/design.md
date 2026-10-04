## Context

Session 30C fixed the registry item format (`registry/registry.json`, `registry/astro/<item>/item.json`), the `lace.site.json` lock (`schemaVersion` 1), and the block map file layout, and committed identical copies in the starter, `apps/site`, and the existing-site fixture (`tests/block-sources.test.mjs` enforces parity). `@lacecms/cli` has no block command. Its `lace upgrade` implementation already owns the pieces this change needs: a three-way managed-file decision inside `planUpgrade`, `unifiedUpgradeDiff`, `upgradeHash`, symlink- and case-alias-safe reads (`readUpgradeFile`), and compare-and-swap atomic writes (`atomicWrite` with an expected hash). The CLI loads the project's `lace.config.ts` with a native dynamic import (Node 24 type stripping) for `content sync`.

## Goals / Non-Goals

**Goals:**

- One shared hash/decision/write implementation for template upgrades and block installation.
- CLI output byte-identical to the committed starter lock, map, and components, so the starter is "what `lace add block --all` installs".
- Crash-safe, convergent re-runs without a second transaction journal.

**Non-Goals:**

- Removing blocks, renaming components, or migrating block data.
- Editing site `package.json`, running `pnpm`, or network access.
- Site-mode awareness of the project manifest (30E).

## Decisions

### Registry bundling

`packages/cli/scripts/bundle-registry.mjs` copies the repository `registry/` into `packages/cli/dist/registry/` after `tsc`; the package already publishes `dist`. `turbo.json` gains a `@lacecms/cli#build` task whose inputs add `$TURBO_ROOT$/registry/**` so registry edits invalidate the cached build. At runtime `new URL("./registry/", import.meta.url)` locates it. A repository test asserts byte equality between `registry/` and the bundled copy.

*Alternatives:* publishing `registry/` as a separate package (extra release artifact and version skew); embedding sources as TypeScript string constants (unreviewable diffs, breaks byte parity with the committed `.astro` files).

### Module layout (`packages/cli/src`)

- `blocks-registry.ts` — loads and validates the bundled index and manifests (shape, framework key, safe relative paths, one `component` file per item, dependency names exist, no cycles), resolves dependency closures.
- `blocks-site.ts` — site root, framework selection, `lace.site.json` parse/validate/serialize, path containment, installed-package lookup, configuration and definitions-module loading.
- `blocks-map.ts` — renders the block map and the "entries to add" snippet; renders custom-block scaffolds.
- `blocks-plan.ts` — computes the plan (per-file decisions, item outcomes, map decision, lock bytes).
- `blocks-command.ts` — argument parsing, applying the plan, text/JSON presentation.
- `managed-decision.ts` — the three-way decision extracted from `planUpgrade` and reused by both commands.

`BlockError` (codes `BLOCK_USAGE`, `BLOCK_INPUT`, `BLOCK_REGISTRY`, `BLOCK_FRAMEWORK`, `BLOCK_CONFIG`) is handled by `describeFailure`; the diagnostics catalog gains matching entries. `identifyOperation` recognizes `add block`.

### Shared three-way decision

`decideManagedFile({ tracked, baselineHash, currentHash, targetHash })` returns the action and reason that `planUpgrade` produces today (`add`, `current`, `preserve`, `replace`, `remove`, `conflict` with the existing reason strings); `planUpgrade` calls it, keeping its ownership pre-checks outside, so upgrade behavior and tests stay unchanged. Block planning calls the same function and applies two block-specific adjustments: an untracked file whose bytes equal the target is `current` (adoption, which also makes interrupted runs converge), and a tracked file that is missing is restored (`add`, reason `restored-missing-file`) because the operator explicitly requested the block.

### Writes, atomicity, and recovery

Planning reads every input once and records the hash it saw. Applying writes component files item by item with `atomicWrite(siteRoot, path, bytes, 0o644, expectedHash)`, then the map, then `lace.site.json` last, each with compare-and-swap on the hash read during planning. Removals unlink after re-checking the expected hash. `lace.site.json` is the commit record: if the process stops early, the written files are byte-identical to the registry and the next run adopts them as current and records them. A separate transaction journal (as in `lace upgrade`) is rejected: upgrade must restore the old manifest bytes for rollback, while block installation is convergent and its only rollback is re-running or editing user-owned files. File-layer `UpgradeError`s are rethrown as `BLOCK_INPUT` with block-neutral messages. The site root is resolved with `realpath` before planning so platform temp-directory symlinks do not trip the no-symlink rule, while symlinks inside the site still fail.

Mode: installed sources are written `0o644` (user source, not secrets), unlike upgrade metadata.

### Item atomicity and conflicts

An item is installed only if none of its files conflicts and its block version is not blocked; otherwise all of its files are left untouched and its lock record is kept. The block map is rendered from the resulting lock state (recorded items plus custom blocks). Map decision: absent and unrecorded → add; bytes equal recorded hash → replace (or current if unchanged); bytes equal target → current; otherwise conflict, and the output prints the import lines and entries for blocks missing from the existing file (determined by substring match on the generated entry line). With a map conflict, `blockMapSha256` is kept. `--write-new` writes `<path>.new` for conflicting files and the map with the same atomic primitive (overwriting an earlier `.new`).

### Lock format

Key order: `schemaVersion`, `framework`, `componentsDir`, `blockMap`, `blockMapSha256`, optional `definitions`, `items`, optional `customBlocks`. Items and custom blocks are sorted by name; file maps sorted by path. Unknown keys fail validation (fail closed, consistent with the upgrade manifest). `blockMapSha256: null` is allowed only before Lace writes a map. Lock bytes are written only when they differ, so an unchanged run writes nothing.

### Framework detection

`lace.site.json` → `--framework` → site `package.json` (`astro` dependency → `astro`; else `react`/`next` → `react`, `vue`/`nuxt` → `vue`, `svelte`/`@sveltejs/kit` → `svelte`) → `astro`. Supported set `{astro}`, reserved `{react, vue, svelte}`. For `astro` the site root must contain `astro.config.{mjs,js,ts,mts,cjs,cts}`.

### Configuration, versions, and packages

`lace.config.ts` is loaded from the working directory when it exists (same import as `content sync`); its `runtime.blocks.blocks` list is the set of configured block types and versions. A configured type with a registry item for the framework is "registry-backed" and gets its version compared with `item.blockVersion`; any other configured type is custom. Installed package versions are read from the nearest `node_modules/<name>/package.json` walking up from the site root and checked with `semver.satisfies(version, range, { includePrerelease: true })`. The reported command is `pnpm --dir <site> add <name>@<range>...` using the `--site` value as typed.

### Custom block scaffolds

The `definitions` value is a module path relative to the site root (it may point outside the site, for example `../lace.blocks.ts`, because it is only imported). The CLI imports it, picks the export whose value has a matching `type` and a `validate` function, and fails if none or several match. The component file name is the PascalCase block type plus `Block.astro` (`pricing-table` → `PricingTableBlock.astro`). The map imports `* as definitions` from the module path relative to the map file with a `.ts` extension removed; the scaffold uses `import type * as definitions` and `BlockProps<typeof definitions.<export>>`. Field rendering: text-like fields in `<p data-lace-part="<key>">`, URLs as links, rich text through `RichText`, media as `<img alt="" src={mediaUrl(...)}>`, booleans as `data-lace-state`; optional fields are guarded.

## Risks / Trade-offs

- [A custom block reuses a built-in type name with different fields] → the registry component would mistype it; documented, and the version check catches the common case of a bumped definition.
- [Substring-based "missing entries" detection for an edited map] → it only shapes the printed hint; the map is never rewritten, so a false hint cannot cause damage.
- [Concurrent `lace add block` runs on one site] → compare-and-swap writes make the second run fail on a changed file instead of overwriting; no lock file is written into user site trees.
- [Template guidance bump to `0.10.0` immediately followed by 30E] → acceptable; template versions are cheap and both remain unreleased until the next alpha.

## Migration Plan

Existing generated projects already contain a valid `lace.site.json`; after updating `@lacecms/cli`, `pnpm exec lace add block --all` reports their blocks current. The `0.10.0` template upgrade changes only managed guides. Rollback is reinstalling the previous CLI; installed block files remain ordinary user source.

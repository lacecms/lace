## Context

`create-lace` copies every `TEMPLATE_FILES` entry, interpolates `{{PROJECT_NAME}}` where marked, hashes managed bytes, and writes `.lace/manifest.json` (`schemaVersion`, `templateVersion`, `files`). Site layout is hard-coded in managed files: `pnpm-workspace.yaml` (`packages: [site]`), root `package.json` scripts (`pnpm --dir site ...`), `.env.example` and Compose build-site defaults (`.`, `site`, `dist`, site identity), `wrangler.jsonc` and the Cloudflare workflow (`site/dist`). `lace upgrade` compares the project manifest with a manifest from a freshly generated template project and validates manifests with an exact key set. The Node runtime already handles a missing builder: without `LACE_BUILDER_URL` the dispatcher uses `NoopNodeBuildTrigger` (`trigger_unavailable`), and without `LACE_BUILD_SITE_ID`/`LABEL` the build-site endpoint returns `null`. `lace doctor` has no site check. Session 30D added `lace add block --site <dir>`.

## Goals / Non-Goals

**Goals:**

- Mode-specific managed files from one template set, starter output unchanged except for the template version.
- Upgrades stay a pure three-way file comparison; mode-awareness is an input check, not a renderer inside the CLI.
- No runtime (API, dispatcher, builder) code change.

**Non-Goals:**

- Mode switching for an existing project, multiple sites, non-Astro frameworks.
- Detecting existing sites anywhere except the target's parent directory.

## Decisions

### Flag names and selection

`--starter`, `--existing-site <path>`, `--no-site` (mutually exclusive; `--no-site` + `--cloudflare` is a usage error because Pages has nothing to deploy). The existing parser treats every `--` argument as a flag; it is extended to take the value after `--existing-site`. Prompting uses `node:readline/promises` only when `stdin.isTTY && stdout.isTTY`; `runCli` gains injectable `stdin`/`isInteractive` for tests. Prompt: a numbered choice (`1` starter, `2` existing, `3` none) with the detected default in brackets, then the path with default `..`. Invalid answers re-prompt up to three times, then fail with usage. Detection reads `<parent>/astro.config.{mjs,js,ts,mts,cjs,cts}` and `<parent>/package.json` (`dependencies`/`devDependencies.astro`).

*Alternative:* `--site <mode> [--site-path <path>]` — one more flag for the common case and an invalid-combination matrix; rejected.

### Path rules

Validated before staging: segment grammar from the spec, resolved location outside the target, `lstat` on every component from the target's parent to the site (no symlinks), Astro config plus `astro` dependency present. The path is stored as typed (normalized: no trailing slash). It is never written to, and the post-generation acceptance test hashes the site before and after.

### Rendering managed files

`TemplateFile` gains an optional `modes` list (default: all modes). `site/**` entries are `modes: ["starter"]`; Cloudflare entries `["starter", "existing"]`. A new `render.ts` module applies mode transforms after interpolation:

- **Structured files** (`package.json`, `pnpm-workspace.yaml`): `package.json` is parsed and its `scripts` adjusted, then serialized with two-space JSON and a trailing newline (equal to the committed template bytes for starter, verified by test); `pnpm-workspace.yaml` drops the `packages:` block for non-starter modes (pnpm 12 accepts a settings-only workspace file).
- **Marked text files** (`README.md`, `docs/lace-operations.md`, `docker-compose.yml`, `.env.example`, `.github/workflows/cloudflare.yml`, `wrangler.jsonc`): templates carry line markers `# lace-site: starter existing` … `# lace-site: end` (YAML/env), `<!-- lace-site: ... -->` (Markdown), and `// lace-site:` (JSONC). The renderer keeps blocks whose mode list includes the selected mode, drops the others, and removes marker lines; `{{SITE_PATH}}` is substituted. Unbalanced or unknown markers fail generation (and a unit test checks every template). Marker lines never reach generated files, so starter output differs from 0.10.0 only where content intentionally changed.

*Alternatives:* separate template copies per mode (three drifting copies of Compose and README); string replacement against starter text (silent breakage when templates change). Markers keep one source and fail loudly.

### Compose in no-site mode

Marked blocks remove the `builder` service, the dispatcher's `LACE_BUILDER_URL`, `LACE_BUILDER_SECRET`, and `builder` dependency, the API's `LACE_BUILD_SITE_ID`/`LABEL` (via the shared `api-environment` anchor), and the unused `build-egress` network. `web`, `static-output-init`, and `static-output` stay so `/admin` and `/api` remain proxied on the web port; `/` returns the existing 503 "Site build pending" text. `.env.example` keeps `LACE_BUILDER_SECRET` and `LACE_BUILDER_IMAGE` so `lace env prepare` and doctor's compose settings stay unchanged (documented as unused).

### Manifest site record and upgrade

Manifest gains `site` between `templateVersion` and `files`. `validateUpgradeManifest` accepts the key optionally, validates mode/path, and normalizes absence to `{ mode: "starter", path: "site" }` for comparison only (the validated object keeps the absent key so `mergedManifest` and saved journal manifests round-trip). `planUpgrade` and `applyUpgrade` compare the normalized site of project and template before planning and throw `UPGRADE_INPUT` with "Generate the template with: create-lace <dir> --existing-site <path>" (or `--starter`/`--no-site`). `mergedManifest` takes `site` from the target, so a legacy starter project gains its record on apply. `site/**` remains user source in `isUserSource`; non-starter templates simply contain no `site/` paths, so nothing under `site/` is ever added.

*Alternative:* re-render the template inside the CLI for the project's mode — duplicates create-lace rendering in `@lacecms/cli` (or adds a dependency between them); rejected.

### Doctor site check

New `site` check after `settings`, using `io.file` for every read (bounded, no symlink follow). It reads the manifest via the same validator, then probes `<site>/package.json`, `astro.config.*`, nearest `node_modules/@lacecms/{astro,render}/package.json` walking up from the site, `lace.site.json`, and its `blockMap`. Observations: `SITE_NOT_APPLICABLE` (skipped), `SITE_NONE` (pass), `SITE_MISSING`/`SITE_NOT_ASTRO`/`MANIFEST_INVALID` (config), `SITE_PACKAGES_MISSING`/`SITE_BLOCKS_MISSING` (unfinished), `SITE_READY` (pass).

### Tests and acceptance

Snapshot fixtures become `default.json`, `cloudflare.json`, `existing.json`, `existing-cloudflare.json`, `none.json`; the snapshot phase generates existing-mode projects next to a minimal Astro fixture parent. A new acceptance phase `existing-site` generates `cms/` inside a copy of `tests/fixtures/existing-astro-site` minus its Lace files, installs from packed packages, runs `lace add block --all --site ..`, serves the reference published export, and builds the parent site with the CMS-rendered root `build` script; CI runs it next to `starter`.

## Risks / Trade-offs

- [Operators upgrade with a template generated in the wrong mode] → explicit `UPGRADE_INPUT` naming the flags; no files change.
- [Old CLI reads a 0.11.0 manifest] → fails closed with the existing invalid-manifest message; instructions say to update `@lacecms/cli` first.
- [Existing site is a workspace package rather than a standalone root] → generated defaults assume a standalone root; guide and README explain adjusting `LACE_BUILD_SOURCE_ROOT`/`LACE_BUILD_SITE_DIR` per Step 29.
- [Cloudflare workflow lives under `cms/.github/`] → GitHub reads workflows only at the repository root; the README tells existing-site operators to move it and set its working directory.
- [Interactive prompt in CI wrappers with a pseudo-TTY] → explicit flags always win; non-TTY default remains starter.

## Migration Plan

Existing projects keep working: their manifests lack `site` and are treated as starter. Operators update `@lacecms/cli`, generate a `0.11.0` template in the same mode, and run `lace upgrade`. Projects that generated an unused `cms/site` for an existing parent site may regenerate with `--existing-site ..` and compare; the generator never migrates modes automatically.

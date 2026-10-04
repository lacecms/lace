## Why

Step 30, session **30E — Project creation with an optional starter**. `create-lace` always generates the starter `site/`, and its managed files hard-code that layout (`pnpm-workspace.yaml` lists `site`, root scripts run `pnpm --dir site`, Compose defaults to `LACE_BUILD_SITE_DIR=site`, the Cloudflare files deploy `site/dist`). An operator with an existing Astro site must generate an unused example site inside `cms/`, then re-point build-site settings by hand; a headless installation carries a site it never builds. Session 30D delivered `lace add block`, so an existing site can now be connected without copying the starter, and creation can make the starter optional.

## What Changes

- `create-lace` gains three mutually exclusive site-mode flags:
  - `--starter` — generate `site/` from the starter (current behavior);
  - `--existing-site <path>` — generate no `site/` and connect an existing Astro site at `<path>`, relative to the generated project and outside it (typically `..` for a `cms/` subdirectory); the path must exist and contain an Astro project, and the generator never modifies it;
  - `--no-site` — generate the CMS only; `--cloudflare` is rejected with it.
- Mode selection: an explicit flag wins. In an interactive terminal without a flag the generator asks for the mode; when the target's parent directory is an Astro project (`astro.config.*` and an `astro` dependency) the default answer is *existing site* at `..`, otherwise *starter*. Without a TTY and without a flag, *starter* is used and the output names the other flags. `init .` keeps the empty-target rule in every mode.
- Managed files are rendered from the mode and path, reusing the Step 29 build-site variables: `pnpm-workspace.yaml` lists `site` only in starter mode; root `dev`/`build`/`typecheck` scripts target `site`, run `astro` in the existing site, or are omitted; `.env.example` and Compose default to `LACE_BUILD_SOURCE_ROOT=<path>`, `LACE_BUILD_SITE_DIR=.`, `LACE_BUILD_OUTPUT_DIR=dist` for an existing site; in *no site* mode Compose has no builder, the dispatcher has no builder trigger, and no build-site identity is configured, so builds fail with the existing `trigger_unavailable` reason and Admin shows an unconfigured site; the Cloudflare workflow and Pages config deploy `<path>/dist` for an existing site. README and the operations guide contain mode-specific sections.
- **BREAKING (manifest format):** `.lace/manifest.json` records `site: { mode: "starter" | "existing" | "none", path }`. Older CLIs reject the new manifest field; manifests without `site` are read as starter mode with path `site`.
- `lace upgrade` validates that the target template was generated for the same site mode and path as the project and otherwise fails with the exact `create-lace` flags to regenerate it; it never creates or touches `site/` for non-starter projects and keeps hash conflict detection.
- `lace doctor` gains a `site` check from the manifest: *none* passes with a headless note; otherwise the site directory must exist and be an Astro project, `@lacecms/astro` and `@lacecms/render` must be installed, and `lace.site.json` and the block map must exist (missing packages or blocks are expected during `setup`, failures during `ready`). Projects without a manifest skip the check.
- Generator output and README next steps: *existing site* points to `pnpm exec lace add block --all --site <path>` and `docs/lace-astro-site.md`; *no site* points to the same guide for a later connection.
- Template `0.11.0` with upgrade instructions.

Dependencies: Step 29 build-site selection; sessions 30A–30D. Non-goals: installing the CMS into a nonempty project; switching the mode of an existing project (documented as regenerate-and-compare); non-Astro frameworks; changing builder or dispatcher runtime code; Cloudflare CMS onboarding (Step 31).

Externally visible outcome: a project can be created with the starter, against an existing Astro site, or without a site; upgrade and doctor respect the recorded mode.

Governing architecture: §7 (generated layout, site modes, ownership, upgrade model), §13.5 (`lace add block`), build-site selection (Step 29). ADR 0006.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-generator`: site-mode flags, interactive selection, path validation, mode-rendered managed files, manifest site record, generator next steps, template `0.11.0`.
- `upgrade-planner`: manifests may carry a site record; planning rejects a template generated for a different site mode or path.
- `environment-doctor`: a manifest-driven site check.
- `build-site-selection`: generated defaults follow the site mode (existing site selected directly; no builder in *no site* mode).
- `generated-project-onboarding`: README and guides describe the project's own site mode and its next steps.

## Impact

- `packages/create-lace/src/{index.ts,inventory.ts}` (mode parsing, prompt, detection, renderers) and tests; templates `README.md`, `docs/lace-operations.md`, `docker-compose.yml`, `.env.example`, `package.json`, `pnpm-workspace.yaml`, `.github/workflows/cloudflare.yml`, `wrangler.jsonc`, `.lace/upgrade-instructions.json`.
- `packages/cli/src/{upgrade-input.ts,upgrade.ts,upgrade-apply.ts,doctor*.ts}` and tests.
- `tests/fixtures/generated-project/*.json` (per-mode snapshots), `scripts/generated-project-acceptance.mjs` (snapshot variants and an existing-site end-to-end phase), CI workflow.
- Docs: `docs/mvp-architecture.md` §7 (flag names), `docs/mvp-implementation-roadmap.md`, `docs/personal-site-guide.md`.

## 1. Generator mode selection

- [x] 1.1 Extend `runCli` parsing with `--starter`, `--existing-site <path>`, `--no-site` (mutual exclusion, missing path, `--no-site --cloudflare` → exit 2) and injectable interactivity/stdin; verify parser unit tests for every valid and invalid combination.
- [x] 1.2 Implement Astro-parent detection and the interactive prompt (defaults, re-prompt, failure after three invalid answers) plus the non-TTY starter note; verify tests with and without a detected Astro parent and without a TTY.
- [x] 1.3 Implement existing-site path validation (grammar, outside target, no symlink components, Astro config and dependency); verify tests for inside-target, escaping symlink, non-Astro, missing, and valid `..`.

## 2. Mode rendering and manifest

- [x] 2.1 Add `modes` to `TemplateFile`, the marker renderer with `{{SITE_PATH}}`, and structured transforms for `package.json` and `pnpm-workspace.yaml`; verify unit tests that starter `package.json` bytes are unchanged, unbalanced/unknown markers fail, and no marker line reaches output for any template file.
- [x] 2.2 Add markers to `docker-compose.yml`, `.env.example`, `.github/workflows/cloudflare.yml`, `wrangler.jsonc`, `README.md`, and `docs/lace-operations.md` with existing-site and no-site content per the spec; verify generated files per mode (Compose has no builder in no-site mode, existing-site defaults mount the path with `.`/`dist`, README next steps) and `docker compose config` succeeds for each mode when Docker is available.
- [x] 2.3 Record `site` in `.lace/manifest.json` and print mode-specific next steps; verify manifest and output tests per mode and that the existing site is byte-identical after generation.

## 3. Upgrade and doctor

- [x] 3.1 Accept and validate the optional manifest `site` record in `validateUpgradeManifest`, normalize legacy manifests to starter, compare project and template sites in `planUpgrade`/`applyUpgrade` with the regeneration hint, and carry `site` through `mergedManifest`; verify upgrade tests: legacy 0.10 starter → 0.11 starter, existing → existing without touching the parent site, none → none, and mode mismatch failing without writes.
- [x] 3.2 Add the doctor `site` check with its observation codes; verify doctor tests for no manifest, none, existing without packages/blocks (expected at setup, fail at ready), missing directory (exit 4), and a ready starter site.

## 4. Template version, snapshots, acceptance

- [x] 4.1 Advance the template to `0.11.0` with upgrade instructions, update `TEMPLATE_VERSION` and version assertions, and add per-mode snapshot fixtures to the snapshot phase; verify `node scripts/generated-project-acceptance.mjs snapshots` and create-lace/CLI tests pass.
- [x] 4.2 Add the `existing-site` acceptance phase (generate `cms/` in a copy of the existing-site fixture, install packed packages, `lace add block --all --site ..`, build the parent site against the published export) and run it in CI; verify the phase passes locally.

## 5. Docs and completion

- [x] 5.1 Update `docs/mvp-architecture.md` §7 with the fixed flag names and manifest record, the roadmap 30E completion note, and `docs/personal-site-guide.md`; verify the documents name `--existing-site` and `--no-site` consistently.
- [x] 5.2 Run root typecheck, `pnpm lint`, `pnpm format:check`, the narrow suites above, and `pnpm exec openspec validate step-30e-optional-starter-site-modes --type change --strict`; verify all pass.

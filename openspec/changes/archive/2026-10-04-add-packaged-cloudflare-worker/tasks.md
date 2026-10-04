## 1. Architecture and roadmap alignment

- [x] 1.1 Update `docs/mvp-architecture.md` (Cloudflare deployment, generated project layout with `worker/`, site modes allowing `--no-site --cloudflare`, configuration import note) and mark 31A scope in the roadmap if wording conflicts; verify by re-reading the affected sections against design D2/D5

## 2. Packaged admin assets

- [x] 2.1 Add `packages/platform-cloudflare/scripts/copy-admin-assets.mjs`, extend the build script and `files` with `admin`, ignore `packages/platform-cloudflare/admin/`, and wire `@lacecms/platform-cloudflare#build` in `turbo.json` (dependsOn admin build, outputs `dist/**`, `admin/**`); verify `pnpm turbo run build --filter=@lacecms/platform-cloudflare` produces `admin/index.html`
- [x] 2.2 Build the admin before the API graph in `apps/api/Dockerfile`; verify by inspecting the command order
- [x] 2.3 Require `admin/index.html` for `@lacecms/platform-cloudflare` in `inspectPackage` and include `@lacecms/app-admin` in release build filters if needed; verify with a unit test in `tests/release-artifacts.test.mjs`

## 3. CLI

- [x] 3.1 Parameterize environment preparation and accept `lace env prepare --target cloudflare-local` (template `worker/.dev.vars.example`, destination `worker/.dev.vars`, controlled `LACE_AUTH_SECRET`); reject other targets; update usage/diagnostics; verify with CLI tests for success, existing destination, invalid template and rejected targets
- [x] 3.2 Resolve Wrangler upward from the configured Wrangler file's directory and fail with CONFIG when absent; verify with migrate tests for subdirectory config and missing Wrangler

## 4. Generator templates and rendering

- [x] 4.1 Add `lace-cloudflare` marker rendering and the `cloudflare` input to `renderForSite`/root-package rendering; verify with renderer unit tests (on/off, nesting with site markers, malformed marker)
- [x] 4.2 Add `worker/index.ts`, `worker/wrangler.jsonc`, `worker/.dev.vars.example`; remove root `wrangler.jsonc`; update the Pages workflow, `.gitignore`, root `package.json` (Worker deps, `cf:*` scripts) and `.env.example`; update the inventory (ownership, modes) and accept `--no-site --cloudflare` with Cloudflare next steps; verify with create-lace tests per mode with and without Cloudflare
- [x] 4.3 Write README and operations-guide Cloudflare Worker guidance (local state, explicit targets, secrets, same-origin admin/API, remote provisioning order, separate Astro deployment, export/media origins) under Cloudflare markers; verify text assertions in onboarding tests
- [x] 4.4 Advance the template to `0.12.0` with upgrade instructions, align `release/alpha.json` handling if validated, and add an upgrade test from a 0.11 Cloudflare starter fixture; verify planner removes the unchanged Pages config, adds managed Worker files and never creates `worker/wrangler.jsonc`

## 5. Acceptance

- [x] 5.1 Add `scripts/cloudflare-consumer-acceptance.mjs`, the `cloudflare` phase and `pnpm acceptance:cloudflare`, and use it in the `all` phase instead of the source-workspace Worker smoke; add the `none-cloudflare` snapshot variant
- [x] 5.2 Regenerate `tests/fixtures/generated-project/*.json` snapshots and update static acceptance tests; verify `node scripts/generated-project-acceptance.mjs` snapshot comparison passes
- [x] 5.3 Run `pnpm acceptance:cloudflare` end to end; verify bundle, admin assets, setup/login/models/media and restart persistence pass

## 6. Quality gates

- [x] 6.1 Run focused package tests (platform-cloudflare, cli, create-lace, root tests), root typecheck, `pnpm lint`, `pnpm format:check` and `openspec validate add-packaged-cloudflare-worker --type change --strict`; all pass

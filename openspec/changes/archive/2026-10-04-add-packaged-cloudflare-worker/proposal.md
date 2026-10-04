## Why

Roadmap Step 31, session **31A — Packaged Worker deployment and configuration**.
A project generated with `--cloudflare` today receives only a Pages-oriented
`wrangler.jsonc` (`pages_build_output_dir`) and a manual Pages workflow. The CMS
Worker, its D1/R2 bindings and the compiled admin exist only inside the engine
checkout (`apps/api/wrangler.jsonc`, `apps/api/worker/index.ts`,
`apps/admin/dist`), so a consumer cannot run or deploy the second supported
runtime without the Lace source. Step 25 explicitly deferred this; Steps 26–30
now provide the setup, diagnostics, site-mode and rendering foundations it
depends on.

## What Changes

- `@lacecms/platform-cloudflare` ships the matching compiled admin assets in a
  packaged `admin/` directory, so a consumer Worker can bind them through the
  Workers static-assets binding without the engine checkout. Release
  verification requires them.
- `--cloudflare` generates a separate CMS Worker in `worker/`:
  - managed `worker/index.ts` — the Worker entry, statically importing the
    project's `lace.config.ts` and composing `createCloudflareWorker`;
  - user-owned `worker/wrangler.jsonc` — Worker name, compatibility date,
    `nodejs_compat`, D1 `DB` with migrations from the installed `@lacecms/db`,
    R2 `MEDIA`, packaged admin `ASSETS`, the scheduled recovery cron, plain
    variables, a documented optional KV `CACHE` policy (no-op cache when absent)
    and placeholder resource IDs; it contains no secrets;
  - managed `worker/.dev.vars.example` — the local Worker variables template.
- **BREAKING (template)**: the root Pages `wrangler.jsonc` is removed. Static
  Astro hosting stays in the managed Pages workflow, which deploys the site
  output directory explicitly; Worker and Astro hosting configuration are
  separate.
- Cloudflare projects receive direct `@lacecms/platform-cloudflare` and
  `@lacecms/db` dependencies, root `cf:*` scripts for local preparation,
  migration, synchronization, bootstrap, development and an account-free bundle
  check, and Cloudflare local operator defaults in `.env.example`. Remote
  provisioning, remote migration, secrets and deployment stay explicit,
  documented commands; no generated script mutates a Cloudflare account.
- `lace env prepare --target cloudflare-local` creates the protected, ignored
  `worker/.dev.vars` with a fresh auth secret under the existing safe publication
  rules. The CLI finds the project's Wrangler executable from the configured
  Wrangler file's directory upward.
- `--no-site --cloudflare` becomes valid: it generates the CMS Worker without the
  Pages workflow.
- Template version `0.12.0`, regenerated snapshots, upgrade instructions,
  README, operations guide and architecture are updated. Generated guidance
  documents local state, explicit local/remote migration, sync and bootstrap
  targets, secret provisioning, same-origin admin/API, and the published build
  export and media origins for the separate Astro deployment, without claiming
  that Pages configuration deploys the CMS.
- Acceptance verifies a packed generated Cloudflare consumer bundling and
  starting its own Worker with persistent local D1/R2, admin assets and project
  configuration (`pnpm acceptance:cloudflare`).

## Capabilities

### New Capabilities

- `cloudflare-consumer-worker`: the generated consumer's packaged Worker entry,
  Worker configuration, bindings, admin assets, local state and secret
  conventions, and the separation from Astro hosting.

### Modified Capabilities

- `project-generator`: Cloudflare files and ownership, `--no-site --cloudflare`,
  cloudflare-rendered managed files, template `0.12.0` upgrade.
- `generated-project-onboarding`: README and operations guidance describe the
  generated CMS Worker instead of declaring it out of scope.
- `generated-project-acceptance`: the optional Cloudflare flow runs the packed
  consumer's own Worker instead of the source-workspace Worker smoke.
- `operational-cli`: `env prepare` accepts `--target cloudflare-local`; Wrangler
  executable resolution for configured Wrangler files.
- `alpha-release-artifacts`: the packed Cloudflare platform package must contain
  the compiled admin assets.

## Impact

- Architecture: §6 Cloudflare deployment, the generated project layout and site
  modes (`--cloudflare` no longer rejected for `--no-site`), §16 configuration
  import, §18 development modes.
- Code: `packages/platform-cloudflare` (admin asset packaging script, files),
  `turbo.json`, `apps/api/Dockerfile` build order, `packages/create-lace`
  (templates, inventory, renderer, CLI parsing), `packages/cli` (environment
  preparation, migration executable lookup), `scripts/release-artifacts.mjs`,
  `scripts/generated-project-acceptance.mjs` and a new Cloudflare consumer
  journey, `tests/fixtures/generated-project/*`.
- Dependencies: none new; Wrangler is already pinned in the generated project.
- Non-goals: real-account provisioning or deployment, the full browser/publish/
  deploy-hook journey and doctor diagnostics (31B), Cloudflare Vite integration,
  an SSR Astro adapter, changes to Worker runtime behavior or the API contract.

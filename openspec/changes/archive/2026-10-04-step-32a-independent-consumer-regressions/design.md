## Context

`scripts/generated-project-acceptance.mjs` already packs the Lace graph,
installs disposable consumers from tarballs, scans secrets and dispatches named
phases (`node`, `packages`, `starter`, `existing-site`, `publication-visibility`,
`build-site`, `cloudflare`, `release`, `all`). Each feedback fix of Steps 26–31
is proven in its own phase, often on a separate project: environment
preparation and doctor in `packages` (with a fake Docker binary), browser setup
only in the Cloudflare journey, the tour only in admin e2e with a mocked API,
visibility only in `publication-visibility`. Phase `all` (the CI workflow's
`pnpm acceptance:generated`) writes `.env` itself, creates the administrator by
API, and runs Node → Compose production → Cloudflare. The existing-site phase
copies its loader and routes from a fixture and uses a controlled export
server. Template `0.4.0` (published alpha) projects are exercised only by
synthetic manifests in CLI unit tests.

## Goals / Non-Goals

**Goals:**

- One run (`all`) proving the feedback fixes together on real consumers, failing
  on any regression.
- Acceptance driven by consumer-facing documents (README, connection guide), so
  documentation drift fails the run.
- A real upgrade from the bytes the published alpha generator produced.

**Non-Goals:**

- Changing products or templates (only if a regression exposes a defect).
- Exercising release artifacts (`release` phase keeps its own flow; 32B runs the
  suite against the refreshed set).
- Browser-driving every admin workflow already covered by admin e2e and the
  Cloudflare journey (block editing and publication in the browser).

## Decisions

### D1. `all` becomes the regression suite; phases remain

`main()` in phase `all` runs: build → snapshots → pack → Node consumer
(README-driven) → Compose production → Cloudflare Pages preview smoke →
publication visibility → existing-Astro consumer → Cloudflare consumer journey
→ template `0.4.0` upgrade. The Pages preview runs before visibility because it
asserts the original published title that visibility later changes. Existing
single phases stay for focused runs. `LACE_VISIBILITY_OBSERVE=1` is rejected
up front in `all`. Alternative — a new `regressions` phase beside `all`:
rejected, because CI already runs `all` and two "full" runs would diverge.

### D2. README-driven Node setup

A pure helper `readmeSetupCommands(readme)` (in `scripts/consumer-guides.mjs`)
returns the shell lines of the fenced `bash` blocks under "Prerequisites and
installation" and "Prepare and start the CMS". Acceptance compares them with a
reviewed constant and maps each to its invocation: `pnpm install` is the packed
install (`installPackedConsumer`, documented substitution); `pnpm env:prepare`;
the literal `pnpm exec lace doctor … --stage setup` plus `--json`;
`pnpm db:migrate|content:sync|auth:bootstrap --json`; `pnpm dev:api` with
`COMPOSE_PROJECT_NAME` set to the isolated project name, followed by a bounded
`/health/ready` wait. After preparation, `reviewEnvironment(text, values)`
replaces only the README's review settings (`LACE_API_IMAGE`,
`LACE_BUILDER_IMAGE`, `LACE_API_PORT`, `LACE_HTTP_PORT`,
`LACE_PUBLIC_BASE_URL`, `LACE_API_BASE_URL`) in place and refuses unknown or
missing keys, so generated credentials and comments survive. Later `.env`
changes (build token, invalid credential in recovery) use the same in-place
update instead of rewriting the file. `prepareCompose` therefore builds images
and allocates ports but no longer writes `.env`; the MinIO image build moves
after preparation. The `release` phase shares this flow, so 32B exercises it on
the exact candidate artifacts.

### D3. Browser setup, tour and media on the Node API origin

The packaged admin is served by the API container at `/admin/`. A shared
`scripts/acceptance-browser.mjs` (moved `loadBrowser`/`visible` from the
Cloudflare journey) drives Chromium from the workspace Playwright. Steps: open
`/admin/` → setup screen ("Create your administrator") → submit email,
password, token → "Sign in" with the completion status → sign in → "Start tour"
→ require dialog names `Content, Pages, Collections, Media, Builds, Users,
Settings` with "Step i of 7" → Finish → reload shows no invitation → replay via
the account menu "Introduction" → Escape → Media upload. The media ID comes
from the admin media list; publication of the five-block entry stays on the API
(the same packaged admin publication is browser-proven in the Cloudflare
journey and admin e2e). Alternative — browser block editing for all five
blocks: rejected as slow and selector-heavy without new coverage.

### D4. Existing-Astro consumer follows the generated guide

`guideFiles(markdown)` extracts code blocks introduced by a `` `path`: `` line
from the generated `cms/docs/lace-astro-site.md`. The journey removes the
fixture's loader, `env.d.ts` and route files (keeping the operator-owned layout,
styles, Astro config and `package.json`) and writes them from the guide, so the
guide must be complete and correct. The controlled export server also serves
`/lace/api/v1/public/media/<id>` bytes, and `LACE_PUBLIC_BASE_URL` points at it,
so rendered media URLs are fetched and compared. The export's rich-text block
gains hostile text (`<script>`/`<img onerror>` as text), marks and a safe
`https` link; a first build with a `javascript:` link must fail (render core
refuses unsafe links) before the real build. Build-site selection is checked
with `pnpm env:prepare` and `docker compose config --format json` (no daemon
needed): the builder's bind source equals the real parent path, `read_only`,
`LACE_BUILD_SITE_DIR=.` and `LACE_BUILD_OUTPUT_DIR=dist`.

Block-update survival uses explicit fixture preparation, because a packed CLI
carries one registry revision: append an operator edit to `HeroBlock.astro` and
rerun `lace add block --all` (edit preserved, nothing changed); then rewrite
`lace.site.json` so hero and quote record older installed bytes (every
registry item is still at revision 1, so the revision number stays) whose bytes
(`quote`: written as old bytes; `hero`: old bytes the operator edited) differ
from the registry. The rerun must update `QuoteBlock.astro` to the registry
bytes, report hero as a conflict with exit 2 and leave the edited bytes. This
is the same state an older CLI install produces. Alternative — patching the
installed CLI registry: rejected as testing a modified package.

### D5. Template `0.4.0` fixtures from the published generator

`tests/fixtures/template-0.4.0/{default,cloudflare}.json` hold
`{ generator, command, files }`, where `files` maps each path to its UTF-8
content exactly as `create-lace@0.1.0-alpha.1 create acceptance-site
[--cloudflare]` produced it, and `generator` records the npm shasum and
SHA-256 of that tarball (identical to the local alpha-1 artifact). JSON keeps
`.astro`/TypeScript sources out of lint, format and typecheck. A unit test
checks version `0.4.0`, the manifest file set and every managed digest. The
acceptance (`scripts/template-upgrade-acceptance.mjs`) runs the packed CLI from
the Node consumer's `node_modules`, so the upgrade engine under test is the
packed one. The conflict case edits `docker-compose.yml` (default) and the
retired root `wrangler.jsonc` (Cloudflare, a removal conflict). A refused apply
writes only its conflict-review and recovery records under `.lace/`, which the
comparison excludes. Paths are resolved with `realpath`, because upgrade
refuses symbolic links (macOS `/var`). Alternatives —
downloading the alpha from npm in CI (network and registry dependence) or
checking out git history (CI uses shallow clones): rejected.

### D6. Traceability map with a guard test

`docs/onboarding-feedback-acceptance.md` contains one table row per feedback
item: `§`, status (`resolved`, `decision`, `deferred`), evidence. Evidence uses
`stage:<name>` tokens for acceptance stages and backticked repository paths. A
test (`tests/onboarding-feedback-acceptance.test.mjs`) parses the numbered
`## N.` headings of `docs/onboarding-feedback.md`, requires one row each, §11
`deferred`, every `stage:` token present as a string literal in `scripts/`,
every path existing, and no row with status `open`. Statuses inside the Russian
feedback log are reconciled in 32B; the map is the 32A evidence.

## Risks / Trade-offs

- [Suite duration grows (Docker images, visibility waits, Cloudflare)] → the
  stages already have bounded waits; CI keeps the expensive run label-gated.
- [README prose changes break acceptance] → intended: the command list is the
  contract; the failure names the differing line.
- [Controlled export instead of a live CMS for the existing site] → the CMS
  runtime is proven by the Node and Cloudflare consumers; this consumer proves
  site integration against the same export contract, including media bytes.
- [Fixture prepared lock state could mask real CLI update behaviour] → the state
  is exactly what the lock format records for an older install; unit tests
  already cover registry bumps.
- [Fixture size (~90 KB JSON)] → acceptable; it never changes after the alpha.

## Migration Plan

Acceptance-only change; no consumer migration. Rollback is reverting the
scripts, fixtures and document.

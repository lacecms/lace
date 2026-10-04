# Onboarding feedback acceptance map

Session 32A evidence for [the onboarding feedback log](onboarding-feedback.md).
Each item is proven by the regression suite (`pnpm acceptance:generated`, which
runs every consumer journey in `scripts/generated-project-acceptance.mjs` phase
`all`), by focused acceptance phases and tests, or is closed by an explicit
decision or deferral. `stage:<name>` refers to an acceptance stage printed as
`Acceptance: <name>`; a failing stage fails the suite.

`tests/onboarding-feedback-acceptance.test.mjs` fails when an item has no row,
a referenced stage or file does not exist, §11 is not deferred, or a row is
`open`. Status words: `resolved` (behavior delivered and proven), `decision`
(resolved by a recorded design decision and proven), `deferred` (outside the
MVP), `open` (an unresolved defect; the suite is then not accepted).

Statuses inside the feedback log itself are reconciled with delivered artifacts
in Session 32B.

| §   | Feedback                                  | Status   | Evidence                                                                                                                                                                                                                                                                                                                                    |
| --- | ----------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | CLI command to prepare `.env`             | resolved | stage:readme-setup-contract, stage:env-prepare (Node consumer: generated credentials kept, only review settings edited), stage:env-prepare-repeat (`packages` phase: refusal keeps `.env`); `packages/cli/src/environment.test.mjs`; `packages/create-lace/templates/README.md`                                                                |
| 2   | `db:migrate` creates database directories | resolved | stage:cli-db-migrate (fails if the database directory exists before or is missing after), stage:prepared-db-migrate-repeat; `packages/platform-node/src/migrate.test.mjs`; `packages/cli/src/migrate.test.mjs`                                                                                                                                         |
| 3   | Short `curl` example for the first admin  | resolved | Placeholder-only example in `packages/create-lace/templates/README.md`, asserted by `packages/create-lace/src/quickstart.test.mjs`; the same endpoint is exercised by stage:cli-bootstrap and the `release` phase's security journey                                                                                                         |
| 4   | Base documentation in the generated README | resolved | stage:readme-setup-contract (the suite executes the README's setup commands and fails on drift); `tests/consumer-guides.test.mjs`; `packages/create-lace/src/quickstart.test.mjs`; `packages/create-lace/src/onboarding.test.mjs`                                                                                                           |
| 5   | Visual first-administrator setup          | resolved | stage:node-browser-setup (unconfigured `/admin/` opens setup; token never in the URL), stage:cloudflare-browser-expired-setup, stage:cloudflare-browser-setup; `apps/admin/e2e/setup.e2e.ts`                                                                                                                                              |
| 6   | Introductory admin tour                   | resolved | stage:node-browser-tour (administrator steps, persisted completion, replay from the account menu); `apps/admin/e2e/tour.e2e.ts` (per-role steps, skip, accessibility)                                                                                                                                                                     |
| 7   | Installing components into an existing site | decision | Step 30 and `docs/adr/0006-shared-rendering-core-and-installed-block-source.md`; stage:existing-guide-files, stage:existing-add-blocks, stage:existing-styling-hooks, stage:existing-public-media, stage:existing-unsafe-link-build, stage:existing-block-rerun, stage:existing-block-update; `packages/cli/src/blocks-command.test.mjs` |
| 8   | Actionable CLI errors                     | resolved | stage:cli-bootstrap-refused (operation, reason, next action, no token), stage:env-prepare-repeat; `packages/cli/src/operational-errors.test.mjs`; `packages/cli/src/diagnostics.test.mjs`                                                                                                                                                   |
| 9   | Environment check command                 | resolved | stage:doctor-setup (setup stage: missing database and stopped API expected), stage:cloudflare-browser-setup after `cloudflare-local` doctor; `packages` phase doctor stages; `packages/cli/src/doctor.test.mjs`                                                                                                                             |
| 10  | Explicit build-site selection             | resolved | stage:existing-build-site-selection (Compose mounts the parent site read-only), `build-site` phase in `scripts/build-site-acceptance.mjs`; `docs/archive/step-29/step-29a-verification.md`                                                                                                                                                  |
| 11  | Connecting the CMS to an existing project | deferred | Outside the MVP: `create-lace init .` still requires an almost empty directory. The existing-site mode (`--existing-site`, stage:existing-generate) covers a CMS in a subdirectory of an existing Astro site.                                                                                                                              |
| 12  | Site update after publication             | resolved | stage:visibility-static-build and the visibility journey in `scripts/publication-visibility-acceptance.mjs` (dev, manual static and automatic Compose; mismatches fail the suite); `docs/archive/step-29/step-29b-verification.md`                                                                                                           |

Upgrades from the published alpha are part of the same suite: the template
`0.4.0` projects in `tests/fixtures/template-0.4.0/` are upgraded by
`scripts/template-upgrade-acceptance.mjs` with the packed CLI (managed conflict
refused, managed files current, README, configuration and site source
unchanged).

## Defects found by the regressions

None open. Rows with status `open` belong in the table above until fixed.

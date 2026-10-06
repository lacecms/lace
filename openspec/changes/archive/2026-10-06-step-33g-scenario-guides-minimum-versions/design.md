## Context

See proposal.md for motivation and scope. `packages/create-lace/templates/README.md` and `docs/lace-operations.md` currently contain overlapping lifecycle sequences, rendered through site/Cloudflare markers. `src/inventory.ts` classifies README as user-owned and operations/connection guides as managed. `quickstart.test.mjs`, `scripts/consumer-guides.mjs` and the generated-project acceptance runner explicitly extract README commands; simply shortening README would break a useful acceptance contract.

All 15 public package manifests cap Node at `<25`; root and generated CMS also cap pnpm at `<13`. `scripts/release-model.mjs` enforces the old exact Node range. Doctor already evaluates the consumer manifest using semver; it needs updated generated-policy fixtures and boundary coverage, not a replacement version algorithm. CI and Docker/release preparation separately pin their reproducibility toolchain (Node `24.12.0`, pnpm `12.3.4`).

33F is delivered (commit `ea0a4b0`, `docs/archive/step-33/step-33f-verification.md`, archived change `2026-10-06-step-33f-explicit-cloudflare-credentials`). Its settled contract, which 33G reuses verbatim: remote migrate/sync/bootstrap accept `--operator-env <path>` only with `--target cloudflare-remote`; the private file is `.lace/cloudflare-operator.env` (ignored, owner-only, never sourced as shell) created from the managed Cloudflare-only `docs/cloudflare-operator.env.example`; keys `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `LACE_D1_DATABASE_ID`, `LACE_WRANGLER_CONFIG`; process values override file values. `lace cloudflare preflight --target cloudflare-remote --wrangler-auth token|oauth --operator-env .lace/cloudflare-operator.env` is read-only (`SELECT 1`) and does not prove OAuth membership or write permissions, so guides add project-pinned `wrangler whoami --account <account-id> --config worker/wrangler.jsonc` and permission review. The split choice removes token assignments from both `.env` and `.env.local`; the single-token choice loads the private file explicitly with `node --env-file=...` for the intended Wrangler invocation. The detailed credential/permission/secret-purpose tables already live in the managed operations guide's Cloudflare Worker section.

33F advanced the ownership template to `0.15.0` (inventory, upgrade instructions, `release/alpha.json`, snapshots), so 33G uses `0.16.0`. 33F also captured the immutable template `0.14.0` default and Cloudflare fixtures (`tests/fixtures/template-0.14.0/`, extracted from committed revision `5f7c19b`, guarded by `tests/template-0.14.0-fixture.test.mjs`) and extended `scripts/template-upgrade-acceptance.mjs` to upgrade them. 33G reuses those fixtures instead of capturing new ones.

Resolved dependency engine audit (2026-10-06, installed lockfile metadata): Astro 7.3.1 Node `>=22.12.0`, better-sqlite3 13.0.3 `>=22`, Wrangler 4.129.0 and Miniflare `>=22.0.0`, Vite 8.2.2/8.3.0, Oxlint 1.81.0 and Oxfmt 0.66.0 `^20.19.0 || >=22.12.0`, AWS S3 client 3.1133.0 `>=20.0.0`, OpenSpec 1.12.0 `>=20.19.0`, TypeScript 7.0.2 `>=16.20.0`, Hono `>=16.9.0`, workerd `>=16`; Better Auth, Drizzle ORM and Turbo declare none. The pinned pnpm 12.3.4 registry metadata declares Node `>=18.*`. Vitest 5.0.0 declares `^22.12.0 || ^24.0.0 || >=26.0.0`, so Node 25 is eligible for consumers but not for repository source testing. Nothing contradicts Node `>=24.12.0` / pnpm `>=12`.

## Goals / Non-Goals

**Goals:** keep scenario instructions directly followable, preserve ownership and existing operator/runtime contracts, and make manifest eligibility distinct from test evidence and toolchain pins.

**Non-Goals:** changing adapters, authentication, database migrations, release publication state, runtime build outcomes or dependencies. New-major runtime certification and the complete 33H packed regression suite are separate work.

## Decisions

### 1. Deliver scenario files through the existing generator

Add managed `docs/lace-compose-dev.md` and `docs/lace-compose-production.md` for every mode, and managed `docs/lace-cloudflare.md` with the existing `cloudflare: true` selector. Use the existing marker renderer and `{{SITE_PATH}}`; each file has explicit inventory ownership. No new renderer or runtime package boundary is needed. The fresh README becomes an index with requirements, layout/ownership and scenario links; completion output names those links, including when `init .` retains README.

Development covers install/prepare/doctor, stopped-users migration/sync/bootstrap, API/browser setup, Settings token, publish and applicable Astro dev/build, then repeat/start/stop recovery. Production gives its own prerequisites and initialization before `prod:start`, origins, source and lockfile selection, static serving, maintenance/backups and failure retry. Cloudflare starts account-free/local and then describes explicit account operations using the completed 33F contract, linking the operations guide's credential, permission and recovery tables rather than duplicating them. In existing mode the guides link to required site integration and use the external path; in none mode they omit absent scripts and explain unconfigured builds. Without Cloudflare the entry offers adoption guidance through existing references and never links to an absent guide.

Retain operations as the complete reference for shared setup/private input, doctor limitations, configuration, source selection, publication visibility, the Cloudflare Worker lifecycle (whose accepted requirement stays on operations) and diagnostics. Keep every existing `##` anchor so old user README links survive; only its introduction and prerequisites change to point at the scenario guides and minimum-only requirements. Move the identical placeholder curl example to the development guide and operations, with the existing protected-input alternative and expiry/closure semantics. The onboarding delta explicitly replaces the accepted full-README obligation, relocates that example and moves the README-specific site-mode and publication-visibility obligations to the scenario guides; the generator delta updates completion output. This avoids silently weakening accepted behavior.

Rejected: duplicating each lifecycle in README and operations (continued drift), unmanaged guides (upgrade cannot deliver fixes), or rewriting an outer site's README (violates ownership).

### 2. Describe only delivered behavior

Guides reference 33A order persistence, 33B ETag compatibility, 33C safe builder source/diagnostic handling, 33D accepted versus proven deployment, 33E exact Pages tracking/deadline and 33F credential separation/preflight. Generic hooks remain accepted without proof; local tests do not establish real-account success. Keep the stopped-host-SQLite rule and existing-site dev-route restart limitations explicitly labelled where applicable.

The 33F contract recorded in Context is the only credential workflow the Cloudflare guide uses. Do not implement new credential behavior inside the guide change.

### 3. Change minimum declarations, preserve reproducibility controls

Set Node `>=24.12.0` in root, generator templates and public manifests; set pnpm `>=12` wherever a current delivered engine range exists. Update release-model validation and tests, current compatibility/handoff/generated docs and normal doctor fixtures. Preserve a bounded custom-consumer doctor test to prove older projects still govern their own compatibility. Do not edit immutable archive fixtures or historical evidence merely to remove old ranges.

The audit in Context supports the proposed minimums. Source-testing eligibility (Vitest excludes Node 25) can differ from consumer manifest eligibility; engine metadata alone is not runtime certification. Record the audit in `docs/compatibility.md`.

Leave `packageManager`, lockfile/catalog versions, CI Node/pnpm pins, Docker toolchains and `scripts/release.mjs`'s exact preparation toolchain unchanged. Compatibility documentation records minimums, exact tested baseline and the steps for adding a major to the tested matrix: frozen install, native SQLite load, CLI/generation/doctor, site build and relevant runtime smoke. No runtime claim follows merely from a semver acceptance test.

Rejected: treating pins as engine bounds, broadening every custom project range inside doctor, or updating dependencies/CI majors in this unit.

### 4. Advance the template without claiming a new alpha release

Advance to `0.16.0`, the next unused minor after 33F's `0.15.0`. Keep inventory, upgrade JSON, `release/alpha.json` and snapshots coherent. The alpha-release delta delegates current template identity to that definition, while package/image version selection and publication records stay with 33H. This source state requires locally built compatible artifacts and must not be advertised as a change to published alpha.2.

Add instructions naming the new guide paths for projects whose README is preserved. Use existing upgrade conflict/planning/journaling machinery; no new persistence or locking strategy. New guide destinations are subject to collision checks and edited operations stays a managed-file conflict. User `.env`, README, config, Worker configuration and all site files remain protected.

Reuse 33F's immutable `0.14.0` fixtures and provenance unchanged. Cover default and Cloudflare variants, plus an existing-site outer README preservation test. Do not manufacture old fixtures by changing a current manifest version.

### 5. Move acceptance to the document users follow

Update `quickstart.test.mjs`, mode/generator tests and `scripts/generated-project-acceptance.mjs` to validate the development guide's reviewed command blocks and sequence. Preserve all browser setup, publication, token safety and output checks. Add focused link/anchor and script checks over generated variants; use tests to catch stale real commands rather than asserting incidental prose. Extend the existing `0.14.0` upgrade journey for successful guide delivery, edited operations, new-guide collisions, protected user bytes and a repeat no-op plan. Register all new versioned guide coordinates in `RELEASE_GUIDES` so stale release references fail validation.

Use focused generator/CLI/release tests and packed starter acceptance for changed consumer surfaces; run applicable packed upgrade verification. Full multi-platform and real-account regression gates remain 33H/34 work. Complete root typecheck, Oxlint, Oxfmt check and strict change validation before reporting implementation complete.

## Risks / Trade-offs

- Credential drift from 33F → guides only use the commands recorded in Context and link the operations reference tables.
- Guide duplication or stale links → keep shared details in references, preserve useful anchors and validate all generated variants.
- Removing caps can allow a major with native/tool incompatibility → record eligibility separately from tested coverage and preserve reproducible pins.
- Historical `0.14.0` fixtures accidentally refreshed → record origin/hashes and keep them outside current snapshot regeneration.
- Template bump diverges from release validation → update the coherent template metadata and add validator coverage, without selecting/publishing next alpha artifacts.

## Migration Plan

No database/data migration is added. New consumers receive the guide index and managed scenario files. Existing consumers generate a matching target template, review `lace upgrade` conflicts, apply managed changes and use the paths printed in upgrade instructions; adopting the new README remains manual. Reinstall using existing exact packageManager/lockfile rules when the managed manifest changes. Upgrades do not rewrite user site engine declarations; explain manual adoption where needed.

Guide or minimum-policy rollback means a reviewed template correction or existing upgrade recovery before finalization; it never downgrades SQLite or rewrites user files. Real-account commands appear as operator instructions and are not run by generation, upgrade or local checks. After verified apply, synchronize deltas, strictly validate and archive under the user's explicit archive authorization, then commit the completed change in the current branch.

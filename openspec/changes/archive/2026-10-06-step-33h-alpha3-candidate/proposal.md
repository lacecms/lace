## Why

Roadmap Step 33, session **33H — Field-trial regressions and next alpha candidate** (the last 33 session). The owner published `0.1.0-alpha.2` (template `0.14.0`) and field-tested it; 33A–33G fixed the six reported defects in source (block order, builder source diagnostics, Wrangler credential separation, weak ETags, truthful/tracked build outcomes, scenario guides and minimum-only engines), but those fixes reach consumers only through a new coherent prerelease, and the exact-artifact suite does not yet prove them in packed consumers. `release/alpha.json` still names `0.1.0-alpha.2` as the candidate although it is published, so a new candidate must be selected without touching the published set.

## What Changes

- Record `0.1.0-alpha.2` as published (`publishedVersions`), and select from one reviewed revision the next unused prerelease `0.1.0-alpha.3` with ownership template `0.17.0`, channel `next`. Registry metadata checked on 2026-10-06 lists `0.1.0-alpha.2` on npm (`next`) and GHCR, and no `0.1.0-alpha.3` for any of the fifteen packages or either image: availability evidence, not a reservation.
- Refresh every coordinate to `0.1.0-alpha.3`: fifteen public manifests, generated root/site dependencies, `.env.example` image defaults, Dockerfile defaults, versioned guide commands, block-registry requirements, the existing-Astro fixture and version-pinned tests. Managed guides state that the 33A–33G behavior (operator file, preflight, Pages tracking, scenario guides) arrives with `0.1.0-alpha.3`, replacing "a compatible CLI that supports them" wording.
- Template `0.17.0` upgrade instructions name the new coordinates and, for the first time since alpha.2, a database step: migration `0003_site_build_outcomes` (33D) must be applied with backup first on Node SQLite and D1, before the new engine serves traffic. The accumulated `0.15.0`/`0.16.0` entries remain for upgrades from the published `0.14.0`.
- Extend `pnpm acceptance:release --artifacts` with the field-trial regressions, using only inventory artifacts: block reorder/insert/duplicate/remove through save, reload, publication and build export in the packed admin of the loaded API image; builder source diagnostics in Compose production with an existing site (loaded API/builder images); build export read through a compressing proxy that weakens the ETag by the packed SDK/Astro loader; credential separation with the packed CLI; Pages deployment tracking of the packed Cloudflare Worker against a local Pages API stub; the development, production and Cloudflare guides' command sequences (drift fails); and the upgrade of the published template `0.14.0` fixtures with the packed CLI. The receipt names each journey.
- Add `docs/archive/step-33/alpha-2-feedback-acceptance.md`, mapping every alpha.2 feedback item (§1–§6 and the general diagnostics requirement) to tests, documentation or an explicit decision, guarded by a test like the onboarding map. Real-account re-verification of §3–§5 is recorded as owner input to 34C, not a local claim.
- Archive the three feedback documents (`lace-alpha-2-feedback.md`, `onboarding-feedback.md`, `onboarding-feedback-acceptance.md`) and the 33A–33C acceptance records under `docs/archive/`, updating every link and the guarding tests.
- Prepare the inventory from a clean commit (both platforms), run the extended suite against it, record evidence (`docs/archive/step-33/step-33h-verification.md`, `step-33h-artifacts.json`) and reconcile root README, `alpha-release.md`, `compatibility.md`, architecture §25 and the roadmap. Registry publication and real-account/real-server verification remain separate owner acts.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `alpha-release-artifacts`: the current candidate is `0.1.0-alpha.3`; `0.1.0-alpha.1` and `0.1.0-alpha.2` are recorded published and immutable.
- `project-generator`: template `0.17.0` generates `0.1.0-alpha.3` coordinates and its upgrade instructions include the alpha.2 → alpha.3 database migration step.
- `prepublication-consumer-security`: exact-artifact acceptance additionally runs the alpha.2 field-trial regression journeys.
- `generated-project-acceptance`: alpha.2 field-trial feedback is traceable to acceptance evidence through a guarded map, and the archived feedback records keep their guards.

## Impact

Grounding: architecture **§§4.8, 6, 7, 9.8, 13, 15, 22, 25**; roadmap **33H** (and the 32B precedent); accepted `alpha-release-artifacts`, `prepublication-consumer-security`, `generated-project-acceptance`, `project-generator`, `cloudflare-operator-credentials`, `cloudflare-pages-deployment-tracking`, `fixed-command-vps-builder` and `published-site-loader` specs.

Affected areas: `release/alpha.json` and release tests; public `package.json` versions; `packages/create-lace` (inventory, templates, upgrade instructions, README, tests, snapshots); Dockerfile defaults; block registry; CLI tests pinned to the release version; acceptance scripts (`generated-project-acceptance.mjs` and the journey modules); `tests/*-feedback-acceptance.test.mjs`; release, compatibility, roadmap and architecture documentation and `docs/archive/`.

Non-goals: npm publication, GHCR push or visibility change, real VPS/TLS or Cloudflare account runs (owner, input to 34C), new product behavior, new schema migrations, changing published `0.1.0-alpha.1`/`0.1.0-alpha.2` artifacts or the template `0.4.0`/`0.14.0` fixtures, amd64 end-to-end consumer coverage (preparation smokes both platforms). Depends on completed 33A–33G.

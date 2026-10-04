## Why

Roadmap Step 32, session **32B — Coherent artifact refresh and verification**. Steps 26–31 changed the packages, generator templates (now template `0.13.0`), admin, Worker packaging and builder, but every coordinate still names the published `0.1.0-alpha.1` set and `pnpm release:check` fails with `Template identity mismatch` because `release/alpha.json` still records template `0.4.0`. Consumers therefore cannot receive the onboarding improvements: no coherent next alpha exists, and the 32A regression suite runs only against a workspace-packed graph and source-built images rather than the exact candidate artifacts.

## What Changes

- Select the next alpha from one reviewed revision: package/generator/image version `0.1.0-alpha.2` and ownership template `0.14.0`, channel `next`. Registry metadata checked on 2026-10-04 shows only `0.1.0-alpha.1` (and `0.0.0-stage` for three packages) on npm and no `0.1.0-alpha.2` tag for either GHCR image; this is availability evidence, not a reservation, and is rechecked before publication.
- Record published versions in the release definition so preparation refuses to reuse one (`0.1.0-alpha.1` stays immutable), and keep validating every manifest, template dependency, image default, Dockerfile default and the existing-Astro guide coordinates against the definition.
- Refresh delivery: all fifteen public manifests, generated root/site dependencies, `.env.example` image defaults, Dockerfile version defaults, the existing-site connection guide, operations guide, user-owned README template, generator README and template upgrade instructions for `0.14.0`, with byte-stable snapshots regenerated.
- Make `pnpm acceptance:release --artifacts <dir>` the full onboarding feedback regression suite against one complete clean-source inventory: the packed generator's byte-stable snapshots, the README-driven Node consumer with browser setup/tour plus the 25C security, recovery and persistence journeys, the Pages preview, publication visibility, the existing-Astro consumer, the packed Cloudflare consumer journey (including generated Worker packaging with the packaged admin) and the upgrade from template `0.4.0` — all with the inventory's packages and saved image archives, never workspace builds. Remove the remaining hardcoded `0.1.0-alpha.1` tarball names from acceptance helpers.
- Prepare the matching inventory (packages plus API/builder on `linux/amd64` and `linux/arm64`), run the suite against it, and record evidence (`docs/archive/step-32/`).
- Reconcile root README, `docs/alpha-release.md`, `docs/compatibility.md`, architecture §25, the roadmap, the feedback log statuses and the acceptance map with delivered behavior, and list the remaining real-deployment/security checks. Registry publication stays a separate owner act.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `alpha-release-artifacts`: the release definition names the current candidate (`0.1.0-alpha.2`, template `0.14.0`) instead of hard-coding the first set, and preparation refuses a version already recorded as published.
- `project-generator`: the generator advances the managed template to `0.14.0`, generating exact `0.1.0-alpha.2` package and image coordinates with matching upgrade instructions.
- `prepublication-consumer-security`: exact-artifact acceptance additionally runs every onboarding feedback consumer journey (existing-Astro, Cloudflare Worker, publication visibility, Pages preview, template upgrade, snapshots) with the packed generator and inventory artifacts.

## Impact

Grounding: architecture sections **4.8, 6, 7, 22, 25**; roadmap **32B** (and 25B/25C precedent); accepted `alpha-release-artifacts`, `prepublication-consumer-security`, `generated-project-acceptance`, `project-generator`, `cloudflare-consumer-worker` and `upgrade-planner` specs.

Affected areas: `release/alpha.json` and release validator/tests, all public `package.json` versions, `packages/create-lace` (inventory version, templates, upgrade instructions, README, tests, snapshots), `apps/api` and `apps/builder` Dockerfile version defaults, CLI tests pinned to the release version, acceptance scripts and the existing-Astro fixture, release documentation and verification evidence.

Non-goals: npm publication, GHCR push or visibility change, a real Cloudflare or VPS deployment (Step 33C), stable MVP certification, Step 33 security/fault-injection work, new product behavior or schema migrations. Published `0.1.0-alpha.1` artifacts and the template `0.4.0` fixtures stay unchanged. Depends on completed 32A and Steps 26–31.

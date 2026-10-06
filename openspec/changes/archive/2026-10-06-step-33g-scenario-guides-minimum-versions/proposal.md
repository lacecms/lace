## Why

Roadmap Step 33, Session 33G needs a clear entry into each generated-project operating scenario: the current README mixes Compose development, production and Cloudflare, while upper engine bounds reject newer tools regardless of their capabilities. Separate scenario guides and minimum-only requirements make onboarding followable without weakening ownership, explicit-target or deployment-evidence rules.

## What Changes

- Replace the freshly generated README with a short requirements/layout/guide index; deliver managed `docs/lace-compose-dev.md`, `docs/lace-compose-production.md` and, with `--cloudflare`, `docs/lace-cloudflare.md` covering local then real-account operation. Keep `lace-operations.md` and `lace-astro-site.md` as linked references, with stable useful anchors.
- Each scenario specifies working directory, prerequisites, ordered actions, one-time/repeat actions, expected result, recovery and next step. Render starter/existing/none modes truthfully; distinguish local/remote data, CMS/static deployments and draft/publication/deployment.
- Declare Node `>=24.12.0` and pnpm `>=12` in the root/generated manifests and Node minimum in all public package manifests; update release validation, doctor fixtures and current compatibility/handoff guidance. Keep exact CI, Docker, lockfile and packageManager pins independent of these minimums.
- Advance the ownership template to `0.16.0` (next unused after 33F's `0.15.0`), update deterministic inventories/snapshots and add upgrade evidence from exact template `0.14.0`. Preserve README and site source byte-for-byte; new guides are managed and existing managed docs retain conflict detection.
- Move existing README sequence acceptance to the Compose development guide, preserving the complete packed-consumer journey and adding guide-link/command validation.

Dependencies: 33A–33F are delivered. 33F (template `0.15.0`) settled the credential contract: private `.lace/cloudflare-operator.env` loaded with `--operator-env`, read-only `lace cloudflare preflight`, separate `wrangler whoami` and permission review; it also captured the immutable template `0.14.0` fixtures. 33G reuses both and advances the template to `0.16.0`.

Non-goals: new runtime/authentication features, data/schema migration, automatic site modification, package/image publication, real-account verification, dependency-major upgrades, a new alpha package version or the full 33H regression/release gate.

## Capabilities

### New Capabilities

- `runtime-tooling-minimum-policy`: coherent minimum requirements, independent reproducibility pins and evidence-based compatibility expansion.

### Modified Capabilities

- `generated-project-onboarding`: short entry README, complete scenario guides, relocated setup examples, and site-mode/publication-visibility guidance moved from README to the scenario guides.
- `project-generator`: classified scenario files, mode-aware completion output links and ownership-safe template upgrade.
- `environment-doctor`: minimum-only generated-project version checks while retaining project-declared range semantics.
- `generated-project-acceptance`: guide-derived operator sequence, development-guide-driven full suite and exact `0.14.0` upgrade evidence.
- `alpha-release-artifacts`: current ownership template comes from the coherent release definition rather than remaining fixed at `0.14.0`.

## Impact

Architecture §§4.8, 5–7, 18–19, 21–22 remain authoritative: explicit migrations/targets, separate CMS/site deployment, fixed-command builds and protected user files do not change. Affected packages are `create-lace` (templates, inventory, marker rendering and tests), CLI (doctor tests and upgrade evidence), public package manifests and root tooling/acceptance/release validators. Current repository docs and the roadmap receive implementation evidence updates during apply; historical release evidence stays historical. No new dependency, REST contract, persistence or platform adapter is introduced.

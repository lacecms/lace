## Why

Roadmap Step 34, session 34C, must turn the completed local product and security verification into reproducible operations procedures and an attributable owner handoff. The admin currently omits the active CMS release, and both runtime composition defaults report `0.0.0`, making installation identification unreliable.

## What Changes

- Show the complete running CMS release in Settings → Site status, through the authenticated status contract, backed by release metadata in both Node and Worker artifacts.
- Complete generated and repository guides for development, generated projects, VPS, Cloudflare, coordinated backups/restores, forward migrations, credential rotation, build recovery and troubleshooting.
- Add a reproducible account-free operations verification command with isolated SQLite/MinIO and local D1/R2 restore drills, health/log checks, credential-rotation checks and machine-readable results.
- Produce a checklist mapping every included MVP capability and security requirement to tests, documentation and pending owner checks; close only local roadmap acceptance after exact-artifact verification.

## Capabilities

### New Capabilities

- `local-operations-verification`: reproducible local operations, coordinated restore evidence, traceability and the boundary of the owner handoff.

### Modified Capabilities

- `hono-app-factory`: include the running engine release in the administrator-only settings status response.
- `admin-users-and-settings`: render a labelled CMS release in Settings using confirmed server state.
- `node-api-composition`: identify the installed Node engine release without the placeholder default.
- `cloudflare-worker-composition`: identify the bundled Worker engine release without Node-only runtime dependencies.

## Impact

Architecture references: §§3–6, 7 (ownership/upgrade), 14 (authorization), 20 (tests), 21 (observability/operations), and 22 (forward migrations). Related accepted specs include `rest-contracts`, `environment-doctor`, `operational-cli`, `alpha-release-artifacts`, `generated-project-onboarding`, `generated-project-acceptance`, `upgrade-apply-recovery`, `bootstrap-user-token-abuse-controls` and `cross-runtime-product-verification`.

Dependencies: completed 34A and 34B, Step 31 generated onboarding, current guides/templates and the exact 34B alpha.4/template 0.19.0 inventory. 34B remains complete but unsynchronized/unarchived; retain its verified behavior and proposed deltas as the implementation baseline without pretending those deltas are already accepted specs. The accepted release spec's historical template 0.18.0 predates 34B; reconcile through the existing 34B workflow rather than silently changing it here.

Affected areas: `packages/contracts`, `packages/server`, both platform composition roots, admin Settings, consumer templates under `packages/create-lace/templates/`, release validation/packing, verification scripts/tests and documentation. The status field is additive within the coordinated release set; existing strict clients must be upgraded with it. No new SQL schema, public endpoint, permission or infrastructure dependency is proposed. Updated managed guides require a coherent ownership-template refresh following existing release rules; do not invent or publish a new package prerelease.

Non-goals: remote VPS/Cloudflare execution, remote D1 capacity proof, registry publication, stable-release approval, monitoring infrastructure, automatic backups, general restore CLI, a new diagnostics dashboard, or automatic database downgrade. All implementation remains within session 34C. A shipped change requires refreshed clean-source candidate artifacts and affected exact-artifact acceptance before claiming completion.

## Context

The dev, API and builder Dockerfiles currently use Node 24.12.0. Release preparation and builder smoke validation enforce pnpm 12.3.4; Corepack and the `packageManager` field have their own version syntax and can independently select a version.

## Goals / Non-Goals

**Goals:** Update all Node-based local and VPS image stages, relax enforceable pnpm minimums, and preserve a working frozen-install path.

**Non-Goals:** Change Node engine minimums, publish images, claim real VPS deployment or rewrite historical fixtures.

## Decisions

- Use the exact Node image patch requested by the owner. Compose references images or Dockerfiles rather than imposing a second Node version; inspect all paths including generated Compose.
- Use pnpm major-minimum checks for release and builder validation. Test versions below, equal to and above 12 and malformed input before output creation. Keep frozen lockfile enforcement.
- Keep root `packageManager: pnpm@12.3.4` as the concrete metadata required by Turborepo and Corepack: Turbo rejects an unbounded `devEngines.packageManager` range. Disable pnpm's automatic version management in Docker with `npm_config_manage_package_manager_versions=false`; operators can set the same variable when using an independently installed eligible pnpm. Corepack itself still selects the concrete metadata version. Generated projects use `devEngines.packageManager` with `>=12` because they do not depend on Turbo. Verify both paths and frozen installs.
- Keep CI's explicit tested version as a selected reproducible version, not a restriction on operators. Update current documentation and assertions to distinguish eligibility from tested baselines; never claim unrun compatibility checks.
- Respect generated file ownership and template-version migration rules if managed template content changes; preserve historical fixtures.

## Risks / Trade-offs

- A newer pnpm may not understand a frozen lockfile → keep frozen installs and report actual tested versions; failed installs must fail clearly.
- Floating image-build pnpm versions change reproducibility → record actual version in verification and retain exact pin only if required by tooling, not as an eligibility gate.
- Node patch availability or Docker daemon may block builds → check availability and report unverified builds rather than infer success.

## Migration Plan

Update source and managed template according to upgrade rules, verify local and release paths, and rebuild images before deployment. Roll back by rebuilding the previous revision and restoring matching generated managed files; no database migration is involved.

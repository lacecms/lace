## Why

Local and VPS images use an older Node patch and exact pnpm constraints prevent use of otherwise eligible pnpm versions.

## What Changes

- Use Node 24.22.3 for local development and API/builder Docker image stages.
- Allow pnpm 12 and later where a version range is supported, including release preparation; retain exact versions only where tooling requires them and explain why.
- Preserve frozen lockfile and existing consumer Node minimums; distinguish actual compatibility evidence from eligibility.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `runtime-tooling-minimum-policy`: update image and pnpm pin policy while retaining compatibility evidence requirements.
- `alpha-release-artifacts`: accept pnpm 12 or later during release preparation and verify builder version accordingly.

## Impact

Owner-requested change outside the refactoring roadmap; one cohesive session because image construction and release image validation share the toolchain contract. Architecture §§6, 7, 20, 22 and 25 apply. Dockerfiles, generated manifests, release tooling, tests and current guidance may change. No deployment, publication or Node minimum bump is included. Package manager metadata and Corepack format constraints must be respected; generated-project upgrades retain their ownership rules.

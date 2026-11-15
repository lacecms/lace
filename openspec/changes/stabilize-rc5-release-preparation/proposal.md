## Why

RC5 package preparation stops when pnpm needs npm metadata that the disposable consumer's offline frozen install cannot fetch. After filling that cache, preparation reaches the API image, where Docker's floating pnpm major selects 12.21.0 and rejects the lockfile accepted by the workspace's pinned 12.3.4.

## What Changes

- Use the exact workspace pnpm version in the API and builder Docker stages that install pnpm. Check the Dockerfile pins during release-model validation.
- Keep the disposable package and exact-artifact acceptance installs frozen and allow pnpm to retrieve missing public registry metadata while enforcing the existing supply-chain policies.
- Resolve the pinned pnpm executable for acceptance with both Corepack and standalone pnpm.
- Verify preparation and acceptance from a fresh pnpm metadata cache and document the controlled toolchain and registry requirement in the release guide.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `alpha-release-artifacts` — Release images use the exact workspace pnpm pin. Frozen installs of disposable package and acceptance consumers work with an initially empty metadata cache.

## Impact

This is an RC5 release correction outside the extensibility roadmap session units. [Architecture §§19 and 25](../../../docs/architecture/README.md), [alpha-release-artifacts](../../specs/alpha-release-artifacts/spec.md), [generated-project-acceptance](../../specs/generated-project-acceptance/spec.md) and [runtime-tooling-minimum-policy](../../specs/runtime-tooling-minimum-policy/spec.md) govern it.

The scope covers the API and builder Dockerfiles, release-model checks, frozen installs in release preparation and its acceptance journeys, acceptance toolchain resolution, and the internal release guide. Keep the selected RC5 coordinates, the checked-in dependency graph and consumer engine minimums. Release verification requires public npm and Docker access and an owner-reviewed source commit. Registry publication remains an owner operation.

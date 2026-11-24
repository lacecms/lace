## Why

Lace needs a stable release for the media-library, Astro thumbnail, direct account creation and link-review changes. Existing 1.0.0 projects need a verified upgrade on both runtimes. TypeScript clients that implement the published `LaceClient` interface need to keep compiling.

## What Changes

- Plan one maintenance session, **CMS 1.1.0 release preparation**, following MP1, MP2, AC1 and the link-review fix. Align the stable `1.1.0` packages, API and builder images, and npm `latest` plan with ownership template `0.53.0`.
- Qualify the upgrade from the published `v1.0.0` artifacts and template `0.52.0` using populated Node/SQLite and Worker/D1 projects. Prove that the explicit database migration command applies zero migrations on both targets, that content and originals survive the upgrade, and that backup recovery restores a working 1.0.0 project.
- Preserve the 1.0.0 `LaceClient` contract for existing consumers, custom implementations and typed mocks. Expose the build-thumbnail method on the client returned by the 1.1.0 factory and preserve its authenticated, lazy use in Astro builds.
- Deliver upgrade guidance for managed template files, the operator-owned Cloudflare Images binding, and the Astro rebuild. Record exact-artifact evidence and prepare the owner handoff. Publication, real deployment and cleanup follow the existing owner workflow.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- [`alpha-release-artifacts`](../../../specs/alpha-release-artifacts/spec.md) — select coherent stable release coordinates and bind local qualification to the 1.1.0 inventory.
- [`generated-project-acceptance`](../../../specs/generated-project-acceptance/spec.md) — use the published 1.0.0 template and verify the managed-file upgrade on both generated deployment paths.
- [`prepublication-consumer-security`](../../../specs/prepublication-consumer-security/spec.md) — require both populated cutovers and restores in the 1.1.0 acceptance receipt.
- [`sqlite-schema-and-migrations`](../../../specs/sqlite-schema-and-migrations/spec.md) — prove zero pending changes for a fully migrated 1.0.0 store on SQLite and D1.
- [`project-generator`](../../../specs/project-generator/spec.md) — generate instructions for the 0.52.0 to 0.53.0 template upgrade.
- [`public-documentation`](../../../specs/public-documentation/spec.md) — document the 1.0.0 upgrade, recovery and activation steps for 1.1.0.
- [`public-sdk`](../../../specs/public-sdk/spec.md) — keep the released `LaceClient` interface source-compatible while exposing build thumbnails through the factory.

## Impact

[Architecture §§7, 22 and 25](../../../../docs/architecture/distribution.md), [§5](../../../../docs/architecture/deployment.md) and the [extensibility roadmap](../../../../docs/extensibility-roadmap.md) govern template ownership, compatibility, deployment and release qualification. This session uses the published 1.0.0 release as the immediate origin. The active [1.0.0 change](../2026-11-24-prepare-cms-1-0-0/) still holds the RC5 qualification and unsynchronized deltas. Its evidence and the published RC5-to-1.0.0 route are dependencies and remain historical records. The 1.1.0 plan covers no direct RC5 cutover, new feature development, data/schema migrations or changes to REST and build-export formats. An SDK interface correction, release configuration, packaging, documentation and acceptance updates are in scope.

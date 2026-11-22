## Why

Roadmap step EX7, session EX7A, moves Lace release builds from pnpm `12.3.4` to `12.21.0` after RC5 publication. The workspace, CI, Docker builds and disposable consumers must agree on the resolver before its output can qualify as the next tested baseline.

## What Changes

- Select `pnpm@12.21.0` in the engine checkout, all three repository workflows, the generated Cloudflare Pages workflow, the CI store cache key, and every pnpm installation in the API and builder images.
- Regenerate the workspace lockfile with that executable. Review dependency and peer-resolution changes, including the catalog and override for Vite, and verify a frozen install and native SQLite.
- Run the packed starter, generated local Worker, both images on both supported Linux architectures, and exact-artifact acceptance against the new inventory. Record tested compatibility only after the matching evidence is complete.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `runtime-tooling-minimum-policy` gains requirements for the coordinated pnpm pin and the evidence needed to promote it. The existing `alpha-release-artifacts` and `generated-project-acceptance` capabilities supply the inventory, smoke checks and consumer journeys.

## Impact

Generated projects continue to declare pnpm `>=12`. This session covers release engineering and compatibility guidance. Node versions, public package and image coordinates, publication, database migrations and deployed environments are outside scope. The release matrix records RC5 as published and RC6 as the selected candidate. See [roadmap EX7A](../../../docs/extensibility-roadmap.md#session-ex7a--upgrade-the-pinned-release-toolchain-to-pnpm-12210) and the [release matrix](../../../docs/compatibility.md#release-line).

Architecture §§6, 19–20 govern the workspace, dependency policy and checks. Sections 7 and 22 govern generated projects and compatibility. [Workspace architecture](../../../docs/architecture/workspace.md) · [Distribution architecture](../../../docs/architecture/distribution.md)

## Why

All four content/editor waves are complete. Following the 2026-10-14 readiness audit, the owner selected `0.1.0-alpha.5` on npm channel `next`, superseding the earlier beta selection. The current checkout cannot be released: metadata still selects already-published alpha.4, template identity is stale, generated OpenAPI is stale and ten CLI upgrade tests fail.

## What Changes

- Select one coherent `0.1.0-alpha.5` package/generator/image set with ownership template `0.29.0`, preserving immutable alpha.1–alpha.4 history and private workspaces.
- Keep the existing alpha/`next` publication workflow; beta/channel generalization is outside this change.
- Fix stale CLI upgrade expectations using meaningful current-template assertions, regenerate OpenAPI layout metadata and verify generated output stays current.
- Document CE1–CE9 release changes, upgrade/migration steps, public-contract changes and rollback boundaries, distinguishing historical alpha.4 owner evidence from fresh alpha.5 acceptance.
- Run complete source checks, prepare exact clean-source package/image artifacts for both supported platforms, independently verify them and run exact-artifact consumer acceptance before a separate publication decision.

This is release session Alpha5 following the completed roadmaps, not a new product wave. Dependencies: archived CE1–CE9 and existing artifact preparation/publication/acceptance tooling. Non-goals: backlog features, beta/stable/`latest` publication, remote deployments, automatic risk acceptance or overwriting published artifacts. Existing CE3/CE6 public-contract changes since alpha.4 require upgrade notes; this session introduces no new content API break.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `alpha-release-artifacts`: select alpha.5 and its matching template identity, and require fresh source/artifact acceptance evidence while preserving all existing integrity and publication protections.

## Impact

Architecture sections 22 and 25, `release/alpha.json`, all fifteen public manifests and generated coordinates, registry requirements, Dockerfile defaults, delivered guides, template ownership/upgrade metadata, release tests, CLI upgrade tests and generated OpenAPI. No runtime dependency upgrade or DDL is implied. Fresh immutable package/image inventories and acceptance receipts are required. Publication remains a separate owner-operated action after concrete artifacts and results are reviewed.

## Why

The owner requested alpha.6 after alpha.5 local acceptance. The current checkout includes public-contract tolerance, version-bound paginated build export and confirmed draft-media detachment, but release coordinates still select alpha.5 and its existing artifacts cannot establish acceptance of these changes.

## What Changes

- Select `0.1.0-alpha.6` for all fifteen public packages, generator and API/builder images on `next`, with ownership template `0.30.0`.
- Preserve alpha.1–alpha.4 published history and alpha.5 preparation receipts; record alpha.5 as published only if independent registry evidence or owner confirmation establishes publication.
- Document changes since alpha.5, coordinated API/SDK/builder upgrades and backup/rollback boundaries. **BREAKING:** the raw build-export HTTP response is now a page; direct consumers must follow cursors or use the matching SDK. This release session packages already accepted behavior rather than introducing another API change.
- Verify source, build fresh clean-source artifacts for both Linux platforms, independently verify saved bytes and run exact-artifact consumer acceptance with release-specific regressions.
- Produce alpha.6 release notes and an evidence handoff separating local acceptance from owner-operated deployments and publication.

This is release session Alpha6 after the completed roadmaps. Dependencies are the completed alpha.5 preparation and archived `public-contract-forward-compat`, `paginated-build-export` and `media-detach-delete` changes. Scope follows architecture sections 9, 12, 20, 22 and 25 and accepted `alpha-release-artifacts`, `rest-contracts`, `public-sdk`, `published-site-loader` and `media-use-cases` specs. Non-goals: backlog features, new runtime behavior, dependency upgrades, beta/stable channels, automatic downgrade, remote publication/deployment, or archiving the completed alpha.5 change without an explicit request.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `alpha-release-artifacts`: select alpha.6/template 0.30.0 and require fresh acceptance and compatibility evidence while preserving immutable artifacts and the separate publication gate.

## Impact

`release/alpha.json`, fifteen public manifests, platform release-version modules, generated dependencies/image defaults, Dockerfiles, block registry requirements, delivered guides, generator inventory/upgrade metadata and coordinate-sensitive tests/snapshots. Architecture release references, compatibility documentation and alpha.6 notes/receipts must agree. Existing release scripts and acceptance harness remain authoritative. No database migration or third-party dependency upgrade is introduced by this session; migrations already shipped since alpha.5 must be checked and reported accurately. Packages retain current dependency direction and applications/root/test-utils remain private.

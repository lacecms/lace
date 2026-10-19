## Why

The owner requested the next alpha with the completed image work and updated documentation. Main now includes image delivery A–D and the VPS upload proxy fix, while release coordinates and public documentation still target alpha.6; its saved artifacts cannot establish acceptance of these changes.

## What Changes

- Select `0.1.0-alpha.7` on `next` for all fifteen public packages and API/builder images, advancing the current ownership template `0.34.0` to `0.35.0` after checking registry availability; alpha.6 originally shipped template `0.30.0`.
- Package accepted GIF upload and conditional media delivery, build-time WebP variants (animated for GIF), eligible blurred placeholders, optional lightbox, image/gallery links, persistent build caches, hashed-asset caching and the VPS upload fix.
- Refresh public English/latest, internal operations/compatibility material, generated guides and the concise root changelog together. Explain image-service setup, safe managed-source updates, configuration synchronization, cache behavior and matching backup/rollback boundaries.
- Verify source and build a fresh complete two-platform inventory; independently verify it and run exact-artifact consumer acceptance, including image regressions.
- Apply the owner-approved targeted documentation-build security fix `postcss-selector-parser: 7.1.6` for GHSA-rj75-hqrm-r3gf; retain the existing audit policy without another exception.
- Preserve historical receipts and immutable versions. Establish alpha.6 publication status with fresh registry evidence or explicit owner confirmation; existing metadata does not yet record it as published.

Release session Alpha7 follows the completed image delivery A–D units and uses architecture sections 5, 9, 11–12 and 22, accepted `alpha-release-artifacts`, `public-documentation`, `astro-adapter`, `block-source-registry`, `project-generator`, `media-use-cases`, `rest-contracts`, `vps-composition` and `fixed-command-vps-builder`. Documentation belongs in this session because consumers must adopt the matching packages, installed source and deployment files to receive the image changes safely. No new image behavior is proposed.

Non-goals: video A–C or any other backlog feature, dependency modernization, database downgrade automation, publication to npm/GHCR/GitHub, remote deployment, cleanup of older artifacts, and archiving any active change. `video-a-media-upload-delivery` remains independent and unapplied.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `alpha-release-artifacts`: alpha.7 compatibility, documentation and fresh exact-artifact evidence requirements.
- `public-documentation`: advance English/latest's target to alpha.7 while preserving routes and accurately documenting accepted image workflows.

## Impact

Release metadata, fifteen public manifests, runtime version modules, Dockerfiles, generator dependencies/image defaults, ownership inventory/upgrade metadata, registry package requirements, lockfile and coordinate-sensitive fixtures. Public docs/catalog, architecture release references, changelog, compatibility and generated consumer guides change together. Existing release tooling and acceptance harness are reused, extending image journeys only where needed. No new runtime feature or database migration is introduced; the actual shipped migration inventory must be compared with alpha.6 before making compatibility claims.

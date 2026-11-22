## Why

The only deployed site runs `0.1.0-rc5`. With protected preview and entry references archived and EX7A qualifying the build toolchain, Lace needs one stable release that this site can adopt directly, with evidence for both deployment targets.

## What Changes

- Introduce a post-EX7A release session, **CMS 1.0.0 preparation**. Prepare a fresh, coherent `1.0.0` candidate from the reviewed shipping revision. Select npm `latest`, exact GHCR version tags and a regular GitHub release. Publication, deployment and cleanup remain owner actions.
- **BREAKING** Raise the supported prerelease upgrade origin from RC2 to fully migrated and synchronized RC5 (ownership template `0.50.0`). Remove older release-specific migration checks, fixtures and instructions throughout the active repository. Preserve the immutable published history and the SQL that fresh and RC5 installations execute.
- Upgrade RC5 in place on Node/SQLite and Workers/D1. Qualify site ownership, authentication, content, media, publication and backup-based recovery against saved 1.0.0 artifacts. Existing operators can keep their data and project. New operators can generate a fresh site.
- Publish the supported 1.x compatibility boundaries and an RC5 operator procedure. EX7A and older prerelease evidence identify their own build sets. The stable candidate needs its own acceptance and owner decision.

## Capabilities

### New Capabilities

This release extends the existing distribution and upgrade capabilities.

### Modified Capabilities

- `alpha-release-artifacts` — stable version/channel, publication, finalization, cleanup and stable approval alongside historical prerelease inventories.
- `generated-project-acceptance` — exact RC5 template origin, retaining generic upgrade safety and removing superseded migration coverage.
- `sqlite-schema-and-migrations` — populated RC5 and fresh installation on both runtimes and current index guarantees.
- `gallery-block` — the built-in gallery starts at the RC5 stored shape for this upgrade.
- `project-generator` — delivered upgrade instructions and guides for RC5.
- `public-documentation` — stable documentation target, support floor, adoption and rollback.
- `prepublication-consumer-security` — bind the populated RC5 upgrade journey to the exact release receipt.

## Impact

Architecture §§7, 9, 12–13, 16, 20–22 and 25 govern this session. Section 22 and ADR 0030 currently promise upgrades from RC2. Adopting the new floor requires an explicit superseding decision and architecture/roadmap update before changing supported behavior. The template fixtures, DB and content suites, CLI, generator, registry, images, release scripts, docs and generated consumer acceptance share this boundary. Stable qualification depends on all of them describing the same shipping bytes.

Feature development, a database rebaseline, new REST or export versions, live-site mutation and publication are outside preparation. The chosen template coordinate and owner handoff are detailed in the design. The outstanding RC5 stabilization and EX7A records retain their own evidence and lifecycle.

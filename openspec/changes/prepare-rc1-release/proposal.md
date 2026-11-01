## Why

The owner requests `v0.1.0-rc1` containing everything after the published alpha.8, followed by removal of obsolete alpha.7 upgrade checks. Main contains completed SM1–SM5 and RF1 workspace hygiene, but release metadata still selects alpha.8/template 0.39.0, the generator has reached 0.45.0, the release validator only accepts alpha.N, and retained published-template fixtures still describe alpha.7/template 0.35.0.

## What Changes

- Select `0.1.0-rc1` on npm `next` for the sixteen public packages, generator and both two-platform images; advance ownership template to `0.46.0` for coherent release guidance and upgrade metadata. Accept the requested spelling exactly, without silently substituting `rc.1` or another version.
- Include every committed change from `v0.1.0-alpha.8` through the reviewed shipping source: video aspect ratios/ambient playback, separately consented MCP publishing, media tags and multi-selection, import credentials/CLI, conditional data visibility, gallery videos and workspace/documentation hygiene. Pending refactoring roadmap sessions are outside this release.
- **BREAKING** Document coordinated API/admin/site/builder adoption, migrations 0014–0015, gallery schema 5 and conditional publication projection. Replace the historical draft-only MCP description with the current optional `content:publish` grant; unpublication and deletion stay forbidden.
- Run fresh source gates, prepare immutable artifacts, verify and accept the saved set on Node and local Cloudflare, then publish exact archives/images and finalize the GitHub prerelease with verified evidence. Publication is included in the owner's requested outcome; preparation alone is not completion.
- Only after verified GitHub publication, replace the retained alpha.7 upgrade baseline with exact default/Cloudflare fixtures from the newly published rc1 generator; remove obsolete alpha.7-specific upgrade fixtures/checks while retaining generic upgrade safety and image/provenance regression coverage.

Release session RC1 is an owner-requested release operation after completed SM1–SM5 and RF1A/RF1B, outside the remaining RF2–RF8 units. Preparation, publication and the dependent post-release fixture retirement are sequenced in this change because retirement must be gated on this release's verified publication. Architecture §§4.8, 7, 8, 9.7, 12–14, 16, 19–22 and 25 govern the work. Relevant accepted capabilities include `alpha-release-artifacts`, `generated-project-acceptance`, `public-documentation`, `mcp-content-server`, `mcp-oauth-delegation`, `content-import-cli`, `conditional-fields` and `block-registry`.

Dependencies: pinned Node 24.12.0/pnpm 12.3.4, Docker/Buildx and both Linux execution platforms, Chromium, registry access and owner publishing authentication. Non-goals: completing pending refactoring, introducing new product behavior, remote deployment, deleting historical releases or local artifact sets, changing `latest`, automatically archiving this change, or weakening security/audit gates.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `alpha-release-artifacts`: coherent rc1 coordinates, alpha.8 immutable history, fresh post-alpha.8 acceptance and owner-requested npm/GHCR/GitHub publication.
- `generated-project-acceptance`: retire alpha.7 upgrade fixtures after rc1 publication and retain exact latest-published-template upgrade safety.
- `public-documentation`: English/latest targets rc1 with the post-alpha.8 migration and authority contracts.

## Impact

Release validation/history, sixteen public manifests, runtime version modules, Docker defaults, registry requirements, generator/template metadata and snapshots, lockfile and delivered commands; changelog, compatibility and public/generated documentation; source and exact-artifact acceptance; npm/GHCR/GitHub immutable publication. Post-release changes affect only historical upgrade fixtures and their consumers and must follow the release tag. This release ships existing migrations 0014_media_tags and 0015_import_credentials; it adds no schema migration or runtime feature of its own.

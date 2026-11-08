## Why

The owner requests preparation of `v0.1.0-rc1` containing everything after published alpha.8. On 2026-11-01 the owner clarified that they will publish it themselves; obsolete alpha.7 upgrade checks are to be removed only after that release exists. Main contains completed SM1–SM5 and RF1 workspace hygiene, but release metadata still selects alpha.8/template 0.39.0, the generator has reached 0.45.0, the release validator only accepts alpha.N, and retained published-template fixtures still describe alpha.7/template 0.35.0.

## What Changes

- Select `0.1.0-rc1` on npm `next` for the sixteen public packages, generator and both two-platform images; advance ownership template to `0.46.0` for coherent release guidance and upgrade metadata. Accept the requested spelling exactly, without silently substituting `rc.1` or another version.
- Include every committed change from `v0.1.0-alpha.8` through the reviewed shipping source: video aspect ratios/ambient playback, separately consented MCP publishing, media tags and multi-selection, import credentials/CLI, conditional data visibility, gallery videos and workspace/documentation hygiene. Pending refactoring roadmap sessions are outside this release.
- **BREAKING** Document coordinated API/admin/site/builder adoption, migrations 0014–0015, gallery schema 5 and conditional publication projection. Replace the historical draft-only MCP description with the current optional `content:publish` grant; unpublication and deletion stay forbidden.
- Run fresh source gates, prepare immutable artifacts, verify and accept the saved set on Node and local Cloudflare, then hand off the exact archive/image inventory and commands for owner-operated npm/GHCR/GitHub publication. This change performs preparation only.
- Retain alpha.7 upgrade fixtures during preparation and add the exact published alpha.8 baseline. Record a later, publication-gated follow-up to replace historical fixtures with the owner-published rc1 generator and remove obsolete alpha.7-only upgrade checks while retaining generic upgrade safety.

Release session RC1 is an owner-requested release operation after completed SM1–SM5 and RF1A/RF1B, outside the remaining RF2–RF8 units. This change ends at local readiness and an owner publication handoff. Publication and dependent fixture retirement remain separate later operations. Architecture §§4.8, 7, 8, 9.7, 12–14, 16, 19–22 and 25 govern the work. Relevant accepted capabilities include `alpha-release-artifacts`, `generated-project-acceptance`, `public-documentation`, `mcp-content-server`, `mcp-oauth-delegation`, `content-import-cli`, `conditional-fields` and `block-registry`.

Dependencies: pinned Node 24.12.0/pnpm 12.3.4, Docker/Buildx and both Linux execution platforms, Chromium, read-only registry access; owner publishing authentication is needed only for the later live operation. Non-goals: live npm/GHCR/GitHub publication, post-release fixture retirement, completing pending refactoring, introducing new product behavior, remote deployment, deleting historical releases or local artifact sets, changing `latest`, automatically archiving this change, or weakening security/audit gates.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `alpha-release-artifacts`: coherent rc1 coordinates, alpha.8 immutable history, fresh post-alpha.8 acceptance and an owner-operated publication handoff.
- `generated-project-acceptance`: retain the published alpha.8 upgrade baseline and gate future alpha.7 retirement on owner publication.
- `public-documentation`: English/latest targets rc1 with the post-alpha.8 migration and authority contracts.

## Impact

Release validation/history, sixteen public manifests, runtime version modules, Docker defaults, registry requirements, generator/template metadata and snapshots, lockfile and delivered commands; changelog, compatibility and public/generated documentation; source and exact-artifact acceptance; an exact-artifact handoff for later npm/GHCR/GitHub publication. Historical alpha.7 fixtures remain until a separate post-release follow-up. This release ships existing migrations 0014_media_tags and 0015_import_credentials; it adds no schema migration or runtime feature of its own.

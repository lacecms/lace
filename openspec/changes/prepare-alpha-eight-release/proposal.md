## Why

Main contains completed work since alpha.7, including list layouts, video embeds, internal URL links, configurable collection queries and OAuth MCP. The owner requested alpha.8 preparation; existing alpha.7 artifacts and acceptance cannot establish readiness for this source, and release metadata still selects template 0.35.0 while the generator has advanced to 0.38.0.

## What Changes

- Select `0.1.0-alpha.8` on `next` across all sixteen public packages (including the new `@lacecms/mcp`), both runtime images and delivered installation commands; advance the ownership template to `0.39.0` with coordinated upgrade guidance.
- Record alpha.7 as published and immutable after verifying its original fifteen-package inventory and both public images. Preserve historical artifacts and reports; MCP was not part of alpha.7.
- **BREAKING** Document build-export format 2, internal-link rendering and coordinated engine/SDK/render/Astro/builder upgrades, actual migrations since alpha.7, configuration/source adoption and backup-based rollback.
- Refresh English/latest, compatibility and generated operational guidance plus concise alpha.8 changelog notes covering the accepted changes; explain optional MCP activation, consent, revocation and its draft-only authority.
- Verify the source and dependency/license policy; prepare sixteen archives and API/builder images for linux/amd64 and linux/arm64 from one clean reviewed revision, independently verify the saved set and run fresh exact-artifact acceptance with alpha.8 regressions.

Release session Alpha8 follows the completed post-alpha.7 units and MCP1–MCP3. It uses architecture sections 7, 9, 11–14, 16, 19–22 and 25, and accepted `alpha-release-artifacts`, `public-documentation`, `project-generator`, `generated-project-acceptance`, `block-source-registry`, `rest-contracts`, `mcp-content-server`, `mcp-oauth-delegation` and related accepted capability specs. Documentation and artifact acceptance belong together because operators need matching packages, migrations, installed components and deployment configuration.

Dependencies: completed features already on main, pinned Node 24.12.0/pnpm 12.3.4, Docker/Buildx, both supported image execution platforms and registry access. Non-goals: new backlog features, uploaded video, general dependency modernization, remote publication or deployment, deletion of old artifacts and archiving changes. New security-policy exceptions require separate approval.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `alpha-release-artifacts`: select alpha.8/template 0.39.0, preserve alpha.7 publication history, require the sixteen-package graph and fresh acceptance for post-alpha.7 behavior.
- `public-documentation`: advance English/latest's target to alpha.8 while preserving routes and explaining the accepted changes and upgrade path accurately.

## Impact

Release definition, public manifests and platform version modules, Docker defaults, registry requirements, generator dependencies/templates/upgrade metadata, lockfile and coordinate-sensitive fixtures; release and consumer acceptance coverage; changelog, compatibility, architecture release references and public/internal/generated documentation. Existing release tooling is reused. This session introduces no new runtime capability or database schema: it verifies and ships the already accepted migrations, including 0010–0013, against the alpha.7 baseline.

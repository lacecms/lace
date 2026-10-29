## 1. Coordinates and upgrade contract

- [x] 1.1 Save dated read-only alpha.7 publication and alpha.8 availability evidence for the historical fifteen-package graph, current sixteen-package graph and both images; verify registry statuses, alpha.7 source/migration baseline and immutable history without claiming publishing rights.
- [x] 1.2 Update architecture release references, alpha.8 compatibility/rollback guidance and the root changelog; verify coverage of post-alpha.7 features, export format 2, migrations 0010–0013, coordinated dependencies/images, source conflicts, configuration sync and matching backups.
- [x] 1.3 Select alpha.8/next across release metadata, sixteen public manifests, platform version modules, generated dependencies/image defaults, Docker defaults, registry requirements and delivered versioned commands; record alpha.7 as published, refresh the lockfile and verify `pnpm release:check` and `pnpm release:plan` with private packages unchanged.
- [x] 1.4 Advance ownership template 0.38.0 to 0.39.0 with release/MCP upgrade instructions and refresh all six generated snapshots; verify focused generator/CLI tests, repeat-generation stability, preservation of user-owned files and historical upgrade/conflict fixtures including alpha.7 adoption.

## 2. Documentation

- [x] 2.1 Refresh public content-modeling/editing/Astro guidance for list settings, compact media rows, embeds, internal links/Link blocks, unavailable targets, format-2 exports and collection-query limits; verify examples and internal/generated counterpart guides against accepted specs and delivered commands.
- [x] 2.2 Refresh public/internal/generated deployment, account and operations guidance for migrations, MCP default-off activation, canonical origin/proxy/logging, consent/revocation and Codex/Claude Code/Gemini CLI setup with permissions; verify all examples preserve the five-tool ceiling and explicitly forbid publishing/deletion.
- [x] 2.3 Advance English/latest catalog, target assertions and maintained release references to alpha.8 while preserving route identities; verify `pnpm docs:check`, `pnpm docs:build`, docs variants and a built-site navigation/search/deep-page smoke check.

## 3. Source and exact-artifact coverage

- [x] 3.1 Verify release preparation/publication/lifecycle tests and active package-count assertions support sixteen packages including MCP while preserving historical fifteen-package fixtures; run focused release tests and reject private/workspace/tarball references in packed metadata.
- [x] 3.2 Extend saved-artifact consumer journeys for list settings, video markup/preview activation, resolved/unavailable format-2 links and configured draft queries with unchanged published content; verify journeys use inventory artifacts on the generated Node and local Cloudflare consumers, retaining existing image/cache/recovery coverage.
- [x] 3.3 Extend saved-artifact MCP journeys for default-off behavior and enabled discovery, OAuth consent, SDK initialize/list/call, scoped draft mutation, forbidden publication/deletion, role enforcement and revocation; verify generated Node proxy routing/safe logging and local Worker behavior without source-workspace runtime resolution or leaked credentials.
- [x] 3.4 Run `pnpm compat:mcp` and focused migration/content/link/query/render/browser regressions; verify SQLite/D1 forward migrations, consent/account UI, replay/concurrency and D1 budgets, explicitly labeling source-only evidence separately from saved-artifact journeys.
- [x] 3.5 Run full `pnpm test`, root typecheck, Oxlint, Oxfmt, OpenAPI, strict all-spec validation and strict change validation; resolve regressions within accepted behavior and retain successful commands/results before freezing shipping source.
- [x] 3.6 Refresh the existing dependency/license audit and verify its current policy passes; retain existing advisory dispositions explicitly, stop for any new policy exception and repeat affected source/docs gates after a reviewed remediation.

## 4. Immutable preparation and handoff

- [x] 4.1 Commit the reviewed shipping source, verify clean status and frozen installation on Node 24.12.0/pnpm 12.3.4, and check Docker/Buildx plus both Linux execution platforms; record the revision and any missing prerequisites before claiming eligible preparation.
- [x] 4.2 Run `pnpm release:prepare --output .release-artifacts/alpha-8` or a distinct recorded retry destination; verify a complete publication-eligible inventory containing sixteen archives and API/builder images for linux/amd64 and linux/arm64, passing all platform smokes without overwriting saved sets.
- [ ] 4.3 Run `pnpm release:verify --output <saved-directory>` and `pnpm acceptance:release --artifacts <saved-directory>`; verify checksums/source/IDs, all retained and alpha.8 journeys, successful cleanup and a durable acceptance receipt with actual runtime/platform coverage.
- [ ] 4.4 Write the readiness handoff with source/fingerprint, inventory path/SHA-256, archive hashes, local image identifiers, harness revision, commands/results and remaining authenticated publication/real-deployment prerequisites; verify final links/format/strict change validation and confirm no publication, remote deployment or historical cleanup occurred.

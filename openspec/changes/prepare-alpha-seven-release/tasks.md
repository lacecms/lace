## 1. Candidate coordinates and compatibility

- [x] 1.1 Record dated read-only npm/GHCR candidate availability and alpha.6 publication checks; verify all fifteen versions and both image coordinates, preserve existing immutable history and leave unavailable publication/rights checks explicit before selecting alpha.7.
- [x] 1.2 Update architecture release references, compatibility/rollback guidance and the root alpha.7 changelog entry; verify coverage of image A–D, VPS upload fixes, synchronized block schemas and actual migrations compared with alpha.6, with no unsupported video claims or relabeled old evidence.
- [x] 1.3 Select alpha.7/next across release metadata, fifteen public manifests, platform versions, generated dependencies/image defaults, Dockerfiles, registry requirements and delivered versioned commands; refresh the lockfile and verify `pnpm release:check` and `pnpm release:plan` agree without changing private workspaces.
- [x] 1.4 Advance current ownership template 0.34.0 to 0.35.0, update inventory/upgrade metadata and affected snapshots selectively; verify focused generator/CLI tests and upgrades from alpha.6 plus existing historical fixtures, including user-edited component conflicts and repeat-generation stability.

## 2. Documentation refresh

- [x] 2.1 Update public media and Astro guidance for supported formats/limits, original and optimized delivery, image config and sharp, animated WebP, placeholder exceptions, lightbox and link precedence; verify examples against accepted specs and generated starter/existing-site setup.
- [x] 2.2 Update public deployment/operations and related internal/generated guides for upload proxy changes, cache headers, builder/Pages cache handling, matching component/deployment updates, content sync and backups; verify audience-specific commands and links using the documentation topic map.
- [x] 2.3 Advance English/latest catalog and version-sensitive assertions to alpha.7 without changing routes or supported pairs; run `pnpm docs:check`, `pnpm docs:build` and the docs variant fixture, and smoke-check landing/deep pages, navigation, search and rendered image guidance in the built site.

## 3. Source and image acceptance

- [x] 3.1 Verify focused release tooling, media/server/platform, SDK/render/Astro, registry/generator and builder/proxy tests; confirm GIF validation/animation, conditional delivery, placeholder exceptions, link precedence, cache safety and prior-release preservation match accepted behavior.
- [ ] 3.2 Extend exact-artifact acceptance where existing journeys lack image coverage: GIF upload/unchanged original/conditional requests in Node and local Cloudflare, WebP animation/static variants, placeholder inclusion/exclusion, lightbox/link precedence, valid VPS upload above 1 MiB, HTML/hashed/missing asset headers and repeated cache-backed builds; verify journeys execute saved runtime bytes and separately identify source-only fault/concurrency and Pages configuration checks.
- [x] 3.3 Run full `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm openapi:check`, `pnpm spec:validate` and `pnpm exec openspec validate prepare-alpha-seven-release --type change --strict`; resolve failures and retain results before freezing shipping source.
- [x] 3.4 Apply the owner-approved `postcss-selector-parser: 7.1.6` override for GHSA-rj75-hqrm-r3gf, refresh the lockfile and repeat docs validation/build; refresh the existing dependency/license audit and verify its current policy passes, preserving existing advisory dispositions without new exceptions.

## 4. Immutable artifact preparation and handoff

- [x] 4.1 Record a reviewed authorized clean shipping revision and successful frozen installation with pinned toolchain; verify Git status, revision, Docker/buildx and both Linux execution platforms before full preparation, reporting missing prerequisites without substituting an eligible preview.
- [ ] 4.2 Run `pnpm release:prepare --output .release-artifacts/alpha-7` or a unique documented retry destination; verify complete publication-eligible inventory with fifteen archives and both API/builder images for linux/amd64 and linux/arm64 and passing platform smokes.
- [ ] 4.3 Run `pnpm release:verify --output <saved-directory>` and `pnpm acceptance:release --artifacts <saved-directory>`; verify source/checksums/IDs, all existing and added image journeys, durable acceptance receipt and explicitly stated runtime/platform coverage without rebuilding saved artifacts.
- [ ] 4.4 Write the alpha.7 readiness handoff with inventory path/SHA-256, source/fingerprint, artifact identifiers, commands/results, harness revision and remaining publication/deployment prerequisites; verify links, final strict validation and that no remote publication/deployment or historical-artifact deletion occurred.

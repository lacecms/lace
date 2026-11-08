## 1. Release contract and coordinates

- [x] 1.1 Refresh dated read-only evidence for alpha.8's sixteen npm versions, both image manifests and GitHub release/source, and rc1 availability across npm/GHCR/GitHub; verify complete immutable alpha.8 history before recording it as published and refuse occupied conflicting rc1 coordinates.
- [x] 1.2 Update architecture release references and record the owner-requested RC1 checkpoint in the roadmap; verify no pending RF2–RF8 work is implicitly included or made a release prerequisite.
- [x] 1.3 Extend candidate and published-history validation for alpha.N and rcN, retaining exact `0.1.0-rc1`; run focused release model/artifact/publication/lifecycle tests for valid RC, invalid formats, published-version refusal and historical inventory compatibility.
- [x] 1.4 Select rc1/next across release metadata, sixteen public manifests, platform version modules, registry requirements, generated dependencies/image defaults, Docker defaults and delivered installation commands; refresh lockfile and verify release:check and release:plan with private packages unchanged.
- [x] 1.5 Advance ownership template 0.45.0 to 0.46.0 with coordinated release/upgrade instructions and refresh all six generated snapshots; verify focused generator/CLI contracts, repeated generation and preservation of user-owned files.

## 2. Upgrade guidance and current publication baseline

- [x] 2.1 Add concise rc1 changelog notes and permanent alpha.8-to-rc1 upgrade/rollback guidance; verify coverage of video playback/aspect ratios, MCP publication grant, tags/multi-selection, imports, conditional projection and gallery v5, actual migrations 0014–0015, source conflicts and matching backups.
- [x] 2.2 Refresh public catalog/target assertions and public/internal/generated topic guidance while preserving English/latest routes; run docs:check, docs:build, docs variants and built-site navigation/search/deep-page smoke verification, checking MCP publication/unpublication/deletion distinctions.
- [x] 2.3 Generate exact default and Cloudflare fixtures from the verified published alpha.8 generator archive, recording source, npm integrity and archive SHA-256; retain existing alpha.7 fixtures until task 5.2 and verify generic fixture managed digests/provenance and packed-CLI upgrade conflict, user-file preservation, recovery and no-op repeat behavior.

## 3. Source gates and immutable artifact acceptance

- [x] 3.1 Update current saved-artifact MCP journeys for separate content:publish consent and current roles/scopes, denied publication without authority, revocation and forbidden unpublication/deletion; run focused MCP compatibility and Node/Worker source tests, preserving default-off coverage and excluding secrets from diagnostics.
- [x] 3.2 Add missing saved-consumer coverage for media tags/multi-selection, offline/import-with-publication/idempotent repeat, conditional requiredness/draft preservation/public omission and gallery video accessibility/playback/aspect ratios; verify it uses inventory generator/CLI/archives/images on Node and local Worker, retaining image/cache/internal-link/build recovery and upgrade journeys.
- [x] 3.3 Run full pnpm test, compat:mcp, root typecheck, lint, format:check, openapi:check, spec:validate and strict validation of prepare-rc1-release; retain commands/results and label source-only concurrency/D1-budget evidence separately.
- [x] 3.4 Refresh dependency/license audit under the existing policy, verifying no unreviewed advisory/license exception; retain current dispositions and stop for a new policy or design decision rather than silently weakening gates.
- [x] 3.5 Commit reviewed shipping source, verify clean status/frozen installation with Node 24.12.0 and pnpm 12.3.4, and verify Docker/Buildx plus both Linux execution platforms; record source and prerequisites before preparation.
- [x] 3.6 Run release:prepare --output .release-artifacts/rc1 (or a distinct recorded retry destination); verify complete publication-eligible inventory with sixteen archives and API/builder images for linux/amd64 and linux/arm64, passing both-platform smoke checks without overwriting saved sets.
- [x] 3.7 Run release:verify --output <saved-directory> and acceptance:release --artifacts <saved-directory>; verify immutable checksums/source/image identities, retained and new journeys, successful temporary cleanup and durable acceptance.json with actual runtime/platform/harness coverage.
- [x] 3.8 Record the readiness handoff with source/fingerprint, inventory SHA-256, archive hashes, local image IDs, harness revision and successful gates; verify publication and real deployment remain separately identified and no alpha.7 retirement has occurred.

## 4. Owner-operated publication handoff

- [x] 4.1 Run read-only npm/image publication previews and GitHub finalization preview against the accepted saved directory; verify no mutation, record expected missing public rc1 coordinates and publishing-authentication prerequisites, and confirm source/notes commits are available remotely.
- [x] 4.2 Deliver the exact saved directory, inventory and acceptance checksums, source/harness revisions, artifact identities and commands for the owner to publish npm, GHCR and GitHub; verify latest remains unchanged, no live publication/tag/draft/deployment/cleanup occurred and alpha.7 fixture retirement is explicitly deferred until after owner-confirmed release completion.

Publication and post-release alpha.7 fixture retirement are outside this apply,
following the owner's 2026-11-01 clarification. They are not completed tasks;
the owner will publish, and fixture retirement requires a later follow-up after
that publication is verified. Archiving remains a separate explicit request.

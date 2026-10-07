## 1. Contract-freeze decision and repository baseline

- [x] 1.1 Record the decision to retain the v1 mirrored public DTO in architecture §13 and the Step 34A verification record; verify consistency with `rest-contracts`, `public-sdk`, `published-site-loader` and unchanged contract/SDK/render public types, with no migration required.
- [x] 1.2 Build required workspace dependencies and run the existing identical repository contract cases for file-backed/in-memory SQLite and local D1; record commands and results and verify no cases are skipped or runtime-specific expectations introduced.

## 2. Shared API parity proof

- [x] 2.1 Add isolated Node and local Worker fixtures plus common seed inputs, scenario definitions, expected response fixtures and explicit generated-value normalization; verify both use migrated real runtime composition roots and real authentication, and teardown preserves ordinary development state.
- [x] 2.2 Exercise content creation/save, publication/replay, stale-revision concurrency, route conflict and cursor pagination through both fixtures; verify status, schemas, semantic bodies, ordering, revisions, error codes and relevant headers against the same expectations.
- [x] 2.3 Add admin/editor/viewer authorization, media upload/reuse and published-media visibility, build-history/failure and public read/export cases; verify draft/unpublished sentinels are absent, public mirrored snapshots match publication, build-token scope is retained and conditional ETags behave identically on both runtimes.

## 3. Real-backend browser coverage

- [x] 3.0 Correct the discovered failed-build explanation contrast with the existing foreground token; verify opened failure details pass axe without disabling rules and add that audit to exact-candidate acceptance.

- [x] 3.1 Reuse or parameterize Playwright helpers to run administrator editing, block ordering, media upload/reuse and publication against isolated Node/MinIO and Worker/D1/R2 backends; verify existing keyboard/accessibility acceptance remains enabled and browser content authoring uses UI controls.
- [x] 3.2 Add editor save/no-publish and viewer read-only scenarios plus two-session stale-revision recovery on both backends; verify restricted controls and backend denial, retained local authoring and explicit recovery.
- [x] 3.3 Connect Save, Publish and Reload draft errors to the existing session recovery hook and verify the three error paths with focused editor tests. Add backend-invalidated session and publication-followed-by-controlled-build-failure scenarios on both backends; verify protected mutations fail after session loss, sign-in recovery is visible, publication remains successful and the UI truthfully reports build failure/recovery without claiming a provider deployment.

## 4. Cross-runtime Astro comparison

- [x] 4.1 Build the same Astro fixture from each actual runtime export into isolated outputs; verify canonical published values, emitted routes and media references against shared expectations and each other while preserving block order and excluding drafts, unpublished routes and credentials.
- [x] 4.2 Verify the SDK published-site view contains no draft-shaped properties or editorial metadata and document the field-specific canonicalization rules; run focused SDK/render/site tests alongside the two-runtime build comparison.

## 5. Local orchestration and final evidence

- [x] 5.1 Add a documented root pnpm verification command covering all required phases with runtime/scenario diagnostics and fail-closed aggregation; verify a controlled phase failure and a missing prerequisite cannot report overall success and owned resources are cleaned up.
- [x] 5.2 Record published alpha.3, select the next unused candidate and template version, refresh shipping coordinates and upgrade instructions, verify release/generator/upgrade tests and snapshots, commit the reviewed implementation, prepare and verify both platform images and all packages from that clean revision, then run exact-candidate generated-project/browser checks including opened failed-build contrast; retain the new reviewed inventory and source/artifact provenance without publishing.
- [x] 5.3 Complete `docs/archive/step-34/step-34a-verification.md` with actual commands/results, source tree state, tool versions, scenario coverage, candidate identities, DTO decision and simulator limits; update only the roadmap's 34A completion with evidence and keep 34B/34C and owner deployment acceptance open.
- [x] 5.4 Run focused changed-area tests, root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm exec openspec validate step-34a-cross-runtime-browser-verification --type change --strict`; verify every required check passes before completion.

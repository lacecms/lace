## 1. Running CMS release in admin Settings

- [x] 1.1 Generate portable platform release-version literals from package manifests, wire generation/check ordering into builds and release validation, and replace Node/Worker `0.0.0` defaults; verify focused runtime/release tests cover manifest agreement, independent consumer versions and the preserved Node metadata override.
- [x] 1.2 Add validated `engineVersion` to the settings-status DTO and server response, update response fixtures and OpenAPI artifacts as applicable; verify contract/server tests retain readiness/count behavior and deny editor, viewer, anonymous and build-token callers.
- [x] 1.3 Render the full CMS version in Settings → Site status using existing UI tokens and responsive cards; verify component/client tests cover prerelease text, loading, unavailable status, stale refresh, successful refresh and expired-session clearing, plus narrow-screen browser rendering.

## 2. Local operations harness and health evidence

- [x] 2.1 Add the isolated `pnpm verify:34c` runner with required-phase results, local target/credential restrictions and ownership-aware cleanup; verify harness tests reject empty/skipped/unavailable phases and cover failure, interruption and concurrent resource isolation.
- [x] 2.2 Add real Node and local Worker health/readiness and structured-log verification, including missing migration/database readiness, response/log request-ID correlation and safe actor/build fields; verify captured records exclude secret sentinels and document actual startup-validation exceptions.

## 3. Coordinated backup and isolated restore

- [x] 3.1 Implement the SQLite/MinIO drill with quiescence, WAL-safe backup, object/API copying and config/ownership capture into private isolated storage; verify restored roles, drafts/published data, blocks, references, object hashes, sign-in, media and static rebuild, then original-installation resumption.
- [x] 3.2 Implement the stopped local D1/R2 persistence snapshot drill in separate pinned-simulator state; verify the same metadata/object/sign-in/rebuild comparisons and original resumption, recording snapshot method/version and excluding remote acceptance claims.
- [x] 3.3 Add missing/corrupt-object restore failures and isolation assertions for hooks, build destinations and cleanup; verify SQL-only restore cannot pass, original user/runtime files remain unchanged and secret-bearing backups are excluded from committed evidence.

## 4. Rotation, migration and recovery checks

- [x] 4.1 Exercise replacement/revocation of build tokens and authentication-secret rotation on both local runtime paths; verify old token/session denial, replacement export, fresh sign-in, preserved content and successful rebuild.
- [x] 4.2 Exercise Node builder/MinIO credential rotation and controlled hook/provider credential replacement; verify old credentials fail, replacement credentials recover and a failed/corrected build preserves the last successful static release until replacement.
- [x] 4.3 Run supported forward migration and filesystem upgrade/dry-run/rollback paths on backed-up isolated installations; verify existing acceptance preserves user-owned Astro/config/block/README files and reports edited-block/template conflicts without overwriting them.

## 5. Operational documentation and traceability

- [ ] 5.1 Complete generated operations and Compose/Cloudflare scenario guides plus repository development, migration/auth, Cloudflare handoff and owner-plan references; verify documented account-free setup/operations paths through guide extraction and local execution, and label remote commands owner-operated.
- [x] 5.2 Deliver the operator observation checklist for engine version, migrations, config hashes/sync, object access and latest build, with truthful health/doctor/log meanings and restore/rotation/troubleshooting procedures; verify every local command against the runner and every stated field against captured evidence.
- [x] 5.3 Advance managed ownership metadata coherently to template 0.20.0 while retaining unpublished alpha.4; update generator/upgrade fixtures and guide version statements, then verify rendered starter/existing/none and Cloudflare variants plus `pnpm release:check`.
- [x] 5.4 Create `docs/mvp-traceability.md` and `docs/local-operations-verification.md`, mapping each architecture §3 Included item and §14 security requirement to named tests/docs/local evidence and owner-plan checks; verify no row or unperformed remote check is silently marked passed and 34B risks remain visible.

## 6. Final verification and owner handoff

- [ ] 6.1 Run focused affected tests, the complete local operations runner, root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, applicable OpenAPI checks, `pnpm release:check`, `git diff --check` and `pnpm exec openspec validate step-34c-local-operations-owner-handoff --type change --strict`; retain commands/results and resolve failures before checking this task.
- [ ] 6.2 Prepare a refreshed clean-source alpha.4/template 0.20.0 candidate from the verified 34B baseline, verify package checksums and both-platform image identities/smokes; record exact source/artifact identities in a new 34C inventory without relabelling historical artifacts.
- [ ] 6.3 Run the complete exact-artifact release consumer acceptance and new release/operations assertions on clean generated Node and Cloudflare-local consumers, including starter and independent Astro ownership cases and all nine final-roadmap journey actions; verify actual admin release text, restored content/media/static output and cleanup, recording native versus emulated coverage truthfully.
- [ ] 6.4 Deliver `docs/archive/step-34/step-34c-verification.md` and the separate artifact/result inventory, update the roadmap's local completion and owner-plan links only after required evidence passes; verify real VPS/Cloudflare, remote D1 capacity/restore, publication and stable-release approval remain pending and neither active change is archived implicitly.

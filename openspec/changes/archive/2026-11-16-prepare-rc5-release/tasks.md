## 1. Establish release inputs

- [x] 1.1 Record dated read-only evidence for all sixteen rc4 npm versions, both image indexes and the GitHub release/tag and check all rc5 coordinates for collisions; document unavailable or conflicting evidence and do not assume it implies absence.
- [x] 1.2 Review the full diff and accepted changes since `v0.1.0-rc4`; record shipping scope, migration and compatibility actions, and verify rc2 remains the support floor.
- [x] 1.3 Verify the published rc4 generator archive and provenance against the retained default and Cloudflare `template-0.49.0` fixtures, including archive/registry and managed-file digests; run fixture integrity and upgrade/conflict checks.

## 2. Prepare coordinated candidate

- [x] 2.1 After establishing publication and availability, select rc5/next, append verified rc4 to published history, and align all package manifests, platform versions, image defaults, registry requirements, generator dependencies, documentation commands and lockfile; run `pnpm release:check` and `pnpm release:plan`.
- [x] 2.2 Confirm template `0.50.0` and its upgrade instructions accurately cover the published rc4 baseline and managed Compose changes; regenerate and verify all generated snapshots and hashes, and run focused generator, CLI, release-model and template tests.
- [x] 2.3 Correct the historical rc4 template identity wherever it is misstated, preserving immutable provenance and testing version-sensitive assertions.

## 3. Release guidance

- [x] 3.1 Add concise rc5 changelog and update compatibility and consumer guides for the actual post-rc4 behavior, forward migration, production ingress/proxy transition, coordinated upgrade and backup-based rollback; check documentation and links.
- [x] 3.2 Update the selected candidate and owner instructions in release guidance and record source-only evidence and the remaining clean-commit, artifact, acceptance and publication steps; verify no release archive, image, tag, deployment or publication was created.

## 4. Verification

- [x] 4.0 Align Better Auth OAuth provider and related peers with the selected Better Auth version, regenerate the lockfile, add `pnpm compat:mcp` to CI, and verify plugin types and OAuth behavior on Node and Worker without type suppressions.
- [x] 4.1 Run relevant focused tests and docs checks, full workspace and root tests, MCP compatibility, build, OpenAPI check, docs build/variants and the existing dependency/license audit policy; record results and any unresolved failures without claiming readiness.
- [x] 4.2 Run root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm spec:validate`, and `pnpm exec openspec validate prepare-rc5-release --type change --strict`; record outcomes and any limitations.

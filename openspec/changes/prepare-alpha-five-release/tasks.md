## 1. Release source coherence

- [x] 1.1 Update architecture sections 22/25 and alpha release documentation for alpha.5/next, preserving historical alpha.4 confirmations and separate owner deployment gates; verify documentation agrees with the delta spec and links resolve.
- [x] 1.2 Select `0.1.0-alpha.5` consistently in release metadata, fifteen public manifests, generated dependencies, runtime versions, registry requirements, image defaults and delivered guides; refresh the lockfile and verify `pnpm release:check` plus `pnpm release:plan` pass while alpha.1–alpha.4 history and private workspaces remain intact.
- [x] 1.3 Advance ownership template/generator upgrade metadata to `0.29.0`; fix CLI current-target expectations while preserving historical fixtures and upgrade behavior assertions; verify focused CLI upgrade and generator tests pass.
- [x] 1.4 Regenerate checked-in OpenAPI layout metadata, review its diff and verify `pnpm openapi:check` passes without further changes.
- [x] 1.5 Add CE1–CE9 release/upgrade notes with relevant CE3/CE6 public-contract changes, forward migration ordering and matching backup/rollback boundaries for Node and Cloudflare; verify against accepted specs and shipped migrations and record outstanding owner checks separately.

## 2. Source acceptance

- [x] 2.1 Verify focused release-model/preparation/publication tests, including published-version refusal, immutable history and exact-artifact recovery protections, pass with alpha.5 coordinates.
- [x] 2.2 Run full `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm openapi:check` and strict OpenSpec validation; record successful commands and resolve failures before preparing artifacts.
- [x] 2.3 Refresh the existing dependency/license audit; verify its policy passes, preserve the two explicit tooling dispositions if still applicable and record the actual advisory/license counts without claiming zero vulnerabilities.

## 3. Exact artifact acceptance and handoff

- [x] 3.1 Recheck alpha.5 npm/image coordinate availability and publishing rights as read-only evidence, then capture an authorized reviewed clean source commit; verify the selected source revision and clean status before preparation without deleting published history.
- [ ] 3.2 Run frozen-lockfile release preparation to a distinct `.release-artifacts/alpha-5` destination (or a documented unique retry path); verify the complete eligible inventory contains fifteen archives and API/builder images for both linux/amd64 and linux/arm64 with passing platform smoke checks.
- [ ] 3.3 Run independent `release:verify` and `acceptance:release` against that exact inventory; verify package checksums, image identifiers, source revision and all consumer acceptance results are recorded without rebuilding or reusing alpha.4 output.
- [ ] 3.4 Update the readiness handoff with immutable inventory location, source revision, checksums, verification/acceptance evidence and remaining owner-operated real deployment/publication prerequisites; verify the report distinguishes prepared artifacts from full release readiness and no remote publication/deployment occurred.

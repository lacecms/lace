## Context

See `proposal.md` and `readiness.md` for motivation and observed failures. Existing release tooling already supports alpha/`next`, exact tarballs, two images on two platforms, collision protection and clean-source eligibility. The stale published candidate must be replaced, not made eligible by removing publication history. Current generator ownership identity is `0.28.0`; release metadata still says `0.20.0`.

## Goals / Non-Goals

**Goals:** Keep existing release tooling and package boundaries; produce a reproducible alpha.5 candidate with honest, inspectable acceptance evidence. Preserve Node/Cloudflare parity and the distinction between artifact preparation and owner-operated real deployments.

**Non-Goals:** No beta channel infrastructure, runtime dependency upgrades, new migrations, automatic database downgrades or remote publication/deployment in this change.

## Decisions

### Use the existing alpha release model

Keep `release/alpha.json`, alpha-only validation and `next` publication. Select `0.1.0-alpha.5` consistently across fifteen public manifests, generated dependencies, platform version metadata, image defaults, registry requirements and versioned consumer guides; refresh the lockfile with the pinned pnpm. Keep alpha.1–alpha.4 in published history and root/apps/test-utils private. Use release-model checks to identify stale coordinates rather than weakening validation. Generalizing to beta was considered but is unnecessary after the owner's revised selection.

### Advance template identity when delivered managed files change

Use ownership template `0.29.0` because release coordinate/guidance updates change generated managed files. Update generator inventory and upgrade metadata together. Keeping `0.28.0` would describe different delivered files with the same ownership identity. In CLI upgrade tests, derive assertions about the current target from the exported template version while retaining explicit historical source versions and meaningful conflict/idempotency checks. Do not merely replace every historical literal or remove failing assertions.

### Regenerate the API contract without changing runtime behavior

Regenerate the checked-in OpenAPI artifact using its existing script. The audit observed missing layout metadata; verify the generated diff and rerun `openapi:check`. Do not introduce another API change to make generation pass. Existing CE3/CE6 public contract changes are documented in the release migration notes rather than silently reclassified as compatible.

### Verify source first, then immutable artifacts

Run focused generator/CLI/release tests, full workspace and root tests, typecheck, lint, formatting, OpenAPI and strict OpenSpec validation. Refresh the existing dependency/license audit and record its explicit tooling dispositions; new undispositioned findings follow the existing policy.

After source review and an authorized clean commit, prepare to a distinct `.release-artifacts/alpha-5` destination with the frozen lockfile. Build all fifteen package archives and API/builder images for `linux/amd64` and `linux/arm64`, including existing platform smoke checks. Verify saved artifacts independently, then run `acceptance:release` against that exact directory. Preserve source revision, checksums, verification output and acceptance receipts. A later documentation-only evidence commit does not change which source revision built the artifacts; rebuilding changed source requires a new distinct inventory, never editing a saved inventory to match HEAD. Dirty preview artifacts and old alpha.4 output are not substitutes.

### Preserve the separate owner release gate

Update architecture sections 22/25, the release guide and real-application handoff to distinguish historical alpha.4 confirmations from alpha.5 checks. Provide CE1–CE9 notes, migration ordering and backup/rollback guidance for both runtimes. No new DDL is introduced here, but migrations and composite content changes since alpha.4 must be covered. Forward migrations do not promise binary-only rollback; restoring matching configuration/database/media backups is the documented boundary.

Report artifact acceptance separately from real VPS/Cloudflare deployment readiness. If required owner checks remain, state the candidate is prepared for those checks, not fully release-ready. No npm publish, GHCR push, remote release creation or deployment occurs during this preparation change. Publication later uses the saved verified artifacts and the existing recovery procedure; it never repacks them or changes `latest`.

## Risks / Trade-offs

- Broad coordinate changes can leave stale generated guides or registry metadata → run existing release graph checks and focused generator/release tests.
- Dynamic current-version tests could hide upgrade regressions → preserve historical-source fixtures and assertions about plan contents, conflicts, apply behavior and repeated runs.
- Container builds or artifact acceptance may fail after source checks → retain partial diagnostic output, report the failure and retry only with distinct destinations under existing collision rules.
- Two accepted tooling advisories remain (braces and esbuild) → retain their existing explicit usage restrictions and rerun policy checks; do not claim a clean vulnerability count.
- Local artifact checks cannot prove live Cloudflare/VPS operation → preserve the owner handoff and do not relabel alpha.4 evidence as alpha.5 evidence.

## Migration Plan

1. Update source coordinates, generated contract and tests; document changes since alpha.4 and verify the full source gates.
2. Capture a reviewed clean source revision, prepare the new immutable inventory, independently verify it and run exact-artifact acceptance.
3. Record evidence and any remaining owner-operated deployment/publication prerequisites. Stop at the preparation handoff.
4. On a later explicit publication request, recheck rights and registry coordinates, publish the saved artifacts using `next`, verify them and recover partial publication without overwriting existing versions. Live upgrades use backups and explicit forward migrations; rollback restores a matching backup where downgrade is unsupported.

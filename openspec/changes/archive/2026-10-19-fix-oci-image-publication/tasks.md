## 1. Exact image-graph matching

- [x] 1.1 Add regression fixtures for the observed alpha.7 OCI index shape, its runtime/attestation children, legacy config-ID manifests and flattened/nested final indexes; verify current code reproduces the reported rejection and tests cover conflicting root/config/child digests, duplicate/wrong platforms, unrelated attestations and missing children.
- [x] 1.2 Implement shared bounded image-graph identity resolution for config-ID and index-ID inventories, verifying raw manifest bytes and immutable child references; verify positive legacy/index cases and all negative graph cases without weakening digest, platform or authorization failures.
- [x] 1.3 Integrate graph checks into platform-tag resume, final index verification and independent public verification used by GitHub/cleanup; verify mocked partial publication skips the existing matching index, publishes only missing items and accepts the correctly assembled final graph while refusing conflicts before mutations or success receipts.

## 2. Recovery verification and documentation

- [x] 2.1 Update release recovery guidance with the OCI index/config distinction and unchanged alpha.7 artifact procedure; verify commands identify the original inventory and retain saved source, archive hashes and acceptance receipt without suggesting provenance removal or rebuilding.
- [x] 2.2 Run focused publication/image/lifecycle/cleanup tests, root typecheck, Oxlint, Oxfmt check and strict validation of `fix-oci-image-publication`; record passing results and resolve regressions before readiness.
- [x] 2.3 Inspect the actual uploaded API/amd64 tag read-only and run `pnpm release:publish:images --artifacts .release-artifacts/alpha-7 --dry-run`; verify it recognizes/skips the matching uploaded image, reports remaining missing tags without remote mutations and preserves the inventory/acceptance hashes, then record the handoff for a separately operated live resume.

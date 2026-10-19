## Context

See proposal.md. Read-only inspection of the real alpha.7 API/amd64 tag returned:

- Local `Id` and `Descriptor.digest`: `sha256:823736efeac6b9c8cfe73305cafc9a3657afeb6f379f1e84004b0287849e76f1`.
- Remote root media type: `application/vnd.oci.image.index.v1+json`.
- Runtime amd64 child: `sha256:429afc5e6d645a81bc4d8838d7b905efa0169f861c9694745ee5033ec491a63f`.
- Additional `unknown/unknown` attestation descriptor with `vnd.docker.reference.type=attestation-manifest`, bound to that runtime child by `vnd.docker.reference.digest`.
- Local source/version labels still identify shipping source `665bd3499b49180a0873881bd9a93bb2722f556a` and alpha.7.

`matchingImage` currently compares only `remote.config.digest` with inventory `imageId`. `matchingIndex` requires exactly two descriptors and applies that same comparison to children. Therefore fixing only the first comparison would leave flattened final indexes and independent verification broken. Existing tests model config-ID manifests, so they did not exercise the real containerd representation. Accepted artifact identity and immutability remain authoritative.

## Goals / Non-Goals

**Goals:** recognize the exact saved image graph across supported Docker stores and carry that identity through resume, final assembly and read-only public verification.

**Non-Goals:** change inventory IDs, strip attestations, disable provenance, switch to a newly rebuilt image, weaken conflict handling, publish remotely during repair or change CMS/runtime packages.

## Decisions

1. **Keep content-addressed identity at its actual level.** Preserve support for config-ID inventories through the existing config digest match. For an index-ID inventory, require the inspected root digest to equal the saved ID; validate its supported image graph and expected platform rather than treating a missing config as acceptable. Verify inspected raw manifest bytes against their digest, including Docker CLI and anonymous HTTP inspection paths. Never accept an arbitrary index merely because one child looks plausible.
2. **Resolve expected runtime descriptors from verified saved identities.** A per-platform index includes its runtime manifest and associated attestations. Resolve the graph through immutable digest references, enforce the inventory platform, and retain the verified expected runtime and auxiliary descriptor identities. Use bounded traversal and reject malformed graphs, cycles, ambiguous/duplicate runtime platforms, unrelated artifacts and unavailable children. Share helpers between publication and `release-verify-published` to prevent divergent trust rules.
3. **Verify flattened and supported nested assembly by exact graph membership.** Buildx may flatten source indexes into the final multi-platform index. Compare each expected runtime child and its platform to the verified per-platform graph, rather than comparing a child config digest to the original wrapper index ID. Only accept auxiliary attestation descriptors established by those verified input graphs and bound to expected runtime digests; unknown/unknown is not a blanket exemption. Reject missing/extra/changed runtime or auxiliary descriptors, duplicates and mismatches before a complete receipt or GitHub/cleanup approval.
4. **Preserve recovery without mutation during validation.** The existing API/amd64 index must be recognized and skipped, not replaced. A publication dry-run may report other missing platform/final tags without loading, tagging, pushing, creating manifests or writing publication receipts. Test normal push/resume/finalization paths with controlled registries/commands. Use the original alpha.7 inventory and acceptance receipt unchanged; no engine or acceptance rerun is required for a publication-only script repair.

## Risks / Trade-offs

- Attestations resemble extra platforms → distinguish expected auxiliary descriptors using verified graph identity and annotations, not only `unknown/unknown`.
- Legacy stores identify configs while containerd identifies indexes → retain regression fixtures for both and explicit negative config/root/child mismatches.
- Nested indexes or malformed metadata can cause excessive inspection → memoize digest reads and bound traversal; missing or unauthorized inspection remains a failure.
- A tag can move between reads → resolve children by immutable digest and check raw bytes; never force-replace a conflicting version tag.
- Different verifier paths can disagree → exercise publication, independent verification and lifecycle/cleanup consumers against the same graph fixtures.

## Migration Plan

No artifact or database migration. Run focused tooling tests and root gates, then read-only inspect the already-uploaded alpha.7 API/amd64 index and run `release:publish:images --dry-run` against the original inventory. Confirm matching-image skip and remaining publication plan, and record unchanged inventory/acceptance hashes. The operator can subsequently resume the original live command after reviewing the repair; live publication is outside this change's repair verification.

## Why

Alpha.7 image publication uploads the accepted API/amd64 image successfully, then rejects its identical registry digest because the matcher assumes every saved Docker image ID is a config digest. The actual containerd image store reports an OCI index ID with a runtime manifest and build attestation; that index has no `config` member.

## What Changes

- Correct existing publication identity checks for both legacy config IDs and OCI index IDs, including attestation-bearing per-platform indexes and flattened multi-platform publication.
- Share the corrected verification rules with independent public verification, GitHub finalization and cleanup prerequisites so matching bytes are consistently recognized and conflicting bytes still fail closed.
- Cover real-shaped index/attestation fixtures, negative identity/platform cases and partial-publication resume in focused regression tests.
- Document safe recovery using the existing alpha.7 inventory and archives. Do not rebuild, replace or re-label the saved artifact source to repair tooling.

This is release-tooling repair session OCI1, following Alpha7 preparation. It restores the accepted exact-artifact publication/resume behavior in `alpha-release-artifacts`, consistent with architecture sections 22 and 25. No product capability, artifact format, immutable-version policy or authorization boundary changes; `skip_specs: true` is appropriate for this tooling bug fix. The completed Alpha7 change and unapplied video change remain separate.

Non-goals: live registry mutation in this repair, changing image build/provenance settings, disabling verification, rebuilding accepted artifacts, dependency upgrades, runtime feature changes, release cleanup or archiving.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Existing exact-identity, platform, resume and publication requirements remain unchanged.

## Impact

`scripts/release-publish.mjs`, `scripts/release-verify-published.mjs`, related release/publication/lifecycle/cleanup tests, and internal release recovery documentation. A shared helper may be introduced if needed to keep registry inspection paths consistent. npm publication, saved inventories, package/image bytes, source fingerprints and acceptance receipts remain unchanged. No remote push, tag replacement, manifest creation or publication receipt is authorized by the repair verification phase.

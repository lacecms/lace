## Context

See proposal. The local rc3 tag precedes admin polish and the CLI import fix. `release/alpha.json` still selects rc3, records published versions only through rc2, and specifies template 0.48.0. The only retained published upgrade fixtures are rc2's 0.47.0. The accepted fixture requirement simultaneously says latest published and specifically requires rc2; this change reconciles those statements after verification without changing ADR 0030's support floor.

## Goals / Non-Goals

**Goals:** Leave a coherent, tested repository source candidate and clear evidence of what remains before publication.

**Non-Goals:** Artifact preparation, image builds, publication, exact-artifact acceptance, deployment checks, new product work and changes to the supported release floor.

## Decisions

1. Verify the complete public rc3 set and GitHub source, and check rc4 availability with dated read-only evidence before changing history or assuming coordinates are free. A local tag alone is insufficient. Stop dependent steps on incomplete or conflicting evidence. Availability does not reserve a version.
2. Select package/generator/image `0.1.0-rc4`, `next`, and template `0.49.0` (the next version after 0.48.0). Synchronize public manifests, source version defaults, Docker defaults, registry requirements, templates, lockfile and generated snapshots. The existing release checker and plan detect drift; private packages remain private. Do not merely edit release metadata.
3. Obtain the published rc3 generator and record its package integrity, archive digest and source revision before generating both historical fixtures. Replace rc2 fixtures only after provenance is established, preserving generic upgrade tests. Retaining rc2 alone would contradict the latest-published requirement; changing the support floor would contradict the owner's rc2 decision.
4. Review the complete diff from the rc3 tag for the changelog and upgrade instructions. Describe actual operator actions, including existing rc2-to-current gallery guidance, without inventing a database migration or treating a local candidate as published. Update relevant current documentation and `verifiedAgainst` only to the extent supported by source verification.
5. Run focused checks and required repository gates without invoking commands that pack release archives or build images. Record results and distinguish source verification from later clean-source preparation, two-platform smoke, exact-artifact acceptance and real deployment. A full artifact gate cannot be claimed here.

## Risks / Trade-offs

- [Registry unavailable or rc4 occupied] → Record dated failure and stop the affected step; do not guess or overwrite immutable coordinates.
- [Historical fixture provenance or rc3 publication incomplete] → Retain existing fixtures and report the blocker; never reconstruct a published fixture from workspace source.
- [Candidate appears ready to publish despite no artifact checks] → Explicitly mark repository-only readiness and list remaining owner gates in the handoff.
- [Unrelated active change] → Leave `rf07d-naming-hygiene` untouched; inspect working-tree status before edits.

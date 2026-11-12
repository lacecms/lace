## Why

The owner requests repository preparation for `0.1.0-rc4`. The selected candidate is still rc3 and changes since its tag include admin collection/navigation polish and an import media concurrency fix; release coordinates and guidance must be coherent before artifacts are built.

## What Changes

- Verify rc3 publication and rc4 availability; record rc3 as immutable only on complete evidence. Select rc4 on `next`, update all coordinated versions and advance the ownership template with upgrade guidance.
- Replace the retained published-template fixtures with exact published rc3 generator output, after verifying its provenance; preserve rc2 as the oldest supported release and generic upgrade safety.
- Update release notes, consumer documentation, snapshots and local release instructions to describe the candidate and its actual changes. Run repository-level verification and leave an honest handoff.
- Do not build release packages or images, run exact-artifact acceptance, publish, create tags/releases, or claim artifact or deployment readiness. These remain subsequent owner operations.

This is an owner-requested release checkpoint outside the RF roadmap units; it does not advance the independent active RF7D change. Architecture §§7, 19–22 and 25 and the `alpha-release-artifacts`, `project-generator`, `public-documentation`, and `generated-project-acceptance` contracts govern the work.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `generated-project-acceptance`: correct the release-specific fixture example and scenario to match the latest verified published generator while retaining the rc2 support floor.

## Impact

Release metadata, public manifests, generator templates and upgrade metadata, registry requirements, runtime/Docker defaults, generated snapshots, published-template fixtures, lockfile, changelog and release/consumer documentation are affected. Registry access is a read-only dependency; missing or conflicting publication evidence blocks the dependent changes rather than inventing provenance. No API or support-policy change is intended.

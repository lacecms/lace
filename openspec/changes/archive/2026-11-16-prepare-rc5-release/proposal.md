## Why

The owner requests repository preparation for `0.1.0-rc5`, while the release model still selects rc4. Changes since the rc4 tag include a database migration, authentication and API corrections, outbox dispatch, and production ingress changes that need coordinated release and upgrade guidance.

## What Changes

- Verify rc4 publication and rc5 coordinate availability with dated read-only evidence; select rc5 on `next` and update the coordinated package, image, generator and template coordinates.
- Reconcile the published rc4 generator and its retained fixtures with their recorded provenance; preserve the rc2 support floor. Advance the current ownership template only if required by the template changes and release policy.
- Document the migration and breaking production Compose ingress transition, authentication/API changes and other user-visible changes since rc4; update changelog, compatibility, release instructions and consumer documentation without implying publication.
- Align the related Better Auth OAuth dependencies and lockfile to repair the MCP compatibility gate, and run that gate in CI so future dependency drift is caught.
- Run the applicable source, documentation and release-model gates and record their results and outstanding owner-operated artifact and acceptance gates.
- Do not prepare release packages or images, publish, create tags or releases, or deploy. The owner performs those steps.

This owner-requested release checkpoint is outside roadmap session units and does not start an unfinished extensibility session. Architecture §§7, 19–22 and 25 and the accepted `alpha-release-artifacts`, `project-generator`, `generated-project-acceptance` and `public-documentation` specifications govern it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This selects a candidate and documents existing accepted behavior; it does not change capability requirements.

## Impact

Release metadata, public manifests, generated template assets and snapshots, version assertions, image defaults, registry metadata, dependency catalog and lockfile, CI, changelog and release and consumer documentation may need updates. Registry availability and immutable publication provenance are read-only dependencies; inaccessible or conflicting evidence must be reported rather than fabricated.

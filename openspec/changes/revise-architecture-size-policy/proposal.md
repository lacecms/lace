## Why

The existing directory ceiling has reached 2,499 of fewer than 2,500 counted lines, leaving no room for an additional architectural invariant. A review threshold and a meaningful per-file limit can preserve readability without preventing the architecture from evolving.

## What Changes

- Warn, without failing checks, when the directory exceeds 3,000 nonblank lines outside fenced Mermaid diagrams.
- Fail when a file exceeds 600 lines outside fenced Mermaid diagrams, including blank lines.
- Document architecture maintenance, ownership of details and decisions, and review and splitting practices in the architecture README.
- Preserve the other architecture guards, stable section identifiers and existing invariants.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-governance`: Revise architecture size counting, thresholds and diagnostic behavior.

## Impact

- `tests/architecture-document.test.mjs` and focused coverage of counting and diagnostic boundaries; `docs/architecture/README.md`; the accepted workspace-governance specification on eventual sync.
- Architecture §1 establishes authority and §24 points to ADRs. This change is a standalone maintenance session requested by the owner, not an existing roadmap unit. It has no dependency on the active OpenAPI change.
- No product behavior, dependency, deployment, or section-number changes; no archival or relocation of invariants is in scope.

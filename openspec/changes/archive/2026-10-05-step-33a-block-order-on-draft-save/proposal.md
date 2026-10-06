## Why

Step 33, session 33A fixes the alpha.2 field-trial failure in docs/lace-alpha-2-feedback.md §1: the editor moves array elements but carries their old positions, so Save rejects the displayed order. The same mismatch affects middle insertion and duplication.

## What Changes

- Derive sparse positions (1,000 increments) from the displayed array at the editor save boundary, retaining keys, data, type and schema version; reuse this representation for copied recovery JSON.
- Preserve strict server validation; ordering failures identify the zero-based index and a bounded safe stable key, give a correction, and reach the editor with the request ID and recovery advice without discarding edits.
- Prove structural operations through browser save/reload/publication and verify persisted export and Astro output order.
- Scope is only 33A. No server sorting, schema migrations, release refresh, build-status changes or other 33B–33H work.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-draft-editor`: derive save positions from visible order and explain ordering rejection while preserving local work.
- `content-domain-rules`: include safe actionable block-order diagnostics while continuing to reject invalid ordering.

## Impact

Depends on completed Step 32. Preserves architecture §9.5 (flat sparse ordering), §9.3 (draft/publication isolation), and the admin editor requirements. Changes stay in apps/admin, packages/domain and packages/contracts; shared HTTP errors currently replace domain messages and need a narrow safe ordering exception. Tests cover the portable domain, admin unit/browser flows and real content persistence/export/rendering. No dependency or REST DTO changes, database migrations, or runtime-specific logic; Node and D1 retain identical validation.

## Why

Pre-1.0 audit item 5 measured 34, 56, 100 and 1,112 D1 statements for detaching media from 1, 2, 4 and 50 simple drafts respectively, before HTTP authentication. Lace admits up to 50 using entries and budgets 50 statements for an entire Worker invocation. [Audit, item 5](page://page_422b3a21dfd08191b6efbf905d01ba3b) · [Architecture §16](../../../../docs/architecture/runtimes.md)

## What Changes

- **BREAKING** for direct clients of `DELETE ...?detach=drafts`: a referenced, eligible item returns a reviewable work list. Advance it with one request per identified draft, then explicitly finish to receive the existing `202` deletion receipt. Plain deletion and retry retain their contracts.
- Admin drives these requests after one confirmation and can resume interrupted work after reopening the tab. Committed draft revisions and the reference projection record the actual progress.
- Preserve the 50-entry admission boundary, both write permissions, guarded draft saves and the final atomic deletion/outbox guard. Verify the production HTTP path on both runtimes and count all D1 statements per Worker invocation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `media-use-cases` — admit, detach one named draft, and finish under live guards. [Accepted spec](../../../specs/media-use-cases/spec.md)
- `rest-contracts` — define the intermediate response, bounded requests and final receipt. [Accepted spec](../../../specs/rest-contracts/spec.md)
- `admin-media-library` — drive and resume the confirmed set of drafts. [Accepted spec](../../../specs/admin-media-library/spec.md)
- `d1-content-repositories` — bound every authenticated invocation, including post-commit work. [Accepted spec](../../../specs/d1-content-repositories/spec.md)

## Impact

This is one audit correction independent of EX5. It spans the portable use cases, shared SQLite reads and guarded writes, Node and D1 adapters, HTTP contracts, Admin and their acceptance fixtures. It relies on the current reference projection and deletion dispatcher. Background detach jobs, physical object removal policy and database schema changes are outside the change. [Architecture §9.7](../../../../docs/architecture/data-model.md) · [Architecture §12](../../../../docs/architecture/api.md) · [Active roadmap](../../../../docs/extensibility-roadmap.md)
